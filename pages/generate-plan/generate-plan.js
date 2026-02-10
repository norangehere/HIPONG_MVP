/*// pages/recommendation/recommendation.js
const { BASE_URL } = require("../../config/config.js");

Page({
  data: {
    // 原始表单数据，从上一页加载
    form: {},
    // 推荐地点列表
    recoList: [
      {
        id: "s1",
        name: "滨江龙湖天街",
        transit: 46,
        drive: 24,
        price: 80,
        cover: "/assets/pic/in77.jpg", // 【修正】使用存在的图片
      },
      {
        id: "s2",
        name: "万象城",
        transit: 38,
        drive: 20,
        price: 68,
        cover: "/assets/pic/西湖.jpg", // 【修正】使用存在的图片
      },
      {
        id: "s3",
        name: "西湖集市",
        transit: 42,
        drive: 22,
        price: 75,
        cover: "/assets/pic/千岛湖.jpg", // 【修正】使用存在的图片
      },
      {
        id: "s4",
        name: "海底捞",
        transit: 46,
        drive: 30,
        price: 90,
        cover: "/assets/pic/露营基地.jpg", // 【修正】使用存在的图片
      },
    ],
    // 相似推荐列表（这部分逻辑保持不变）
    similarList: [
      {
        id: "s1",
        name: "滨江龙湖天街",
        transit: 46,
        drive: 24,
        price: 80,
        cover: "/assets/pic/in77.jpg", // 【修正】使用存在的图片
      },
      {
        id: "s2",
        name: "万象城",
        transit: 38,
        drive: 20,
        price: 68,
        cover: "/assets/pic/西湖.jpg", // 【修正】使用存在的图片
      },
      {
        id: "s3",
        name: "西湖集市",
        transit: 42,
        drive: 22,
        price: 75,
        cover: "/assets/pic/千岛湖.jpg", // 【修正】使用存在的图片
      },
      {
        id: "s4",
        name: "海底捞",
        transit: 46,
        drive: 30,
        price: 90,
        cover: "/assets/pic/露营基地.jpg", // 【修正】使用存在的图片
      },
    ],
    // --- 新增：用于多轮对话功能的数据 ---
    userInput: "", // 存储用户在输入框里输入的内容
    isGenerating: false,
    pollingTimer: null,
  },

  onLoad() {
    // 1. 加载上一页的表单数据（逻辑不变）
    tt.getStorage({
      key: "lastPlanForm",
      success: (res) => this.setData({ form: res.data || {} }),
    });

    // 2. 尝试获取由大模型生成的初始推荐列表（逻辑不变）
    tt.getStorage({
      key: "llmRecommendations",
      success: (res) => {
        if (res.data && Array.isArray(res.data) && res.data.length > 0) {
          console.log("成功获取到AI推荐结果，将替换默认列表:", res.data);
          this.setData({ recoList: res.data });
        } else {
          console.log("未找到有效的AI推荐结果，将使用页面默认的示例数据。");
        }
      },
      fail: () => {
        console.log("获取AI推荐结果失败，将使用页面默认的示例数据。");
      },
      complete: () => {
        tt.removeStorage({ key: "llmRecommendations" });
      },
    });
  },

  // --- 新增：处理用户输入变化的函数 ---
  onInput(e) {
    this.setData({
      userInput: e.detail.value,
    });
  },

  // --- 新增：点击“发送”按钮，进行多轮对话的核心函数 ---
  // --- 【改造后】点击“发送”按钮，启动多轮对话任务 ---
  refineRecommendations() {
    // 1. 安全检查
    if (this.data.isGenerating || !this.data.userInput.trim()) {
      tt.showToast({ title: "请输入你的想法哦", icon: "none" });
      return;
    }

    // 2. 设置状态，显示加载提示
    this.setData({ isGenerating: true });
    tt.showLoading({ title: "AI正在理解..." });

    // 3. 【新增】收集所有人的位置用于公平性计算
    const allLocations = [];
    if (
      this.data.form &&
      this.data.form.origin &&
      this.data.form.origin.latitude
    ) {
      allLocations.push(this.data.form.origin);
    }
    if (this.data.form && this.data.form.partners) {
      this.data.form.partners.forEach((p) => {
        if (p.latitude && p.longitude) {
          allLocations.push(p);
        }
      });
    }

    // 4. 构造请求数据（包含位置信息）
    const requestPayload = {
      originalQuery: this.data.form,
      currentResults: this.data.recoList,
      refinementRequest: this.data.userInput,
      allLocations: allLocations, // 【新增】所有人位置
      maxTransitTime: this.data.form?.maxTransitTime || 60, // 【新增】时间限制
    };

    console.log("启动重新生成任务，发送的数据:", requestPayload);
    console.log("【新增】参与位置计算的人数:", allLocations.length);

    // 5. 调用后端启动接口
    tt.request({
      url: `${BASE_URL}/refineRecommendations`,
      method: "POST",
      data: requestPayload,
      timeout: 20000,
      success: (res) => {
        if (
          res.statusCode === 200 &&
          res.data &&
          res.data.success &&
          res.data.recId
        ) {
          console.log(`成功启动任务，获取到ID: ${res.data.recId}`);
          this.pollForRefinedResults(res.data.recId);
        } else {
          console.error("启动重新生成任务失败:", res.data);
          tt.showToast({ title: res.data.message || "启动失败", icon: "none" });
          this.setData({ isGenerating: false });
          tt.hideLoading();
        }
      },
      fail: (err) => {
        console.error("请求启动任务网络失败:", err);
        tt.showToast({ title: "网络错误，请重试", icon: "none" });
        this.setData({ isGenerating: false });
        tt.hideLoading();
      },
    });
  },
  // --- 【新增】轮询获取优化后的推荐结果 ---
  pollForRefinedResults(recId) {
    console.log(`开始轮询优化任务 [${recId}]...`);
    tt.showLoading({ title: "AI正在生成新推荐..." }); // 持续显示加载

    if (this.data.pollingTimer) {
      clearInterval(this.data.pollingTimer);
    }

    let pollCount = 0;
    const MAX_POLLS = 20; // 20次 * 3秒 = 1分钟超时
    const POLLING_INTERVAL = 3000;

    const timer = setInterval(() => {
      pollCount++;
      if (pollCount > MAX_POLLS) {
        clearInterval(timer);
        this.setData({ isGenerating: false, pollingTimer: null });
        tt.hideLoading();
        tt.showToast({ title: "AI思考超时了", icon: "none" });
        return;
      }

      console.log(`...查询优化任务 [${recId}] 状态 (第 ${pollCount} 次)...`);
      tt.request({
        url: `${BASE_URL}/recommendation-status/${recId}`, // 【复用】同一个状态查询接口
        method: "GET",
        success: (res) => {
          if (res.statusCode === 200 && res.data && res.data.success) {
            const status = res.data.taskStatus;

            if (status.ready) {
              clearInterval(timer);
              this.setData({ isGenerating: false, pollingTimer: null });
              tt.hideLoading();

              if (status.success) {
                console.log(`🎉 优化任务 [${recId}] 成功完成！`);
                const newRecommendations = status.data.recommendations;

                if (newRecommendations && newRecommendations.length > 0) {
                  this.setData({
                    recoList: newRecommendations,
                    userInput: "", // 清空输入框
                  });
                  tt.showToast({ title: "已为您换一批", icon: "success" });
                } else {
                  tt.showToast({ title: "AI没有找到更合适的", icon: "none" });
                }
              } else {
                console.error(`❌ 优化任务 [${recId}] 失败:`, status.error);
                tt.showToast({
                  title: status.error || "换一批失败",
                  icon: "none",
                });
              }
            } else {
              // 任务仍在进行中，保持加载状态
              console.log(`...任务 [${recId}] 仍在处理中...`);
            }
          } else {
            clearInterval(timer);
            this.setData({ isGenerating: false, pollingTimer: null });
            tt.hideLoading();
            tt.showToast({ title: "查询结果失败", icon: "none" });
          }
        },
        fail: (err) => {
          console.error(`查询任务 [${recId}] 网络失败:`, err);
          clearInterval(timer);
          this.setData({ pollingTimer: null });
          tt.showToast({ title: "网络中断，请重试", icon: "none" });
          this.stopLoadingAnimation();
        },
      });
    }, POLLING_INTERVAL);

    this.setData({ pollingTimer: timer });
  },


  // 切换“喜欢”状态（逻辑不变）
  toggleLike(e) {
    const { idx, listName } = e.currentTarget.dataset;
    if (idx === undefined || !listName || !this.data[listName]) {
      return;
    }
    const key = `${listName}[${idx}].liked`;
    const currentValue = this.data[listName][idx].liked;
    this.setData({
      [key]: !currentValue,
    });
    console.log(
      `已将 ${listName} 中第 ${parseInt(idx) + 1} 项 "${
        this.data[listName][idx].name
      }" 的喜欢状态设置为: ${!currentValue}`
    );
  },
});
*/
// pages/generate-plan/generate-plan.js
// 【修复版】多轮对话推荐功能
const { BASE_URL } = require("../../config/config.js");

Page({
  data: {
    // 原始表单数据，从上一页加载
    form: {},
    // 推荐地点列表
    recoList: [
      {
        id: "s1",
        name: "滨江龙湖天街",
        transit: 46,
        drive: 24,
        price: 80,
        cover: "/assets/pic/in77.jpg",
      },
      {
        id: "s2",
        name: "万象城",
        transit: 38,
        drive: 20,
        price: 68,
        cover: "/assets/pic/西湖.jpg",
      },
      {
        id: "s3",
        name: "西湖集市",
        transit: 42,
        drive: 22,
        price: 75,
        cover: "/assets/pic/千岛湖.jpg",
      },
      {
        id: "s4",
        name: "海底捞",
        transit: 46,
        drive: 30,
        price: 90,
        cover: "/assets/pic/露营基地.jpg",
      },
    ],
    // 相似推荐列表
    similarList: [
      {
        id: "s1",
        name: "滨江龙湖天街",
        transit: 46,
        drive: 24,
        price: 80,
        cover: "/assets/pic/in77.jpg",
      },
      {
        id: "s2",
        name: "万象城",
        transit: 38,
        drive: 20,
        price: 68,
        cover: "/assets/pic/西湖.jpg",
      },
      {
        id: "s3",
        name: "西湖集市",
        transit: 42,
        drive: 22,
        price: 75,
        cover: "/assets/pic/千岛湖.jpg",
      },
      {
        id: "s4",
        name: "海底捞",
        transit: 46,
        drive: 30,
        price: 90,
        cover: "/assets/pic/露营基地.jpg",
      },
    ],
    // 用于多轮对话功能的数据
    userInput: "", // 存储用户在输入框里输入的内容
    isGenerating: false,
    pollingTimer: null,
  },

  onLoad() {
    // 1. 加载上一页的表单数据
    tt.getStorage({
      key: "lastPlanForm",
      success: (res) => this.setData({ form: res.data || {} }),
    });

    // 2. 尝试获取由大模型生成的初始推荐列表
    tt.getStorage({
      key: "llmRecommendations",
      success: (res) => {
        if (res.data && Array.isArray(res.data) && res.data.length > 0) {
          console.log("成功获取到AI推荐结果，将替换默认列表:", res.data);
          this.setData({ recoList: res.data });
        } else {
          console.log("未找到有效的AI推荐结果，将使用页面默认的示例数据。");
        }
      },
      fail: () => {
        console.log("获取AI推荐结果失败，将使用页面默认的示例数据。");
      },
      complete: () => {
        tt.removeStorage({ key: "llmRecommendations" });
      },
    });
  },

  // 处理用户输入变化的函数
  onInput(e) {
    this.setData({
      userInput: e.detail.value,
    });
  },

  // 点击"发送"按钮，启动多轮对话任务
  refineRecommendations() {
    // 1. 安全检查
    if (this.data.isGenerating || !this.data.userInput.trim()) {
      tt.showToast({ title: "请输入你的想法哦", icon: "none" });
      return;
    }

    // 2. 设置状态，显示加载提示
    this.setData({ isGenerating: true });
    tt.showLoading({ title: "AI正在理解..." });

    // 3. 收集所有人的位置用于公平性计算
    const allLocations = [];
    if (
      this.data.form &&
      this.data.form.origin &&
      this.data.form.origin.latitude
    ) {
      allLocations.push(this.data.form.origin);
    }
    if (this.data.form && this.data.form.partners) {
      this.data.form.partners.forEach((p) => {
        if (p.latitude && p.longitude) {
          allLocations.push(p);
        }
      });
    }

    // 4. 构造请求数据（包含位置信息）
    const requestPayload = {
      originalQuery: this.data.form,
      currentResults: this.data.recoList,
      refinementRequest: this.data.userInput,
      allLocations: allLocations,
      maxTransitTime: this.data.form?.maxTransitTime || 60,
      maxBudget: this.data.form.budgetMax ? parseFloat(this.data.form.budgetMax) : null, // 【新增】最大预算
      minBudget: this.data.form.budgetMin ? parseFloat(this.data.form.budgetMin) : null, // 【新增】最小预算
    };

    console.log("启动重新生成任务，发送的数据:", requestPayload);
    console.log("参与位置计算的人数:", allLocations.length);

    // 5. 调用后端启动接口
    tt.request({
      url: `${BASE_URL}/refineRecommendations`,  // 【正确】使用模板字符串
      method: "POST",
      data: requestPayload,
      timeout: 20000,
      success: (res) => {
        if (
          res.statusCode === 200 &&
          res.data &&
          res.data.success &&
          res.data.recId
        ) {
          console.log(`成功启动任务，获取到ID: ${res.data.recId}`);
          this.pollForRefinedResults(res.data.recId);
        } else {
          console.error("启动重新生成任务失败:", res.data);
          tt.showToast({ title: res.data.message || "启动失败", icon: "none" });
          this.setData({ isGenerating: false });
          tt.hideLoading();
        }
      },
      fail: (err) => {
        console.error("请求启动任务网络失败:", err);
        tt.showToast({ title: "网络错误，请重试", icon: "none" });
        this.setData({ isGenerating: false });
        tt.hideLoading();
      },
    });
  },

  // 轮询获取优化后的推荐结果
  pollForRefinedResults(recId) {
    console.log(`开始轮询优化任务 [${recId}]...`);
    tt.showLoading({ title: "AI正在生成新推荐..." });

    if (this.data.pollingTimer) {
      clearInterval(this.data.pollingTimer);
    }

    let pollCount = 0;
    const MAX_POLLS = 20; // 20次 * 3秒 = 1分钟超时
    const POLLING_INTERVAL = 3000;

    const timer = setInterval(() => {
      pollCount++;
      if (pollCount > MAX_POLLS) {
        clearInterval(timer);
        this.setData({ isGenerating: false, pollingTimer: null });
        tt.hideLoading();
        tt.showToast({ title: "AI思考超时了", icon: "none" });
        return;
      }

      console.log(`...查询优化任务 [${recId}] 状态 (第 ${pollCount} 次)...`);
      tt.request({
        // 【修复】去掉多余的 /api 前缀，与后端路由保持一致
        url: `${BASE_URL}/recommendation-status/${recId}`,
        method: "GET",
        success: (res) => {
          if (res.statusCode === 200 && res.data && res.data.success) {
            const status = res.data.taskStatus;

            if (status.ready) {
              clearInterval(timer);
              this.setData({ isGenerating: false, pollingTimer: null });
              tt.hideLoading();

              if (status.success) {
                console.log(`🎉 优化任务 [${recId}] 成功完成！`);
                const newRecommendations = status.data.recommendations;

                if (newRecommendations && newRecommendations.length > 0) {
                  this.setData({
                    recoList: newRecommendations,
                    userInput: "", // 清空输入框
                  });
                  tt.showToast({ title: "已为您换一批", icon: "success" });
                } else {
                  tt.showToast({ title: "AI没有找到更合适的", icon: "none" });
                }
              } else {
                console.error(`❌ 优化任务 [${recId}] 失败:`, status.error);
                tt.showToast({
                  title: status.error || "换一批失败",
                  icon: "none",
                });
              }
            } else {
              // 任务仍在进行中，保持加载状态
              console.log(`...任务 [${recId}] 仍在处理中...`);
            }
          } else {
            clearInterval(timer);
            this.setData({ isGenerating: false, pollingTimer: null });
            tt.hideLoading();
            tt.showToast({ title: "查询结果失败", icon: "none" });
          }
        },
        fail: (err) => {
          console.error(`查询任务 [${recId}] 网络失败:`, err);
          clearInterval(timer);
          this.setData({ isGenerating: false, pollingTimer: null });
          tt.hideLoading();
          tt.showToast({ title: "网络中断，请重试", icon: "none" });
        },
      });
    }, POLLING_INTERVAL);

    this.setData({ pollingTimer: timer });
  },

  // 【已删除】callLlmApi 函数是旧版遗留代码，已被上面的异步轮询模式替代

  // 切换"喜欢"状态
  toggleLike(e) {
    const { idx, listName } = e.currentTarget.dataset;
    if (idx === undefined || !listName || !this.data[listName]) {
      return;
    }
    const key = `${listName}[${idx}].liked`;
    const currentValue = this.data[listName][idx].liked;
    this.setData({
      [key]: !currentValue,
    });
    console.log(
      `已将 ${listName} 中第 ${parseInt(idx) + 1} 项 "${
        this.data[listName][idx].name
      }" 的喜欢状态设置为: ${!currentValue}`
    );
  },

  // 页面卸载时清理定时器
  onUnload() {
    if (this.data.pollingTimer) {
      clearInterval(this.data.pollingTimer);
    }
  },
});
