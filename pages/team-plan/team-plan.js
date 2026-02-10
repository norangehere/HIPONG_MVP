function getCenter(points) {
  if (!points || !points.length) return null;
  const lat = points.reduce((s, p) => s + (p.latitude || 0), 0) / points.length;
  const lng = points.reduce((s, p) => s + (p.longitude || 0), 0) / points.length;
  return { latitude: lat, longitude: lng };
}

const km2m = km => Math.max(0, Number(km || 0)) * 1000;

const DEFAULT_LOCATION = {
  latitude: 30.27415,
  longitude: 120.15515,
  name: '杭州西湖 (默认位置)',
  address: '因定位失败，已使用默认出发点'
};

const pad = n => String(n).padStart(2, '0');
const fmtDate = (d) => {
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${y}-${m}-${day}`;
};
const TODAY = fmtDate(new Date());

import loginController from '../../utils/login.js';

const { BASE_URL } = require('../../config/config.js');

Page({
  data: {
    // 地图相关
    mapState: { latitude: 30.27415, longitude: 120.15515, scale: 14, markers: [], circles: [] },
    mapCenter: { latitude: 30.27415, longitude: 120.15515 },

    // 步骤控制
    currentStep: 0,
    stepTitles: ['基本信息', '地点设置', '个性化需求'],

    // 个性化标签示例（替换原固定团建类型）
    typeOptions: ['有蹦床的公园', '可以溜冰的商场'],

    // 选中类型的文本显示
    selectedTypesText: '无',

    // 选中状态映射对象
    selectedTypesMap: {},

    // 进度百分比
    progressPercentage: 0,

    // 搜索相关
    searchKeyword: '',
    searchResults: [],

    // 生成状态相关
    isGenerating: false,
    generateButtonText: '生成团建方案',
    loadingDots: '',
    pollingTimer: null,

    // 星星动画相关
    burstStars: [],
    starAnimationTimer: null,
    gifX: 300, // GIF的初始X坐标 (可以随便设置一个值)
    gifY: 500, // GIF的初始Y坐标 (可以随便设置一个值)

    // 表单数据
    form: {
      planName: '',
      origin: { name: '', latitude: null, longitude: null, address: '' },

      // 范围
      distance: 10,
      maxTransitTime: 30,
      taxiTime: 30,

      // 预算
      budgetMode: 'total',   // 'total' | 'percapita'
      budgetMin: '',
      budgetMax: '',
      peopleCount: 10, // 默认人数

      // 日期区间 + 条件时间段
      startDate: TODAY,
      endDate: TODAY,
      startTime: '14:00',
      endTime: '21:00',

      // 类型选择
      types: [],
      customTypes: '',
      customTypeList: [], // 新增：存储自定义类型列表

      // 新增：其他备注
      otherNotes: ''
    }
  },

  onLoad() {
    this.getCurrentLocation();
    this.updateProgress();
  },

  onUnload() {
    // 页面卸载时清理定时器
    if (this.data.pollingTimer) {
      clearInterval(this.data.pollingTimer);
    }
    if (this.data.starAnimationTimer) {
      clearInterval(this.data.starAnimationTimer);
    }
  },

  // 更新进度百分比
  updateProgress() {
    const totalSteps = this.data.stepTitles.length;
    const currentStep = this.data.currentStep;
    const progressPercentage = Math.round(((currentStep + 1) / (totalSteps)) * 100);
    this.setData({ progressPercentage });
  },

  // 步骤导航
  onSwiperChange(e) {
    this.setData({ currentStep: e.detail.current }, () => {
      this.updateProgress();
    });
  },

  onPrevStep() {
    if (this.data.currentStep > 0) {
      this.setData({ currentStep: this.data.currentStep - 1 }, () => {
        this.updateProgress();
      });
    }
  },

  onNextStep() {
    if (this.data.currentStep < this.data.stepTitles.length - 1) {
      this.setData({ currentStep: this.data.currentStep + 1 }, () => {
        this.updateProgress();
      });
    }
  },

  // 步骤1: 计划名称
  onPlanNameInput(e) {
    this.setData({
      'form.planName': e.detail.value
    });
  },

  // 步骤2: 地图相关
  getCurrentLocation() {
    tt.getLocation({
      type: 'gcj02',
      success: (res) => {
        const { latitude, longitude } = res;
        this.setData({
          'form.origin.latitude': latitude,
          'form.origin.longitude': longitude,
          'form.origin.name': '当前位置',
          'form.origin.address': '正在获取地址...',
          mapCenter: { latitude, longitude },
          'mapState.latitude': latitude,
          'mapState.longitude': longitude
        });
        this.updateMarkers();
        this.reverseGeocode(latitude, longitude);
      },
      fail: () => {
        console.log('定位失败，使用默认位置');
        this.setData({
          'form.origin': DEFAULT_LOCATION,
          mapCenter: { latitude: DEFAULT_LOCATION.latitude, longitude: DEFAULT_LOCATION.longitude },
          'mapState.latitude': DEFAULT_LOCATION.latitude,
          'mapState.longitude': DEFAULT_LOCATION.longitude
        });
        this.updateMarkers();
        tt.showToast({ title: '定位失败，已使用默认位置', icon: 'none', duration: 2000 });
      }
    });
  },

  onMapTap(e) {
    const { latitude, longitude } = e.detail;
    this.setData({
      'form.origin.latitude': latitude,
      'form.origin.longitude': longitude,
      'form.origin.name': '选择的位置',
      'form.origin.address': '正在获取地址...',
      mapCenter: { latitude, longitude },
      'mapState.latitude': latitude,
      'mapState.longitude': longitude
    });
    this.updateMarkers();
    this.reverseGeocode(latitude, longitude);
  },

  onMarkerTap(e) {
    console.log('Marker tapped:', e.detail);
  },

  updateMarkers() {
    const { latitude, longitude } = this.data.form.origin;
    if (latitude && longitude) {
      const markers = [{
        id: 1,
        latitude,
        longitude,
        title: this.data.form.origin.name,
        iconPath: 'https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/ip.png',
        width: 30,
        height: 30
      }];
      this.setData({ 'mapState.markers': markers });
    }
  },

  reverseGeocode(latitude, longitude) {
    // 这里可以调用逆地理编码API获取地址
    // 暂时使用模拟数据
    setTimeout(() => {
      const lat = Number(latitude);
      const lng = Number(longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        this.setData({
          'form.origin.address': `纬度: ${lat.toFixed(6)}, 经度: ${lng.toFixed(6)}`
        });
      }
    }, 1000);
  },

  // 搜索相关方法
  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value });
  },

  onSearchConfirm() {
    const keyword = this.data.searchKeyword.trim();
    if (!keyword) {
      tt.showToast({ title: '请输入搜索关键词', icon: 'none' });
      return;
    }

    this.searchPlaces(keyword);
  },

  searchPlaces(keyword) {
    tt.showLoading({ title: '搜索中...' });

    // 使用高德地图搜索API
    tt.request({
      url: 'https://restapi.amap.com/v3/place/text',
      data: {
        key: 'cab64b3805d73cc68ab8e63bbd81eaa7', // 使用现有的高德API Key
        keywords: keyword,
        city: '全国',
        page: 1,
        offset: 10,
        extensions: 'all'
      },
      success: (res) => {
        tt.hideLoading();
        if (res.data && res.data.status === '1' && res.data.pois) {
          const results = res.data.pois.map(poi => ({
            name: poi.name,
            address: poi.address,
            latitude: parseFloat(poi.location.split(',')[1]),
            longitude: parseFloat(poi.location.split(',')[0]),
            id: poi.id
          }));
          this.setData({ searchResults: results });
        } else {
          tt.showToast({ title: '搜索失败，请重试', icon: 'none' });
          this.setData({ searchResults: [] });
        }
      },
      fail: (err) => {
        tt.hideLoading();
        console.error('搜索请求失败:', err);
        tt.showToast({ title: '网络错误，请重试', icon: 'none' });
        this.setData({ searchResults: [] });
      }
    });
  },

  onSelectSearchResult(e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;

    // 设置选中的位置
    this.setData({
      'form.origin.name': item.name,
      'form.origin.address': item.address,
      'form.origin.latitude': item.latitude,
      'form.origin.longitude': item.longitude,
      'mapCenter': { latitude: item.latitude, longitude: item.longitude },
      'mapState.latitude': item.latitude,
      'mapState.longitude': item.longitude,
      searchResults: [] // 清空搜索结果
    });

    this.updateMarkers();
    tt.showToast({ title: '已选择出发点，可继续在地图上调整或点击下一步', icon: 'none', duration: 2000 });
  },

  zoomIn() {
    const scale = Math.min(this.data.mapState.scale + 1, 20);
    this.setData({ 'mapState.scale': scale });
  },

  zoomOut() {
    const scale = Math.max(this.data.mapState.scale - 1, 3);
    this.setData({ 'mapState.scale': scale });
  },

  // 步骤3: 时间选择
  onStartDateChange(e) {
    const startDate = e.detail.value;
    const endDate = this.data.form.endDate;

    // 如果开始日期和结束日期不同，调整时间
    if (endDate && startDate !== endDate) {
      this.setData({
        'form.startDate': startDate,
        'form.startTime': '09:00', // 第一天开始时间
        'form.endTime': '18:00'    // 最后一天结束时间
      });
    } else {
      this.setData({ 'form.startDate': startDate });
    }
  },

  onEndDateChange(e) {
    const endDate = e.detail.value;
    const startDate = this.data.form.startDate;

    // 如果开始日期和结束日期不同，调整时间
    if (startDate && startDate !== endDate) {
      this.setData({
        'form.endDate': endDate,
        'form.startTime': '09:00', // 第一天开始时间
        'form.endTime': '18:00'    // 最后一天结束时间
      });
    } else {
      this.setData({ 'form.endDate': endDate });
    }
  },

  onStartTimeChange(e) {
    const startTime = e.detail.value;
    this.setData({ 'form.startTime': startTime });
  },

  onEndTimeChange(e) {
    const endTime = e.detail.value;
    this.setData({ 'form.endTime': endTime });
  },

  // 步骤4: 范围选择
  onDistanceChanging(e) {
    this.setData({ 'form.distance': e.detail.value });
  },

  onDistanceChange(e) {
    this.setData({ 'form.distance': e.detail.value });
  },

  onTransitChange(e) {
    this.setData({ 'form.maxTransitTime': e.detail.value });
  },

  onTaxiChange(e) {
    this.setData({ 'form.taxiTime': e.detail.value });
  },

  // 步骤5: 预算选择
  onBudgetModeChange(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ 'form.budgetMode': mode });
  },

  onBudgetMinInput(e) {
    this.setData({ 'form.budgetMin': e.detail.value });
  },

  onBudgetMaxInput(e) {
    this.setData({ 'form.budgetMax': e.detail.value });
  },

  onPeopleCountInput(e) {
    this.setData({ 'form.peopleCount': e.detail.value });
  },

  // 步骤6: 类型选择
  onTypeToggle(e) {
    const type = e.currentTarget.dataset.type;

    if (!type) {
      return;
    }

    const types = [...this.data.form.types];
    const index = types.indexOf(type);

    if (index > -1) {
      types.splice(index, 1);
    } else {
      types.push(type);
    }

    // 更新选中状态映射对象
    const selectedTypesMap = {};
    types.forEach(type => {
      selectedTypesMap[type] = true;
    });

    // 更新选中类型的显示文本
    const selectedTypesText = types.length > 0 ? types.join(', ') : '无';

    this.setData({
      'form.types': types,
      'selectedTypesMap': selectedTypesMap,
      'selectedTypesText': selectedTypesText
    });
  },

  onCustomTypesInput(e) {
    this.setData({ 'form.customTypes': e.detail.value });
  },


  onAddCustomType() {
    const customType = this.data.form.customTypes.trim();
    if (!customType) {
      tt.showToast({ title: '请输入自定义类型', icon: 'none' });
      return;
    }

    // 检查是否已存在（包括预设类型和自定义类型）
    const allTypes = [...this.data.typeOptions, ...this.data.form.customTypeList];
    if (allTypes.includes(customType)) {
      tt.showToast({ title: '该类型已存在', icon: 'none' });
      return;
    }

    // 添加到自定义类型列表
    const customTypeList = [...this.data.form.customTypeList, customType];

    // 自动选中新添加的类型
    const selectedTypesMap = { ...this.data.selectedTypesMap };
    selectedTypesMap[customType] = true;

    // 更新选中类型的文本显示
    const selectedTypes = Object.keys(selectedTypesMap).filter(type => selectedTypesMap[type]);
    const selectedTypesText = selectedTypes.length > 0 ? selectedTypes.join(', ') : '无';

    this.setData({
      'form.customTypeList': customTypeList,
      'form.customTypes': '', // 清空输入框
      'selectedTypesMap': selectedTypesMap,
      'selectedTypesText': selectedTypesText
    });

    tt.showToast({ title: '添加并选中成功', icon: 'success' });
  },

  onRemoveCustomType(e) {
    const typeToRemove = e.currentTarget.dataset.type;

    // 从自定义类型列表中移除
    const customTypeList = this.data.form.customTypeList.filter(type => type !== typeToRemove);

    // 从已选择的类型中移除（如果被选中了）
    const types = this.data.form.types.filter(type => type !== typeToRemove);

    // 更新选中状态映射对象
    const selectedTypesMap = {};
    types.forEach(type => {
      selectedTypesMap[type] = true;
    });

    // 更新选中类型的显示文本
    const selectedTypesText = types.length > 0 ? types.join(', ') : '无';

    this.setData({
      'form.customTypeList': customTypeList,
      'form.types': types,
      'selectedTypesMap': selectedTypesMap,
      'selectedTypesText': selectedTypesText
    });
  },

  // 步骤7: 其他备注
  onOtherNotesInput(e) {
    this.setData({ 'form.otherNotes': e.detail.value });
  },

  // 开始加载动画
  startLoadingAnimation() {
    // 保持文字为"生成中"，不进行动态点动画
    this.setData({
      generateButtonText: '生成中（预计需要3分钟）'
    });

    // 返回null，因为不需要定时器
    return null;
  },

  // 停止加载动画
  stopLoadingAnimation() {
    // 清理星星动画定时器
    if (this.data.starAnimationTimer) {
      clearInterval(this.data.starAnimationTimer);
    }

    this.setData({
      isGenerating: false,
      generateButtonText: '生成团建方案',
      loadingDots: '',
      burstStars: [],
      starAnimationTimer: null
    });
  },

  // 生成星星迸发动画
  generateStarBurst() {
    const animations = ['star-burst-1', 'star-burst-2', 'star-burst-3', 'star-burst-4',
      'star-burst-5', 'star-burst-6', 'star-burst-7', 'star-burst-8'];

    // 生成8个星星，每个都有不同的动画和延迟
    const stars = animations.map((animation, index) => ({
      animation: animation,
      delay: index * 0.1 // 每个星星延迟0.1秒
    }));

    this.setData({ burstStars: stars });
  },

  // 开始星星动画
  startStarAnimation() {
    // 立即生成第一波星星
    this.generateStarBurst();

    // 每1.5秒生成一波新的星星
    const starTimer = setInterval(() => {
      if (this.data.isGenerating) {
        this.generateStarBurst();
      } else {
        clearInterval(starTimer);
      }
    }, 1500);

    this.setData({ starAnimationTimer: starTimer });
  },

  // 轮询检查方案生成状态
  startPolling(planId) {
    const pollInterval = 5000; // 每2秒轮询一次
    const maxPollTime = 300000; // 最大轮询时间60秒
    let pollCount = 0;
    const maxPollCount = maxPollTime / pollInterval;

    const pollingTimer = setInterval(() => {
      pollCount++;

      if (pollCount > maxPollCount) {
        // 超时处理
        clearInterval(pollingTimer);
        this.stopLoadingAnimation();
        tt.showToast({ title: '生成超时，请重试', icon: 'none' });
        return;
      }

      // 发起轮询请求
      tt.request({
        url: `${BASE_URL}/api/plan-status/${planId}`,
        method: 'GET',
        success: (res) => {
          console.log('轮询状态响应:', res.data);

          if (res.data?.ready) {
            // 生成完成
            clearInterval(pollingTimer);
            this.stopLoadingAnimation();

            if (res.data?.planSuccess) {
              // 生成成功
              const { form } = this.data;
              tt.setStorage({
                key: 'lastTeamPlanForm',
                data: { form, generatedPlan: res.data.data },
                success: () => {
                  tt.showToast({ title: '方案生成成功！', icon: 'success' });
                  // 跳转到方案生成页面
                  tt.navigateTo({
                    url: '/pages/generate-teamplan/generate-teamplan'
                  });
                }
              });
            } else {
              // 生成失败
              tt.showToast({
                title: res.data?.error || '生成失败，请重试',
                icon: 'none'
              });
            }
          }
        },
        fail: (err) => {
          console.error('轮询请求失败:', err);
          // 轮询失败不立即停止，继续尝试
        }
      });
    }, pollInterval);

    this.setData({ pollingTimer });
  },

  // 生成方案
  onGeneratePlan() {
    // 防止重复点击
    if (this.data.isGenerating) {
      return;
    }

    const { form } = this.data;

    // 验证必填字段
    if (!form.planName.trim()) {
      tt.showToast({ title: '请输入计划名称', icon: 'none' });
      this.setData({ currentStep: 0 });
      return;
    }

    if (!form.origin.latitude || !form.origin.longitude) {
      tt.showToast({ title: '请选择出发点', icon: 'none' });
      this.setData({ currentStep: 1 });
      return;
    }

    if (!form.startDate || !form.endDate) {
      tt.showToast({ title: '请选择游玩日期', icon: 'none' });
      this.setData({ currentStep: 2 });
      return;
    }

    if (!form.budgetMin || !form.budgetMax) {
      tt.showToast({ title: '请设置预算区间', icon: 'none' });
      this.setData({ currentStep: 4 });
      return;
    }

    if (!form.peopleCount || form.peopleCount < 1) {
      tt.showToast({ title: '请输入参与人数', icon: 'none' });
      this.setData({ currentStep: 4 });
      return;
    }

    // 团建类型不再必填，跳过此校验

    // 设置生成状态
    this.setData({
      isGenerating: true,
      generateButtonText: '生成中'
    });

    // 开始加载动画
    const animationTimer = this.startLoadingAnimation();

    // 开始星星迸发动画
    this.startStarAnimation();

    // 准备请求数据
    const requestData = {
      name: form.planName,
      people: form.peopleCount, // 使用用户输入的人数
      budget: form.budgetMode === 'percapita'
        ? `${form.budgetMin}-${form.budgetMax}`
        : `${Number(form.budgetMin) / form.peopleCount}-${Number(form.budgetMax) / form.peopleCount}`,
      // 团建类型相关字段已移除
      timeRange: {
        start: form.startTime,
        end: form.endTime
      },
      dateRange: {
        start: form.startDate,
        end: form.endDate
      },
      needAccommodation: form.startDate !== form.endDate, // 多天行程需要住宿
      startLocation: form.origin.name,
      startLocationCoords: `${form.origin.longitude},${form.origin.latitude}`,
      distance: form.distance,
      maxTransitTime: form.maxTransitTime,
      taxiTime: form.taxiTime,
      // 备注改为个性化需求（可选）
      personalNeeds: form.otherNotes
    };

    console.log('准备发送团建方案生成请求:', requestData);

    // 从登录模块获取 token 和 userId，便于后端正确关联 creatorId
    try { loginController.initFromStorage && loginController.initFromStorage(); } catch (_) { }
    const _token = (loginController.getToken && loginController.getToken()) || '';
    const _ui = (loginController.getUserInfo && loginController.getUserInfo()) || {};
    const _userId = _ui.id || null;
    if (_userId) {
      requestData.userId = _userId;
    }

    // 发起方案生成请求
    tt.request({
      url: `${BASE_URL}/api/plan-teambuilding`,
      method: 'POST',
      data: requestData,
      header: {
        'Content-Type': 'application/json',
        ...(_token ? { 'Authorization': `Bearer ${_token}` } : {})
      },
      success: (res) => {
        console.log('方案生成请求响应:', res.data);

        if (res.data?.success && res.data?.planId) {
          // 开始轮询（不需要清理动画定时器，因为返回null）
          this.startPolling(res.data.planId);
        } else {
          // 请求失败
          this.stopLoadingAnimation();
          tt.showToast({
            title: res.data?.message || '生成失败，请重试',
            icon: 'none'
          });
        }
      },
      fail: (err) => {
        // 请求失败
        this.stopLoadingAnimation();
        tt.showToast({ title: '网络错误，请重试', icon: 'none' });
        console.error('API请求失败:', err);
      }
    });
  }
});