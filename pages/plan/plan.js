const INITIAL_LOCATION = {
  latitude: 45.7732,
  longitude: 126.6245,
  name: "哈尔滨中央大街（测试位置）",
  address: "黑龙江省哈尔滨市道里区",
};

const AMAP_KEY = "c644dfe4025597410cbdf2b6de3bd8d2";

const TYPE_MAP = {
  餐饮: "050000",
  体育休闲: "080000",
  购物: "060000",
  风景名胜: "110000",
  科教文化: "140000",
};

function getCenter(points) {
  if (!points || !points.length) return null;
  const lat = points.reduce((s, p) => s + (p.latitude || 0), 0) / points.length;
  const lng =
    points.reduce((s, p) => s + (p.longitude || 0), 0) / points.length;
  return { latitude: lat, longitude: lng };
}
const km2m = (km) => Math.max(0, Number(km || 0)) * 1000;

const { BASE_URL } = require("../../config/config.js");

Page({
  data: {
    stepTitles: ["基本信息", "选择出发点", "个人偏好"],
    currentStep: 0,
    progressPercentage: 0, // 【修改】用于显示当前步骤进度的百分比
    formCompletionPercentage: 0, // 保持表单填写进度的变量，但不再驱动顶部的进度条

    mapState: {
      latitude: INITIAL_LOCATION.latitude,
      longitude: INITIAL_LOCATION.longitude,
      scale: 14,
      markers: [],
      circles: [],
    },
    mapCenter: {
      latitude: INITIAL_LOCATION.latitude,
      longitude: INITIAL_LOCATION.longitude,
    },
    partners: [],
    partnerSearchKeyword: "", // 同行者搜索关键词
    partnerSearchResults: [], // 同行者搜索结果列表
    destTypes: ["餐饮", "购物", "风景名胜", "科教文化", "体育休闲"],
    form: {
      planName: "",
      origin: {
        name: "请选择您的出发点",
        latitude: null,
        longitude: null,
        address: "",
      },
      distance: 10,
      maxTransitTime: 60,
      taxiTime: 20,
      budgetMin: "",
      budgetMax: "",
      playDate: "2025-07-15",
      startTime: "14:00",
      endTime: "21:00",
      types: [],
    },
    selectedMap: {},
    selectedPrefsMap: {},
    dateBounds: { start: "2025-01-01", end: "2026-12-31" },
    searchCenter: null,
    isGenerating: false,
    generateBtnText: "开始推荐目的地",
    searchKeyword: "",
    searchResults: [],
    burstStars: [],
    starAnimationTimer: null,
    gifX: 300, // GIF的初始X坐标 (可以随便设置一个值)
    gifY: 500, // GIF的初始Y坐标 (可以随便设置一个值)
  },

  poiMarkers: [],

  onLoad() {
    this.locateMe(() => {
      this.updateProgressPercentageForSteps(); // 【修改】初始化步骤进度条
      this.calculateFormCompletion(); // 仍然计算表单填写进度
    });
    this.updateProgressPercentageForSteps(); // 【修改】初始化步骤进度条
    this.calculateFormCompletion();
  },

  noop() {},

  // 【修改】新的函数名，专门用于更新步骤进度条和圆点
  updateProgressPercentageForSteps() {
    const { currentStep, stepTitles, isGenerating } = this.data;
    const percent = ((currentStep + 1) / stepTitles.length) * 100;

    let btnText = "下一步";
    if (currentStep === stepTitles.length - 1) {
      btnText = "开始推荐目的地";
    }

    // 如果正在生成中，不更新按钮文字
    if (isGenerating) {
      this.setData({
        progressPercentage: Math.round(percent),
      });
    } else {
      this.setData({
        progressPercentage: Math.round(percent),
        generateBtnText: btnText,
      });
    }
  },

  goToStep(e) {
    const step = e.currentTarget.dataset.step;
    if (typeof step === "number") {
      this.setData({ currentStep: step }, () => {
        this.updateProgressPercentageForSteps(); // 【修改】更新步骤进度
      });
    }
  },

  onSwiperChange(e) {
    const newCurrentStep = e.detail.current;
    this.setData(
      {
        currentStep: newCurrentStep,
      },
      () => {
        this.updateProgressPercentageForSteps(); // 【修改】更新步骤进度
      }
    );
  },

  prevStep() {
    const { currentStep } = this.data;
    if (currentStep > 0) {
      this.setData({ currentStep: currentStep - 1 }, () => {
        this.updateProgressPercentageForSteps(); // 【修改】更新步骤进度
      });
    }
  },

  nextStep() {
    const { currentStep, stepTitles } = this.data;
    if (currentStep < stepTitles.length - 1) {
      this.setData({ currentStep: currentStep + 1 }, () => {
        this.updateProgressPercentageForSteps(); // 【修改】更新步骤进度
      });
    }
  },

  // 计算表单完成进度的方法 (保持不变，但不再驱动顶部的进度条)
  calculateFormCompletion() {
    const { form, partners, stepTitles } = this.data;
    let completedStepsCount = 0;
    const totalSteps = stepTitles.length;

    // Step 1: 选择出发点
    if (
      form.origin.latitude !== null &&
      form.origin.longitude !== null &&
      form.origin.name.trim() !== "" &&
      form.origin.address.trim() !== ""
    ) {
      completedStepsCount++;
    }

    // Step 2: 计划名称
    if (form.planName.trim() !== "") {
      completedStepsCount++;
    }

    // Step 3: 邀请同行者 (假设只要有同行者就算完成，或默认完成)
    if (partners && partners.length > 0) {
      completedStepsCount++;
    } else {
      completedStepsCount++; // 如果没有同行者，且这个步骤不是强制要求的，也可以视为完成
    }

    // Step 4: 可接受范围
    if (form.distance > 0 && form.maxTransitTime > 0 && form.taxiTime > 0) {
      completedStepsCount++;
    }

    // Step 5: 预算区间
    const budgetMinNum = parseFloat(form.budgetMin);
    const budgetMaxNum = parseFloat(form.budgetMax);
    let isBudgetComplete = false;
    if (form.budgetMin === "" && form.budgetMax === "") {
      isBudgetComplete = true;
    } else if (
      !isNaN(budgetMinNum) &&
      budgetMinNum >= 0 &&
      form.budgetMax === ""
    ) {
      isBudgetComplete = true;
    } else if (
      form.budgetMin === "" &&
      !isNaN(budgetMaxNum) &&
      budgetMaxNum >= 0
    ) {
      isBudgetComplete = true;
    } else if (
      !isNaN(budgetMinNum) &&
      budgetMinNum >= 0 &&
      !isNaN(budgetMaxNum) &&
      budgetMaxNum >= 0 &&
      budgetMinNum <= budgetMaxNum
    ) {
      isBudgetComplete = true;
    }
    if (isBudgetComplete) {
      completedStepsCount++;
    }

    // Step 6: 游玩时间
    if (
      form.playDate &&
      form.playDate !== "" &&
      form.startTime &&
      form.startTime !== "" &&
      form.endTime &&
      form.endTime !== ""
    ) {
      completedStepsCount++;
    }

    // Step 7: 目的地类型
    if (form.types && form.types.length > 0) {
      completedStepsCount++;
    }

    // Step 8: 个人偏好
    if (form.prefs && form.prefs.trim() !== "") {
      // 【核心修改】检查字符串是否不为空
      completedStepsCount++;
    }

    const percentage = (completedStepsCount / totalSteps) * 100;
    this.setData({
      formCompletionPercentage: Math.round(percentage),
    });
  },

  calculateAndSetCenterOrigin(userLocation = null, callback) {
    const { partners } = this.data;
    const pointsToCalculate = [];

    const validPartners = (partners || []).filter(
      (p) => typeof p.latitude === "number" && typeof p.longitude === "number"
    );
    pointsToCalculate.push(...validPartners);

    let centerName = "同行者中心位置";
    let centerAddress = `根据 ${validPartners.length} 位同行者的位置计算得出`;

    if (
      userLocation &&
      typeof userLocation.latitude === "number" &&
      typeof userLocation.longitude === "number"
    ) {
      pointsToCalculate.push(userLocation);
      centerName = "所有人的中心位置";
      centerAddress = `根据您和 ${validPartners.length} 位同行者的位置计算得出`;
    }

    if (pointsToCalculate.length === 0) {
      console.warn("没有任何有效坐标，将使用预设的初始位置作为搜索中心。");
      const fallbackCenter = {
        ...INITIAL_LOCATION,
        name: "预设搜索中心",
        address: "因无有效坐标，使用默认位置",
      };
      this.setData(
        {
          searchCenter: fallbackCenter,
          "mapState.latitude": fallbackCenter.latitude,
          "mapState.longitude": fallbackCenter.longitude,
        },
        () => {
          this.refreshMarkersAndCircle();
          if (typeof callback === "function") callback();
        }
      );
      return;
    }

    const centerPoint = getCenter(pointsToCalculate);

    if (centerPoint) {
      const centerOrigin = {
        name: centerName,
        address: centerAddress,
        latitude: centerPoint.latitude,
        longitude: centerPoint.longitude,
      };

      this.setData(
        {
          searchCenter: centerOrigin,
          "mapState.latitude": centerPoint.latitude,
          "mapState.longitude": centerPoint.longitude,
          "mapState.scale": 14,
          "mapCenter.latitude": centerPoint.latitude,
          "mapCenter.longitude": centerPoint.longitude,
        },
        () => {
          this.refreshMarkersAndCircle();
          if (typeof callback === "function") callback();
        }
      );
    }
  },

  onPartnerSearchInput(e) {
    this.setData({
      partnerSearchKeyword: e.detail.value,
    });
  },

  /**
   * 点击搜索按钮或键盘上的“搜索”时，执行搜索
   */
  onPartnerSearchConfirm() {
    const keyword = this.data.partnerSearchKeyword.trim();
    if (!keyword) {
      tt.showToast({ title: "请输入搜索关键词", icon: "none" });
      return;
    }
    this.searchPartnerLocation(keyword);
  },

  /**
   * 调用高德API搜索地点，并将结果存入 partnerSearchResults
   * (这个函数是你已有的 searchPlaces 函数的一个副本，但它更新的是专用于同行者的 state)
   */
  searchPartnerLocation(keyword) {
    tt.showLoading({ title: "正在搜索..." });

    tt.request({
      url: "https://restapi.amap.com/v3/place/text",
      data: {
        key: AMAP_KEY,
        keywords: keyword,
        city: "全国", // 或者可以指定一个城市以获得更精确的结果
        page: 1,
        offset: 10,
      },
      timeout: 180000,
      success: (res) => {
        tt.hideLoading();
        if (res.data && res.data.status === "1" && res.data.pois) {
          const results = res.data.pois.map((poi) => ({
            name: poi.name,
            address: poi.address,
            // 注意：高德API返回的 location 是 "经度,纬度" 格式
            latitude: parseFloat(poi.location.split(",")[1]),
            longitude: parseFloat(poi.location.split(",")[0]),
            id: poi.id,
          }));
          this.setData({ partnerSearchResults: results });
        } else {
          tt.showToast({ title: "没有搜到相关地点", icon: "none" });
          this.setData({ partnerSearchResults: [] });
        }
      },
      fail: (err) => {
        tt.hideLoading();
        console.error("搜索同行者位置请求失败:", err);
        tt.showToast({ title: "网络错误，请重试", icon: "none" });
      },
    });
  },

  /**
   * 当用户从搜索结果列表中选择一个地点时触发此函数
   */
  onSelectPartnerSearchResult(e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;

    const { partners } = this.data;

    // 1. 根据选中的地点信息，创建一个新的同行者对象
    const newPartner = {
      id: Date.now(), // 使用时间戳作为独一无二的ID
      name: `同行者 ${partners.length + 1}`, // 设置一个默认名称
      address: item.address || item.name, // 使用详细地址，如果没有则用名称
      latitude: item.latitude,
      longitude: item.longitude,
    };

    // 2. 将新成员添加到 partners 数组中
    const updatedPartners = [...partners, newPartner];

    // 3. 更新数据：将新数组应用到页面，同时清空搜索框和结果列表
    this.setData(
      {
        partners: updatedPartners,
        partnerSearchKeyword: "", // 清空搜索输入框
        partnerSearchResults: [], // 隐藏搜索结果列表
      },
      () => {
        // 4. 【关键】在数据更新后，调用你已有的函数来刷新地图中心点和标记
        this.calculateAndSetCenterOrigin(this.data.form.origin);
        this.calculateFormCompletion(); // 重新计算表单完成度
        tt.showToast({ title: "添加成功！", icon: "success" });
      }
    );
  },

  onDeletePartner(e) {
    // 从点击事件中获取通过 data-id 传递过来的同行者ID
    const idToDelete = e.currentTarget.dataset.id;
    if (!idToDelete) {
      console.warn("删除失败：无法获取到要删除的同行者ID");
      return;
    }

    console.log(`准备删除ID为: ${idToDelete} 的同行者`);

    // 使用 filter 方法创建一个不包含要删除成员的新数组
    // p.id !== idToDelete 这个条件会保留所有ID不匹配的成员
    const updatedPartners = this.data.partners.filter(
      (p) => p.id !== idToDelete
    );

    // 使用 setData 更新数据，并在回调函数中执行后续操作
    this.setData(
      {
        partners: updatedPartners,
      },
      () => {
        // 【关键】删除后，立即重新计算中心点并刷新地图标记
        this.calculateAndSetCenterOrigin(this.data.form.origin);

        // 同时，重新计算表单的完成度
        this.calculateFormCompletion();

        tt.showToast({ title: "已删除", icon: "none" });
        console.log("同行者已删除，并已刷新地图和表单状态。");
      }
    );
  },
  locateMe(done) {
    console.log("[定位流程] 1. 开始调用 locateMe");
    tt.getLocation({
      type: "gcj02",
      success: (res) => {
        console.log("[定位流程] 2. tt.getLocation 成功返回:", res);
        let { latitude, longitude } = res || {};

        // 尝试将字符串转换为数字
        latitude = parseFloat(latitude);
        longitude = parseFloat(longitude);

        if (!isNaN(latitude) && !isNaN(longitude)) {
          console.log(
            `[定位流程] 3. 坐标有效: lat=${latitude}, lng=${longitude}`
          );
          tt.showToast({ title: "定位成功!", icon: "success", duration: 1500 });

          console.log("[定位流程] 4. 开始调用 reverseGeocode 进行逆地理编码");
          this.reverseGeocode(latitude, longitude)
            .then((addressName) => {
              console.log(`[定位流程] 5. 逆地理编码成功: ${addressName}`);
              const userLocation = {
                latitude,
                longitude,
                name: addressName || "当前位置",
                address: addressName || "（详细地址未知）",
              };

              this.setData({ "form.origin": userLocation }, () => {
                this.calculateFormCompletion();
              });
              console.log("[定位流程] 6. 定位成功，已更新 form.origin");
              this.calculateAndSetCenterOrigin(userLocation, done);
            })
            .catch((error) => {
              console.error("[定位流程] 5. 逆地理编码失败:", error);
              const userLocation = {
                latitude,
                longitude,
                name: "当前位置",
                address: "（逆地理编码失败，请稍后重试）",
              };
              this.setData({ "form.origin": userLocation }, () => {
                this.calculateFormCompletion();
              });
              this.calculateAndSetCenterOrigin(userLocation, done);
              tt.showToast({ title: "地址解析失败", icon: "none" });
            });
        } else {
          console.error("[定位流程] 3. 坐标无效 (latitude/longitude 不是数字)");
          this._handleLocateFail("定位数据无效");
          if (typeof done === "function") done();
        }
      },
      fail: (err) => {
        console.error("[定位流程] 2. tt.getLocation 失败:", err);
        let failMsg = "定位失败，请稍后重试";
        if (err.errMsg && err.errMsg.includes("auth deny")) {
          failMsg = "您已拒绝定位权限";
        } else if (err.errMsg && err.errMsg.includes("not enabled")) {
          failMsg = "请开启手机定位服务";
        }
        this._handleLocateFail(failMsg);
        if (typeof done === "function") done();
      },
    });
  },

  _handleLocateFail(msg) {
    console.log(`[定位流程] 失败处理触发: ${msg}`);
    const fallbackLocation = {
      ...INITIAL_LOCATION,
      name: "杭州西湖（默认出发点）",
    };
    this.setData({ "form.origin": fallbackLocation }, () => {
      this.calculateFormCompletion();
    });
    // Pass the fallback location to calculateAndSetCenterOrigin so it's not treated as "no valid coordinates"
    console.log("[定位流程] 使用兜底位置进行初始化");
    this.calculateAndSetCenterOrigin(fallbackLocation);
  },

  reverseGeocode(latitude, longitude) {
    return new Promise((resolve, reject) => {
      if (typeof latitude !== "number" || typeof longitude !== "number") {
        return reject(new Error("无效的经纬度坐标"));
      }

      tt.request({
        url: "https://restapi.amap.com/v3/geocode/regeo",
        data: {
          key: AMAP_KEY,
          location: `${longitude},${latitude}`,
          extensions: "base",
        },
        success: (res) => {
          if (res.data && res.data.status === "1" && res.data.regeocode) {
            const addressName = res.data.regeocode.formatted_address;
            resolve(addressName);
          } else {
            console.error(
              "高德逆地理编码API失败:",
              res.data.info || "未知错误"
            );
            reject(new Error(res.data.info || "逆地理编码失败"));
          }
        },
        fail: (err) => {
          console.error("高德逆地理编码网络请求失败:", err);
          reject(err);
        },
      });
    });
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value });
  },

  onSearchConfirm() {
    const keyword = this.data.searchKeyword.trim();
    if (!keyword) {
      tt.showToast({ title: "请输入搜索关键词", icon: "none" });
      return;
    }

    this.searchPlaces(keyword);
  },

  searchPlaces(keyword) {
    tt.showLoading({ title: "搜索中..." });

    tt.request({
      url: "https://restapi.amap.com/v3/place/text",
      data: {
        key: AMAP_KEY,
        keywords: keyword,
        city: "全国", // 可以改为用户当前城市或根据定位获取
        page: 1,
        offset: 10,
        extensions: "all",
      },
      success: (res) => {
        tt.hideLoading();
        if (res.data && res.data.status === "1" && res.data.pois) {
          const results = res.data.pois.map((poi) => ({
            name: poi.name,
            address: poi.address,
            latitude: parseFloat(poi.location.split(",")[1]),
            longitude: parseFloat(poi.location.split(",")[0]),
            id: poi.id,
          }));
          this.setData({ searchResults: results });
        } else {
          tt.showToast({ title: "搜索失败，请重试", icon: "none" });
          this.setData({ searchResults: [] });
        }
      },
      fail: (err) => {
        tt.hideLoading();
        console.error("搜索请求失败:", err);
        tt.showToast({ title: "网络错误，请重试", icon: "none" });
        this.setData({ searchResults: [] });
      },
    });
  },

  onSelectSearchResult(e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;

    this.setData(
      {
        "form.origin.name": item.name,
        "form.origin.address": item.address,
        "form.origin.latitude": item.latitude,
        "form.origin.longitude": item.longitude,
        mapCenter: { latitude: item.latitude, longitude: item.longitude },
        "mapState.latitude": item.latitude,
        "mapState.longitude": item.longitude,
        searchResults: [],
      },
      () => {
        this.refreshMarkersAndCircle();
        this.calculateFormCompletion();
      }
    );
    tt.showToast({ title: "已选择出发点", icon: "none", duration: 2000 });
  },

  onRegionChange(e) {
    if (e && e.type === "end") {
      try {
        const ctx = tt.createMapContext("map", this);
        ctx.getCenterLocation({
          success: (r) => {
            if (
              r &&
              typeof r.latitude === "number" &&
              typeof r.longitude === "number"
            ) {
              this.setData({
                "mapCenter.latitude": r.latitude,
                "mapCenter.longitude": r.longitude,
              });
            }
          },
        });
      } catch (err) {
        console.error("getCenterLocation error:", err);
      }
    }
  },

  useCenterAsOrigin() {
    const { latitude, longitude } = this.data.mapCenter || {};
    if (typeof latitude === "number" && typeof longitude === "number") {
      tt.showToast({
        title: "正在获取地址...",
        icon: "loading",
        duration: 10000,
      });

      this.reverseGeocode(latitude, longitude)
        .then((addressName) => {
          tt.hideToast();
          const centerOrigin = {
            name: addressName || "地图中心点",
            address: addressName || "（详细地址未知）",
            latitude,
            longitude,
          };
          this.setData({ "form.origin": centerOrigin }, () => {
            this.refreshMarkersAndCircle();
            this.calculateFormCompletion();
          });
          tt.showToast({ title: "已将地图中心设为出发点", icon: "success" });
        })
        .catch((error) => {
          tt.hideToast();
          console.error("逆地理编码失败:", error);
          const centerOrigin = {
            name: "地图中心点",
            address: "（地址解析失败）",
            latitude,
            longitude,
          };
          this.setData({ "form.origin": centerOrigin }, () => {
            this.refreshMarkersAndCircle();
            this.calculateFormCompletion();
          });
          tt.showToast({ title: "地址解析失败", icon: "none" });
        });
    } else {
      tt.showToast({ title: "当前中心点无效", icon: "none" });
    }
  },

  zoomIn() {
    this.setData({
      "mapState.scale": Math.min(this.data.mapState.scale + 1, 20),
    });
  },
  zoomOut() {
    this.setData({
      "mapState.scale": Math.max(this.data.mapState.scale - 1, 5),
    });
  },

  onDistanceChanging(e) {
    this.setData({ "form.distance": Number(e.detail.value) || 0 });
  },
  onDistanceChange(e) {
    this.setData({ "form.distance": Number(e.detail.value) || 0 }, () => {
      this.refreshMarkersAndCircle();
      this.calculateFormCompletion();
    });
  },
  onTransitChange(e) {
    this.setData({ "form.maxTransitTime": Number(e.detail.value) || 0 }, () => {
      this.calculateFormCompletion();
    });
  },
  onTaxiChange(e) {
    this.setData({ "form.taxiTime": Number(e.detail.value) || 0 }, () => {
      this.calculateFormCompletion();
    });
  },
  onPlanNameInput(e) {
    this.setData({ "form.planName": e.detail.value }, () => {
      this.calculateFormCompletion();
    });
  },
  onBudgetMin(e) {
    this.setData({ "form.budgetMin": e.detail.value }, () => {
      this.calculateFormCompletion();
    });
  },
  onBudgetMax(e) {
    this.setData({ "form.budgetMax": e.detail.value }, () => {
      this.calculateFormCompletion();
    });
  },
  onDateChange(e) {
    this.setData({ "form.playDate": e.detail.value }, () => {
      this.calculateFormCompletion();
    });
  },
  onStartTimeChange(e) {
    this.setData({ "form.startTime": e.detail.value }, () => {
      this.calculateFormCompletion();
    });
  },
  onEndTimeChange(e) {
    this.setData({ "form.endTime": e.detail.value }, () => {
      this.calculateFormCompletion();
    });
  },
  toggleType(e) {
    const name = e?.currentTarget?.dataset?.name;
    if (!name) return;
    const selectedMap = { ...(this.data.selectedMap || {}) };
    const set = new Set(this.data.form?.types || []);
    if (selectedMap[name]) {
      delete selectedMap[name];
      set.delete(name);
    } else {
      selectedMap[name] = true;
      set.add(name);
    }
    this.setData({ selectedMap, "form.types": Array.from(set) }, () => {
      this.calculateFormCompletion();
    });
  },
  /**
   * 监听偏好输入框的输入事件
   * @param {Object} e - 事件对象，e.detail.value 包含输入框的最新内容
   */
  onPrefsInput(e) {
    // 直接将输入框的内容更新到 form.prefs 中
    this.setData(
      {
        "form.prefs": e.detail.value,
      },
      () => {
        // 每次输入后都重新计算一下表单完成度
        this.calculateFormCompletion();
      }
    );
  },
  onMoreTypes() {
    tt.showToast({ title: "打开更多目的地类型", icon: "none" });
  },
  onMorePrefs() {
    tt.showToast({ title: "打开更多个人偏好", icon: "none" });
  },
  onRecommend() {
    const f = this.data.form || {};
    if (!f.planName)
      return tt.showToast({ title: "请填写计划名称", icon: "none" });
    if (
      !(
        typeof f.origin?.latitude === "number" &&
        typeof f.origin?.longitude === "number"
      )
    ) {
      return tt.showToast({ title: "请选择出发点", icon: "none" });
    }
    if (
      f.budgetMin &&
      f.budgetMax &&
      Number(f.budgetMin) > Number(f.budgetMax)
    ) {
      return tt.showToast({ title: "最低预算不能高于最高预算", icon: "none" });
    }
    const payload = { ...f, partners: this.data.partners };
    tt.setStorage({
      key: "lastPlanForm",
      data: payload,
      complete: () => {
        tt.navigateTo({ url: "/pages/generate-plan/generate-plan" });
      },
    });
  },

  handleBottomBtnTap() {
    const { currentStep, stepTitles } = this.data;
    console.log(
      `点击底部按钮: currentStep=${currentStep}, total=${stepTitles.length}`
    );
    if (currentStep < stepTitles.length - 1) {
      this.nextStep();
    } else {
      console.log("处于最后一步，调用 onSearchNearbyPois");
      this.onSearchNearbyPois();
    }
  },

  async onSearchNearbyPois() {
    // 0. 基本的用户输入校验 (保持不变)
    if (!this.data.form.prefs || !this.data.form.prefs.trim()) {
      return tt.showToast({ title: "请先描述您的偏好", icon: "none" });
    }
    if (!this.data.form.origin || !this.data.form.origin.latitude) {
      return tt.showToast({ title: "请先选择一个出发点", icon: "none" });
    }

    // 1. 启动加载动画 (保持不变)
    this.setData({
      isGenerating: true,
      generateBtnText: "正在启动智能推荐...",
    });
    this.startLoadingAnimation();
    this.startStarAnimation();

    try {
      // 2. 准备请求参数
      const criteria = {
        preferenceText: this.data.form.prefs,
        origin: this.data.form.origin,
        types: this.data.form.types,
        partners: this.data.partners || [], // 【新增】同行者列表
        maxTransitTime: this.data.form.maxTransitTime || 60, // 【新增】最大公交时间
        maxBudget: this.data.form.budgetMax ? parseFloat(this.data.form.budgetMax) : null, // 【新增】最大预算
        minBudget: this.data.form.budgetMin ? parseFloat(this.data.form.budgetMin) : null, // 【新增】最小预算
      };

      console.log("【步骤一】=> 向后端发送请求，启动推荐任务...");

      // 3. 【核心】调用后端API，启动任务并获取recId
      tt.request({
        url: `${BASE_URL}/getInitialPoisByPrefs`, // 【修正】使用反引号
        method: "POST",
        data: criteria,
        timeout: 600000, // 启动接口应该很快返回，设置一个较短的超时
        success: (res) => {
          if (
            res.statusCode === 200 &&
            res.data &&
            res.data.success &&
            res.data.recId
          ) {
            console.log(`【步骤一】成功: 获取到任务ID -> ${res.data.recId}`);
            // 4. 【核心】获取到任务ID后，开始轮询
            this.pollForRecommendations(res.data.recId);
          } else {
            console.error("启动推荐任务失败:", res.data);
            tt.showToast({
              title: res.data.message || "启动推荐失败",
              icon: "none",
            });
            this.stopLoadingAnimation();
          }
        },
        fail: (err) => {
          console.error("请求启动推荐任务网络失败:", err);
          tt.showToast({ title: "网络错误，请重试", icon: "none" });
          this.stopLoadingAnimation();
        },
      });
    } catch (error) {
      console.error("启动推荐流程时发生前端错误:", error);
      tt.showToast({ title: "推荐准备失败", icon: "none" });
      this.stopLoadingAnimation();
    }
  },

  pollForRecommendations(recId) {
    console.log(`【步骤二】=> 开始轮询任务 [${recId}]...`);
    this.setData({ generateBtnText: "AI正在理解您的偏好..." });

    // 清除可能存在的旧定时器
    if (this.data.pollingTimer) {
      clearInterval(this.data.pollingTimer);
    }

    const timer = setInterval(() => {
      console.log(`...正在查询任务 [${recId}] 状态...`);
      tt.request({
        url: `${BASE_URL}/recommendation-status/${recId}`, // 【注意】这里是您的状态查询接口
        method: "GET",
        timeout: 20000,
        success: (res) => {
          // 条件判断保持不变，因为我们仍然期望 API 本身是成功的
          if (res.statusCode === 200 && res.data && res.data.success) {
            // 【核心修改】从 res.data.taskStatus 中获取真正的任务状态
            const status = res.data.taskStatus;

            // 检查任务是否完成
            if (status.ready) {
              clearInterval(timer);
              this.setData({ pollingTimer: null });

              // 检查任务是否成功
              if (status.success) {
                // 现在这里的 status.success 就是任务的成功状态了
                console.log(`🎉 任务 [${recId}] 成功完成！获取到最终结果。`);
                const finalPois = status.data.pois;
                if (!finalPois || finalPois.length === 0) {
                  tt.showToast({ title: "AI未能找到合适的地点", icon: "none" });
                  this.stopLoadingAnimation();
                } else {
                  this.handleFinalResults(finalPois);
                }
              } else {
                // 任务失败
                console.error(`❌ 任务 [${recId}] 失败:`, status.error);
                tt.showToast({
                  title: status.error || "AI推荐失败",
                  icon: "none",
                  duration: 3000,
                });
                this.stopLoadingAnimation();
              }
            } else {
              // 任务仍在进行中，可以更新UI提示
              console.log(`...任务 [${recId}] 仍在处理中...`);
              // (可选) 你可以在这里根据后端返回的更详细状态，更新按钮文本
              // this.setData({ generateBtnText: '正在筛选地点...' });
            }
          } else {
            // API请求本身失败
            console.error(`查询任务 [${recId}] 状态失败:`, res);
            clearInterval(timer);
            this.setData({ pollingTimer: null });
            tt.showToast({ title: "查询结果失败", icon: "none" });
            this.stopLoadingAnimation();
          }
        },
        fail: (err) => {
          // 网络错误
          console.error(`查询任务 [${recId}] 网络失败:`, err);
          clearInterval(timer);
          this.setData({ pollingTimer: null });
          tt.showToast({ title: "网络中断，请重试", icon: "none" });
          this.stopLoadingAnimation();
        },
      });
    }, 3000); // 每3秒查询一次状态

    // 保存定时器ID
    this.setData({ pollingTimer: timer });
  },
  // =======================================================
  // ============ 【新增】调用大模型获取初步列表的函数 ============
  // =======================================================
  /**
   * @description 调用后端，让大模型根据偏好返回一个店铺列表
   * @param {object} criteria 包含用户偏好、位置、类型的对象
   * @returns {Promise<Array>} 返回一个包含店铺详细信息的数组
   */
  callLLMForInitialStores(criteria) {
    console.log("正在向后端发送偏好请求:", criteria);

    // 【重要】您需要在这里替换为真实的 tt.request 来调用您的后端API
    // 您的后端接收到请求后，再与大模型交互，并返回一个结构化的店铺列表

    // 为了方便您前端调试，我这里返回一个 Promise 和模拟数据
    return new Promise((resolve, reject) => {
      tt.request({
        url: `${BASE_URL}/getInitialPoisByPrefs`, // 【请替换】您的后端API地址
        method: "POST",
        data: criteria,
        timeout: 1800000, // 例如设置3分钟超时
        success: (res) => {
          // 【重要】后端返回的数据格式必须和高德API类似，包含以下字段：
          // id, name, location("经度,纬度"), address, citycode,
          // business: { cost: "人均消费", rating: "评分" },
          // photos: [{ url: "图片地址" }]
          if (res.statusCode === 200 && res.data && res.data.pois) {
            console.log("成功从大模型获取到初步列表:", res.data.pois);
            resolve(res.data.pois);
          } else {
            console.error(
              "大模型获取初步列表失败:",
              res.data.error || "返回数据格式不正确"
            );
            reject(new Error(res.data.error || "AI未能生成地点列表"));
          }
        },
        fail: (err) => {
          console.error("请求大模型后端网络失败:", err);
          reject(err);
        },
      });
    });
  },

  // 【微调】交通时间筛选函数，现在返回一个Promise
  // 【最终修正】交通时间筛选函数
  async filterPoisByTravelTime(pois) {
    if (!pois || pois.length === 0) {
      console.log("没有候选地点，无需计算时间。");
      return [];
    }

    // 从 pois 中获取城市信息，如果不存在则报错
    const city = pois[0].citycode;
    if (!city) {
      console.error("致命错误：候选地点缺少 citycode，无法计算交通时间。");
      tt.showToast({ title: "地点信息不完整", icon: "none" });
      throw new Error("Missing citycode in POIs for travel time calculation.");
    }
    console.log(`已确定计算城市: ${city}`); // 添加日志，确认城市信息已获取

    const { form } = this.data;
    const origin = `${form.origin.longitude},${form.origin.latitude}`;
    const maxTaxiMinutes = form.taxiTime;
    const maxTransitMinutes = form.maxTransitTime;

    try {
      // 同时开始获取驾车和公交时间
      const drivingDurations = await this.getDrivingTimes(origin, pois);
      console.log("步骤 3a: 获取到各地点打车时间(分钟):", drivingDurations);

      // 【核心修正】在调用 getTransitTimes 时，必须把 city 参数传进去
      const transitDurations = await this.getTransitTimes(origin, pois, city);
      console.log("步骤 3b: 获取到各地点公交时间(分钟):", transitDurations);

      console.log("步骤 3c: 开始根据时间限制进行筛选...");
      const filteredPois = pois.filter((poi, index) => {
        const drivingTime = drivingDurations[index];
        const transitTime = transitDurations[index];
        const isTaxiTimeOk = drivingTime <= maxTaxiMinutes;
        const isTransitTimeOk = transitTime <= maxTransitMinutes;

        console.log(
          `- 正在检查 [${poi.name}]: 打车${
            isTaxiTimeOk ? "通过" : "淘汰"
          }, 公交${isTransitTimeOk ? "通过" : "淘汰"}`
        );
        return isTaxiTimeOk && isTransitTimeOk;
      });

      // 将筛选后的结果，处理成包含交通时间信息的最终格式
      const finalPoisWithTime = filteredPois.map((poi) => {
        const originalIndex = pois.findIndex((p) => p.id === poi.id);
        return {
          ...poi,
          drivingTime:
            drivingDurations[originalIndex] < Infinity
              ? drivingDurations[originalIndex]
              : "N/A",
          transitTime:
            transitDurations[originalIndex] < Infinity
              ? transitDurations[originalIndex]
              : "N/A",
        };
      });

      return finalPoisWithTime;
    } catch (error) {
      console.error("在计算通行时间过程中发生严重错误:", error);
      tt.showToast({ title: "计算时间失败", icon: "none" });
      throw error;
    }
  },
  // 【微调】预算筛选函数，现在只返回结果
  filterPoisByBudget(pois) {
    const { budgetMin, budgetMax } = this.data.form;
    const min = parseFloat(budgetMin) || 0;
    const max = parseFloat(budgetMax) || Infinity;

    // 如果未设置预算，直接返回原始列表
    if (min === 0 && max === Infinity) {
      console.log(`步骤 2: 用户未设置预算，跳过筛选。`);
      return pois;
    }

    console.log(
      `步骤 2: 开始按预算筛选 (范围: ${min === 0 ? "任意" : min} - ${
        max === Infinity ? "任意" : max
      } 元)...`
    );
    const filteredPois = pois.filter((poi) => {
      // ... 内部的筛选逻辑保持不变 ...
      if (poi.business && poi.business.cost) {
        const poiCost = parseFloat(poi.business.cost);
        if (!isNaN(poiCost)) {
          const isInBudget = poiCost >= min && poiCost <= max;
          if (!isInBudget) {
            console.log(`  ❌ [淘汰] "${poi.name}" (人均: ${poiCost}元)`);
            return false;
          }
        }
      }
      console.log(`  ✅ [保留] "${poi.name}" (无消费信息或在预算内)`);
      return true;
    });

    // 【核心修改】返回筛选后的数组
    return filteredPois;
  },

  async getDrivingTimes(origin, pois) {
    if (!pois || pois.length === 0) {
      return [];
    }
    console.log(
      `--- 开始循环计算 ${pois.length} 个地点的驾车时间 (带有限流) ---`
    );
    const BATCH_SIZE = 3;
    const DELAY_MS = 1000;
    const allDurations = [];

    for (let i = 0; i < pois.length; i += BATCH_SIZE) {
      const batchPois = pois.slice(i, i + BATCH_SIZE);
      console.log(
        `正在处理驾车时间批次 ${Math.floor(i / BATCH_SIZE) + 1}，包含 ${
          batchPois.length
        } 个地点...`
      );

      const batchPromises = batchPois.map((poi, index) => {
        const globalIndex = i + index;
        return new Promise((resolve) => {
          if (
            !poi.location ||
            typeof poi.location !== "string" ||
            poi.location.split(",").length !== 2
          ) {
            console.warn(
              `[${globalIndex + 1}/${pois.length}] POI "${
                poi.name
              }" 坐标无效，跳过驾车计算。`
            );
            resolve(Infinity);
            return;
          }

          tt.request({
            url: "https://restapi.amap.com/v3/direction/driving",
            data: { key: AMAP_KEY, origin: origin, destination: poi.location },
            method: "GET",
            success: (res) => {
              if (
                res.data &&
                res.data.status === "1" &&
                res.data.route &&
                res.data.route.paths &&
                res.data.route.paths.length > 0
              ) {
                const duration = Math.ceil(
                  parseInt(res.data.route.paths[0].duration, 10) / 60
                );
                console.log(
                  `✅ [${globalIndex + 1}/${pois.length}] "${
                    poi.name
                  }" 驾车计算成功: ${duration} 分钟`
                );
                resolve(duration);
              } else {
                console.error(
                  `❌ [${globalIndex + 1}/${pois.length}] "${
                    poi.name
                  }" 驾车计算失败:`,
                  res.data.info || "无有效路径"
                );
                resolve(Infinity);
              }
            },
            fail: (err) => {
              console.error(
                `❌ [${globalIndex + 1}/${pois.length}] "${
                  poi.name
                }" 驾车网络失败:`,
                err
              );
              resolve(Infinity);
            },
          });
        });
      });

      const batchResults = await Promise.all(batchPromises);
      allDurations.push(...batchResults);

      if (i + BATCH_SIZE < pois.length) {
        console.log(
          `驾车时间批次处理完毕，等待 ${DELAY_MS / 1000} 秒后继续...`
        );
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }
    }
    console.log("所有批次的驾车时间计算完毕。");
    return allDurations;
  },

  // 【最终修正】获取公交时间函数
  async getTransitTimes(origin, pois, city) {
    // <--- 【核心修正】接收 city 参数
    if (!pois || pois.length === 0) {
      return [];
    }

    // 如果没有传入 city 参数，则直接报错并返回，避免无效请求
    if (!city) {
      console.error("getTransitTimes 错误: 未提供 city 参数。");
      return pois.map(() => Infinity); // 返回一个全是 Infinity 的数组
    }

    console.log(
      `--- 开始循环计算 ${pois.length} 个地点的公交时间 (城市: ${city}) ---`
    );

    const BATCH_SIZE = 3;
    const DELAY_MS = 1000;
    const allDurations = [];

    for (let i = 0; i < pois.length; i += BATCH_SIZE) {
      const batchPois = pois.slice(i, i + BATCH_SIZE);
      // ... 内部循环逻辑不变 ...
      const batchPromises = batchPois.map((poi, index) => {
        const globalIndex = i + index;
        return new Promise((resolve) => {
          if (!poi.location) {
            // citycode 的检查可以简化，因为外面已经传了统一的 city
            console.warn(
              `[${globalIndex + 1}/${pois.length}] POI "${
                poi.name
              }" 数据无效，跳过。`
            );
            resolve(Infinity);
            return;
          }
          tt.request({
            url: "https://restapi.amap.com/v3/direction/transit/integrated",
            data: {
              key: AMAP_KEY,
              origin: origin,
              destination: poi.location,
              city: city, // <--- 【核心修正】使用传入的 city 参数
            },
            method: "GET",
            success: (res) => {
              // ... success 内部逻辑不变 ...
              if (
                res.data &&
                res.data.status === "1" &&
                res.data.route &&
                res.data.route.transits &&
                res.data.route.transits.length > 0
              ) {
                const duration = Math.ceil(
                  parseInt(res.data.route.transits[0].duration, 10) / 60
                );
                resolve(duration);
              } else {
                resolve(Infinity);
              }
            },
            fail: (err) => {
              // ... fail 内部逻辑不变 ...
              resolve(Infinity);
            },
          });
        });
      });

      const batchResults = await Promise.all(batchPromises);
      allDurations.push(...batchResults);

      if (i + BATCH_SIZE < pois.length) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }
    }
    return allDurations;
  },

  refreshMarkersAndCircle() {
    const { partners, form, searchCenter } = this.data;

    const markers = [];
    (partners || []).forEach((p, idx) => {
      if (
        p &&
        typeof p.latitude === "number" &&
        typeof p.longitude === "number"
      ) {
        markers.push({
          id: 100 + idx,
          latitude: p.latitude,
          longitude: p.longitude,
          title: p.name || "",
          width: 20,
          height: 20,
        });
      }
    });
    if (
      form &&
      typeof form.origin?.latitude === "number" &&
      typeof form.origin?.longitude === "number"
    ) {
      markers.push({
        id: 1,
        latitude: form.origin.latitude,
        longitude: form.origin.longitude,
        title: form.origin.name || "出发点",
        width: 24,
        height: 24,
        iconPath: "/assets/marker_start.png",
      });
    }
    const pts = markers.map((m) => ({
      latitude: m.latitude,
      longitude: m.longitude,
    }));
    const center = getCenter(pts) || {
      latitude: this.data.mapState.latitude,
      longitude: this.data.mapState.longitude,
    };
    const circles = [];
    if (
      form &&
      typeof form.distance === "number" &&
      searchCenter &&
      typeof searchCenter.latitude === "number" &&
      typeof searchCenter.longitude === "number"
    ) {
      circles.push({
        latitude: searchCenter.latitude,
        longitude: searchCenter.longitude,
        radius: km2m(form.distance),
        color: "#056CEB44",
        fillColor: "#056CEB22",
        strokeWidth: 2,
      });
    }
    this.setData({
      "mapState.markers": markers,
      "mapState.circles": circles,
      "mapState.latitude": center.latitude,
      "mapState.longitude": center.longitude,
    });
  },

  savePlanToServer(recommendations) {
    const { form } = this.data;

    const planData = {
      planName: form.planName,
      playDate: form.playDate,
      startTime: form.startTime,
      endTime: form.endTime,
      recommendations: recommendations.map((item) => ({
        id: item.id,
        name: item.name,
        address: item.address,
        price: item.cost,
        drive: item.drivingTime,
        transit: item.transitTime,
      })),
    };

    console.groupCollapsed("====== 正在保存行程计划到数据库 ======");
    console.log("请求 URL:", `${BASE_URL}/api/save-plan`);
    console.log("请求方法:", "POST");
    console.log("发送的数据:", planData);
    console.groupEnd();

    tt.request({
      url: `${BASE_URL}/api/save-plan`,
      method: "POST",
      data: planData,
      success: (res) => {
        if (res.statusCode === 200) {
          console.group("✅ 行程计划保存成功");
          console.log("服务器响应状态码:", res.statusCode);
          console.log("返回的数据:", res.data);
          console.log("新创建的 Plan ID:", res.data.planId);
          console.groupEnd();
        } else {
          console.group("❌ 保存行程计划失败 (服务器业务错误)");
          console.error("服务器响应状态码:", res.statusCode);
          console.error("服务器返回的错误信息:", res.data);
          console.groupEnd();
        }
      },
      fail: (err) => {
        console.group("❌ 保存行程计划失败 (网络请求错误)");
        console.error("请求失败，无法连接到服务器或发生网络错误。");
        console.error("错误详情:", err);
        console.groupEnd();
      },
    });
  },

  startLoadingAnimation() {
    this.setData({
      generateBtnText: "生成中（预计需要3分钟）",
    });
    return null;
  },

  stopLoadingAnimation() {
    if (this.data.starAnimationTimer) {
      clearInterval(this.data.starAnimationTimer);
    }

    this.setData({
      isGenerating: false,
      generateBtnText: "生成推荐目的地",
      loadingDots: "",
      burstStars: [],
      starAnimationTimer: null,
    });
  },

  generateStarBurst() {
    const animations = [
      "star-burst-1",
      "star-burst-2",
      "star-burst-3",
      "star-burst-4",
      "star-burst-5",
      "star-burst-6",
      "star-burst-7",
      "star-burst-8",
    ];

    const stars = animations.map((animation, index) => ({
      animation: animation,
      delay: index * 0.1,
    }));

    this.setData({ burstStars: stars });
  },

  startStarAnimation() {
    this.generateStarBurst();

    const starTimer = setInterval(() => {
      if (this.data.isGenerating) {
        this.generateStarBurst();
      } else {
        clearInterval(starTimer);
      }
    }, 1500);

    this.setData({ starAnimationTimer: starTimer });
  },

  // =======================================================
  // ============ 【新增】处理最终结果并跳转的函数 ============
  // =======================================================
  handleFinalResults(finalPois) {
    this.stopLoadingAnimation(); // 停止所有加载动画

    tt.showToast({
      title: `为您筛选出 ${finalPois.length} 个宝藏地点！`,
      icon: "success",
      duration: 2000,
    });

    // 将最终结果转换为下一页需要的格式
    const recoListForNextPage = finalPois.map((poi) => ({
      id: poi.id,
      name: poi.name,
      address: poi.address,
      transit: poi.transitTime,
      drive: poi.drivingTime,
      price: poi.business?.cost || "暂无",
      liked: false,
      cover: poi.photos && poi.photos.length > 0 ? poi.photos[0].url : "",
      // 【新增】公平性相关信息
      travelDetails: poi.travelDetails || null,
      scoreInfo: poi.scoreInfo || null,
      hasSubwayNearby: poi.hasSubwayNearby || false,
      rank: poi.rank || 0,
    }));

    // 保存计划并跳转
    this.savePlanToServer(recoListForNextPage); // 复用您已有的保存函数

    tt.setStorage({
      key: "llmRecommendations", // 使用您之前用过的key
      data: recoListForNextPage,
      success: () => {
        console.log("最终结果已暂存，准备跳转...");
        tt.navigateTo({
          url: "/pages/generate-plan/generate-plan",
        });
      },
      fail: (storageErr) => {
        console.error("暂存最终结果失败:", storageErr);
        tt.showToast({ title: "页面跳转失败", icon: "none" });
      },
    });
  },
});
