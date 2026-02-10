const { BASE_URL } = require('../../config/config.js');

Page({
  data: {
    form: {},
    generatedPlan: null,
    feedback: '',
    recoList: [],
    similarList: [],
    // 多天行程相关
    isMultiDay: false,
    currentDayIndex: 0,
    dayTabs: [],
    hotelInfo: null
  },

  onLoad(query) {
    // 如果带有 planId，优先加载计划详情作为模板
    if (query && query.planId) {
      this.loadPlanById(query.planId);
    } else {
      this.loadInitialData();
    }
  },

  // 通过后端接口按ID加载方案，作为模板查看/编辑
  loadPlanById(planId) {
    tt.showLoading({ title: '加载方案中...' });
    tt.request({
      url: `${BASE_URL}/api/plans/${planId}`,
      method: 'GET',
      success: (res) => {
        tt.hideLoading();
        if (res.data && res.data.success && res.data.data) {
          const plan = res.data.data;
          const details = plan.details || {};

          const isMultiDay = !!details.isMultiDay;
          const hotelInfo = details.hotel || null;
          const dayTabs = isMultiDay ? this.generateDayTabs(details.days) : [];
          const activities = details.activities || details?.days?.[0]?.activities || [];

          // 解析默认起点：取第一条活动的坐标
          let defaultOrigin = null;
          if (activities && activities.length > 0 && activities[0].location) {
            const loc = activities[0].location;
            const parts = typeof loc === 'string' ? loc.split(',') : [];
            const lng = parts.length > 0 ? parseFloat(parts[0]) : NaN;
            const lat = parts.length > 1 ? parseFloat(parts[1]) : NaN;
            if (Number.isFinite(lng) && Number.isFinite(lat)) {
              defaultOrigin = {
                name: activities[0].name || '起点',
                longitude: lng,
                latitude: lat
              };
            }
          }
          if (!defaultOrigin) {
            defaultOrigin = {
              name: '起点',
              longitude: 120.1552,
              latitude: 30.2741
            };
          }

          const defaultForm = {
            planName: plan.title || '团建方案',
            peopleCount: 10,
            origin: defaultOrigin,
            budgetMode: 'percapita',
            budgetMin: 0,
            budgetMax: 0,
            startTime: '14:00',
            endTime: '21:00',
            startDate: '',
            endDate: '',
            distance: 10,
            maxTransitTime: 60,
            taxiTime: 20,
            needAccommodation: !!isMultiDay
          };

          this.setData({
            form: defaultForm,
            planForm: { peopleCount: 10 },
            generatedPlan: {
              id: plan.id,
              title: plan.title,
              ...details
            },
            recoList: this.formatPlanItems(activities),
            similarList: this.getSimilarPlans(),
            isMultiDay: isMultiDay,
            hotelInfo: hotelInfo,
            dayTabs: dayTabs,
            currentDayIndex: 0,
            fromTemplate: true
          });

          tt.setStorage({
            key: 'lastTeamPlanForm',
            data: { form: defaultForm, generatedPlan: { id: plan.id, title: plan.title, ...details } }
          });
        } else {
          tt.showToast({ title: res.data?.message || '方案加载失败', icon: 'none' });
        }
      },
      fail: () => {
        tt.hideLoading();
        tt.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  loadInitialData() {
    tt.getStorage({
      key: 'lastTeamPlanForm',
      success: (res) => {
        if (!res.data) {
          tt.showToast({ title: '数据加载失败，请返回重试', icon: 'none' });
          setTimeout(() => tt.navigateBack(), 1500);
          return;
        }

        const { form, generatedPlan } = res.data;
        if (!form || !generatedPlan) {
          tt.showToast({ title: '数据不完整，请重新生成', icon: 'none' });
          return;
        }

        // 检查是否为多天行程
        const isMultiDay = generatedPlan?.isMultiDay || false;
        const hotelInfo = generatedPlan?.hotel || null;
        const dayTabs = isMultiDay ? this.generateDayTabs(generatedPlan?.days) : [];

        this.setData({
          form: form || {},
          planForm: form || {}, // 为模板提供数据
          generatedPlan: generatedPlan || null,
          recoList: this.formatPlanItems(generatedPlan?.activities || generatedPlan?.days?.[0]?.activities),
          similarList: this.getSimilarPlans(),
          isMultiDay: isMultiDay,
          hotelInfo: hotelInfo,
          dayTabs: dayTabs,
          currentDayIndex: 0
        });
      },
      fail: () => {
        tt.showToast({ title: '数据加载失败', icon: 'none' });
        setTimeout(() => tt.navigateBack(), 1500);
      }
    });
  },

  // 生成天标签
  generateDayTabs(days) {
    if (!days || !Array.isArray(days)) return [];
    return days.map(day => ({
      day: day.day,
      label: `第${day.day}天`,
      activities: day.activities || []
    }));
  },

  // 切换天
  onDayTabChange(e) {
    const index = e.currentTarget.dataset.index;
    const { generatedPlan, dayTabs } = this.data;

    if (index >= 0 && index < dayTabs.length) {
      const currentDay = dayTabs[index];
      this.setData({
        currentDayIndex: index,
        recoList: this.formatPlanItems(currentDay.activities)
      });
    }
  },


  formatPlanItems(activities) {
    if (!activities || !Array.isArray(activities)) return [];
    return activities.map((act, index) => {
      // 计算与上一个地点的距离
      let distance = '未知';
      if (act.travel && act.travel.walkingDistance !== undefined && act.travel.walkingDistance !== null) {
        const raw = parseFloat(act.travel.walkingDistance);
        distance = Number.isFinite(raw) ? raw.toFixed(2) : '未知';
      } else if (act.travel && act.travel.allInfo && act.travel.allInfo.walking) {
        const walk = act.travel.allInfo.walking;
        // 可能为字符串如 "1.23 km"，提取数字
        const raw = typeof walk.distance === 'string' ? parseFloat(walk.distance) : parseFloat(walk.distance || '');
        distance = Number.isFinite(raw) ? raw.toFixed(2) : '未知';
      }

      return {
        id: `act_${act.location || Math.random().toString(36).substr(2, 9)}`,
        placeId: act.id || act.location,                    // 地点ID（用于收藏）
        name: act.name,
        address: act.address || '',                         // 地点地址
        type: act.type || '',                               // 地点类型
        rating: act.rating || '暂无',                       // 地点评分
        cost: act.cost || '暂无',                           // 地点消费
        location: act.location || '',                       // 地点坐标
        time: act.time,                                     // e.g., "14:00-16:00"
        distance: distance,                                 // 与上一个地点的距离（保留两位小数，单位km）
        travelTime: act.travel?.duration || '未知',          // e.g., "15 分钟"
        travelMethod: this.getTravelMethod(act.travel),     // 新增：交通方式
        travelOptions: this.getTravelOptions(act.travel),   // 新增：交通选项
        photoUrl: act.photoUrl || '',                       // 修复：使用 photoUrl 而不是 imageUrl
        description: this.truncateText(act.description || '', 50), // 新增：地点介绍（最多50字）
        liked: false                                        // 收藏状态
      };
    });
  },

  // 工具：截断文字到指定长度，超出追加省略号
  truncateText(text, maxLen) {
    if (!text) return '';
    if (typeof text !== 'string') {
      try { text = String(text); } catch (_) { return ''; }
    }
    return text.length <= maxLen ? text : (text.slice(0, maxLen) + '…');
  },

  // 根据交通信息判断交通方式
  getTravelMethod(travelInfo) {
    if (!travelInfo || !travelInfo.duration) return '未知';

    const duration = travelInfo.duration;
    const timeMatch = duration.match(/(\d+)/);
    if (!timeMatch) return '未知';

    const minutes = parseInt(timeMatch[1]);

    // 根据时间判断交通方式
    if (minutes <= 5) return '步行';
    else if (minutes <= 15) return '骑行';
    else if (minutes <= 30) return '公交';
    else if (minutes <= 60) return '地铁';
    else return '驾车';
  },

  // 获取交通选项显示
  getTravelOptions(travelInfo) {
    if (!travelInfo || !travelInfo.displayOptions || travelInfo.displayOptions.length === 0) {
      // 如果没有交通信息，返回距离信息
      if (travelInfo && travelInfo.walkingDistance) {
        return [{
          type: 'distance',
          label: '距离',
          distance: travelInfo.walkingDistance,
          duration: '约' + travelInfo.walkingDistance + 'km'
        }];
      }
      return [];
    }

    return travelInfo.displayOptions.map(option => ({
      type: option.type,
      label: option.label,
      distance: option.info?.distance || '未知',
      duration: option.info?.duration || '未知'
    }));
  },

  // 收藏地点功能
  onFavoritePlace(e) {
    const index = e.currentTarget.dataset.index;
    const place = this.data.recoList[index];

    if (!place) {
      tt.showToast({ title: '地点信息错误', icon: 'none' });
      return;
    }

    const isLiked = place.liked;
    const action = isLiked ? '取消收藏' : '收藏';

    // 获取登录 token
    let _token = '';
    try {
      const lc = require('../../utils/login.js');
      const inst = lc && (lc.loginController || lc.default || lc);
      inst && inst.initFromStorage && inst.initFromStorage();
      _token = (inst && inst.getToken && inst.getToken()) || '';
    } catch (_) { }
    if (!_token) {
      tt.showToast({ title: '请先登录后再进行收藏', icon: 'none' });
      return;
    }

    tt.showLoading({ title: `${action}中...` });

    // 调用后端API
    tt.request({
      url: `${BASE_URL}/api/favorite-place`,
      method: 'POST',
      data: {
        placeId: place.placeId,
        placeName: place.name,
        placeAddress: place.address,
        placeType: place.type,
        placeRating: place.rating,
        placeCost: place.cost,
        placePhotoUrl: place.photoUrl,
        placeLocation: place.location,
        action: isLiked ? 'remove' : 'add'  // add: 收藏, remove: 取消收藏
      },
      header: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${_token}`
      },
      success: (res) => {
        tt.hideLoading();
        if (res.data && res.data.success) {
          // 更新本地状态
          const newRecoList = [...this.data.recoList];
          newRecoList[index].liked = !isLiked;
          this.setData({ recoList: newRecoList });

          tt.showToast({
            title: res.data.message || `${action}成功`,
            icon: 'success'
          });
        } else {
          tt.showToast({
            title: res.data?.message || `${action}失败`,
            icon: 'none'
          });
        }
      },
      fail: (err) => {
        tt.hideLoading();
        tt.showToast({ title: '网络错误，请重试', icon: 'none' });
        console.error('收藏地点API请求失败:', err);
      }
    });
  },

  getSimilarPlans() {
    return [
      {
        id: 's1',
        name: '海底捞（武林店）',
        transit: 42,
        drive: 20,
        price: 82,
        photoUrl: 'https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/%E6%B5%B7%E5%BA%95%E6%8D%9E.jpg'
      },
      {
        id: 's2',
        name: '肉本家',
        transit: 30,
        drive: 16,
        price: 95,
        photoUrl: 'https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/%E8%82%89%E6%9C%AC%E5%AE%B6.jpg'
      }
    ];
  },

  onFeedbackInput(e) {
    this.setData({ feedback: e.detail.value });
  },

  onRegenerate() {
    const { feedback, generatedPlan, form } = this.data;

    if (!form || !form.origin || !form.origin.latitude) {
      tt.showToast({ title: '缺少必要参数，请返回重试', icon: 'none' });
      this.loadInitialData();
      return;
    }

    if (!feedback) {
      tt.showToast({ title: '请输入调整意见', icon: 'none' });
      return;
    }

    const peopleCount = Number(form.peopleCount || 10);
    const regenerationData = {
      name: form.planName,
      people: peopleCount,
      budget: form.budgetMode === 'percapita'
        ? `${form.budgetMin || 0}-${form.budgetMax || 0}`
        : `${Number(form.budgetMin || 0) / peopleCount}-${Number(form.budgetMax || 0) / peopleCount}`,
      type: (form.types || []).join(','),
      teamType: (form.types || []).join(','), // 传入团建类型
      timeRange: {
        start: form.startTime || '14:00',
        end: form.endTime || '21:00'
      },
      dateRange: {
        start: form.startDate,
        end: form.endDate
      }, // 日期范围
      needAccommodation: form.needAccommodation || false, // 是否需要住宿
      startLocation: form.origin.name || '',
      startLocationCoords: `${form.origin.longitude},${form.origin.latitude}`,
      distance: form.distance || 10,
      maxTransitTime: form.maxTransitTime || 60,
      taxiTime: form.taxiTime || 20,
      feedback,
      previousPlan: generatedPlan,
      // 如果是从模板进入，则强制新建，不覆盖模板
      forceNew: this.data.fromTemplate ? true : false
    };

    tt.showLoading({ title: '重新生成中...' });

    // 从登录模块获取 token 和 userId，便于后端正确关联 creatorId
    try { const lc = require('../../utils/login.js'); lc && lc.loginController && lc.loginController.initFromStorage && lc.loginController.initFromStorage(); } catch (_) { }
    let _token = '';
    let _userId = null;
    try {
      const lc = require('../../utils/login.js');
      const inst = lc && (lc.loginController || lc.default || lc);
      _token = (inst && inst.getToken && inst.getToken()) || '';
      const _ui = (inst && inst.getUserInfo && inst.getUserInfo()) || {};
      _userId = _ui.id || null;
    } catch (_) { }
    if (_userId) {
      regenerationData.userId = _userId;
    }

    // 第一步：发起方案生成请求
    tt.request({
      url: `${BASE_URL}/api/plan-teambuilding`,
      method: 'POST',
      data: regenerationData,
      header: {
        'Content-Type': 'application/json',
        ...(_token ? { 'Authorization': `Bearer ${_token}` } : {})
      },
      success: (res) => {
        if (res.data?.success && res.data?.planId) {
          // 第二步：开始轮询查询生成结果
          this.pollPlanStatus(res.data.planId, form);
        } else {
          tt.hideLoading();
          tt.showToast({ title: res.data?.message || '生成失败', icon: 'none' });
        }
      },
      fail: (err) => {
        tt.hideLoading();
        tt.showToast({ title: '网络错误，请重试', icon: 'none' });
        console.error('API请求失败:', err);
      }
    });
  },

  // 新增：轮询查询方案生成状态
  pollPlanStatus(planId, form) {
    const maxAttempts = 90; // 最多轮询30次
    let attempts = 0;

    const poll = () => {
      attempts++;

      console.log(`轮询第 ${attempts} 次，planId: ${planId}`);

      tt.request({
        url: `${BASE_URL}/api/plan-status/${planId}`,
        method: 'GET',
        success: (res) => {
          console.log('轮询响应:', res.data);

          if (res.data && res.data.success) {
            if (res.data.ready) {
              // 生成完成
              tt.hideLoading();

              if (res.data.planSuccess && res.data.data) {
                // 生成成功
                const newPlan = res.data.data;
                // 检查是否为多天行程
                const isMultiDay = newPlan?.isMultiDay || false;
                const hotelInfo = newPlan?.hotel || null;
                const dayTabs = isMultiDay ? this.generateDayTabs(newPlan?.days) : [];

                tt.setStorage({
                  key: 'lastTeamPlanForm',
                  data: { form, generatedPlan: newPlan },
                  success: () => {
                    this.setData({
                      generatedPlan: newPlan,
                      recoList: this.formatPlanItems(newPlan.activities || newPlan?.days?.[0]?.activities),
                      feedback: '',
                      isMultiDay: isMultiDay,
                      hotelInfo: hotelInfo,
                      dayTabs: dayTabs,
                      currentDayIndex: 0
                    });
                    tt.showToast({ title: '方案已更新', icon: 'none' });
                  }
                });
              } else {
                // 生成失败
                tt.showToast({ title: res.data.error || '方案生成失败', icon: 'none' });
              }
            } else if (attempts < maxAttempts) {
              // 继续轮询
              setTimeout(poll, 10000);
            } else {
              // 超时
              tt.hideLoading();
              tt.showToast({ title: '生成超时，请重试', icon: 'none' });
            }
          } else {
            tt.hideLoading();
            tt.showToast({ title: res.data?.message || '查询状态失败', icon: 'none' });
          }
        },
        fail: (err) => {
          tt.hideLoading();
          tt.showToast({ title: '网络错误，请重试', icon: 'none' });
          console.error('轮询请求失败:', err);
        }
      });
    };

    // 开始轮询
    poll();
  },
  openFavorites() {
    const { generatedPlan } = this.data;

    if (!generatedPlan || !generatedPlan.id) {
      tt.showToast({ title: '方案数据无效', icon: 'none' });
      return;
    }

    // 获取登录 token
    let _token = '';
    try {
      const lc = require('../../utils/login.js');
      const inst = lc && (lc.loginController || lc.default || lc);
      inst && inst.initFromStorage && inst.initFromStorage();
      _token = (inst && inst.getToken && inst.getToken()) || '';
    } catch (_) { }
    if (!_token) {
      tt.showToast({ title: '请先登录后再收藏方案', icon: 'none' });
      return;
    }

    tt.showLoading({ title: '正在收藏...' });

    // Send the request to the new backend API
    tt.request({
      url: `${BASE_URL}/api/favorite`,
      method: 'POST',
      data: {
        planId: generatedPlan.id
      },
      header: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${_token}`
      },
      success: (res) => {
        tt.hideLoading();
        if (res.data.success) {
          tt.showToast({ title: res.data.message || '收藏成功', icon: 'success' });
        } else {
          tt.showToast({ title: res.data.message || '收藏失败', icon: 'none' });
        }
      },
      fail: (err) => {
        tt.hideLoading();
        tt.showToast({ title: '网络请求失败', icon: 'none' });
        console.error('Favorite API request failed:', err);
      }
    });
  },
});
