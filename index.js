(() => {
  const DEFAULT_CONFIG = {
    title: "首页",
    baseUrl: "",
  };

  const DEFAULT_TEAM_PLANS = [
    {
      id: 49,
      name: "城市美术馆",
      rate: "4.8",
      imageUrl: "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/museum.jpg",
    },
    {
      id: 55,
      name: "天目山徒步",
      rate: "4.7",
      imageUrl: "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/mount.jpg",
    },
    {
      id: 61,
      name: "玉渡山露营",
      rate: "4.8",
      imageUrl:
        "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/%E7%8E%89%E6%B8%A1%E5%B1%B1.jpg",
    },
    {
      id: 64,
      name: "798艺术区",
      rate: "4.7",
      imageUrl: "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/798.jpg",
    },
  ];

  const DEFAULT_LIKES = [
    {
      name: "日本",
      rate: "4.5",
      tag: "购物+美食",
      imageUrl:
        "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/%E6%97%A5%E6%9C%AC.jpg",
    },
    {
      name: "千岛湖",
      rate: "4.8",
      tag: "自然+美食",
      imageUrl:
        "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/%E5%8D%83%E5%B2%9B%E6%B9%96.jpg",
    },
    {
      name: "露营基地",
      rate: "4.8",
      tag: "自然+美食",
      imageUrl:
        "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/%E9%9C%B2%E8%90%A5%E5%9F%BA%E5%9C%B0.jpg",
    },
    {
      name: "西湖",
      rate: "4.8",
      tag: "自然+美食",
      imageUrl:
        "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/%E8%A5%BF%E6%B9%96.jpg",
    },
  ];

  const state = {
    teamPlans: [],
    likes: DEFAULT_LIKES.slice(),
  };

  const config = { ...DEFAULT_CONFIG };

  const els = {};
  let toastTimer;

  function cacheElements() {
    els.startBtn = document.getElementById("startBtn");
    els.teamPlanBtn = document.getElementById("teamPlanBtn");
    els.socialMatchBtn = document.getElementById("socialMatchBtn");
    els.teamPlans = document.getElementById("teamPlans");
    els.likes = document.getElementById("likes");
    els.toast = document.getElementById("toast");
    els.socialModal = document.getElementById("socialModal");
    els.socialModalMask = document.getElementById("socialModalMask");
    els.socialModalClose = document.getElementById("socialModalClose");
    els.socialModalOk = document.getElementById("socialModalOk");
  }

  async function loadConfig() {
    const bodyBaseUrl = document.body?.dataset?.baseUrl?.trim();
    if (bodyBaseUrl) {
      config.baseUrl = bodyBaseUrl;
    }

    try {
      // 本地文件访问时的降级处理
      if (window.location.protocol === "file:") {
        console.log("本地文件访问，使用默认配置");
        return;
      }

      const res = await fetch("index.json", { cache: "no-store" });
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      if (typeof data.title === "string" && data.title.trim()) {
        config.title = data.title.trim();
      }
      if (typeof data.baseUrl === "string") {
        config.baseUrl = data.baseUrl.trim();
      }
    } catch (error) {
      console.warn("读取 index.json 失败，将使用默认配置", error);
    }
  }

  function showToast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add("show");
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(() => {
      els.toast.classList.remove("show");
    }, 2200);
  }

  function setModalVisible(el, visible) {
    if (!el) return;
    el.hidden = !visible;
    el.setAttribute("aria-hidden", visible ? "false" : "true");
    document.body.classList.toggle("no-scroll", visible);
  }

  function openSocialModal() {
    setModalVisible(els.socialModal, true);
  }

  function closeSocialModal() {
    setModalVisible(els.socialModal, false);
  }

  function renderTeamPlans() {
    if (!els.teamPlans) return;
    els.teamPlans.innerHTML = "";

    if (!state.teamPlans.length) {
      const emptyTile = document.createElement("div");
      emptyTile.className = "tile htile";
      emptyTile.textContent = "加载中...";
      els.teamPlans.appendChild(emptyTile);
      return;
    }

    state.teamPlans.forEach((item) => {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "tile htile button";
      tile.dataset.id = item.id;

      const img = document.createElement("img");
      img.className = "thumb";
      img.src = item.imageUrl;
      img.alt = item.name || "团建方案";

      const meta = document.createElement("div");
      meta.className = "meta meta-col";

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = item.name || "团建方案";

      const rate = document.createElement("span");
      rate.className = "rate";
      rate.textContent = item.rate || "4.8";

      meta.appendChild(name);
      meta.appendChild(rate);

      tile.appendChild(img);
      tile.appendChild(meta);

      els.teamPlans.appendChild(tile);
    });
  }

  function renderLikes() {
    if (!els.likes) return;
    els.likes.innerHTML = "";

    state.likes.forEach((item) => {
      const tile = document.createElement("div");
      tile.className = "tile htile";

      const img = document.createElement("img");
      img.className = "thumb";
      img.src = item.imageUrl;
      img.alt = item.name || "组局推荐";

      const meta = document.createElement("div");
      meta.className = "meta";

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = item.name || "组局推荐";

      const rate = document.createElement("span");
      rate.className = "rate";
      rate.textContent = item.rate || "4.8";

      const tag = document.createElement("div");
      tag.className = "tag";
      tag.textContent = item.tag || "";

      meta.appendChild(name);
      meta.appendChild(rate);

      tile.appendChild(img);
      tile.appendChild(meta);
      tile.appendChild(tag);

      els.likes.appendChild(tile);
    });
  }

  async function loadTopPlans() {
    console.log("loadTopPlans 被调用");
    renderTeamPlans();

    if (!config.baseUrl) {
      console.log("没有配置baseUrl，使用默认数据");
      state.teamPlans = DEFAULT_TEAM_PLANS.slice();
      renderTeamPlans();
      return;
    }

    console.log("准备请求后端数据");

    try {
      console.log("准备请求后端数据");

      // 添加超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

      console.log(
        "正在请求后端:",
        `${config.baseUrl}/api/plans/by-ids?ids=49,55,61,64`
      );
      const res = await fetch(
        `${config.baseUrl}/api/plans/by-ids?ids=49,55,61,64`,
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);
      console.log("后端响应状态:", res.status);
      if (!res.ok) {
        throw new Error("请求失败");
      }
      const payload = await res.json();
      console.log("后端返回数据:", payload);
      if (!payload || !payload.success) {
        throw new Error("数据返回异常");
      }

      const imgs = [
        "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/museum.jpg",
        "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/mount.jpg",
        "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/%E7%8E%89%E6%B8%A1%E5%B1%B1.jpg",
        "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/798.jpg",
      ];

      const randomRate = () => (Math.random() < 0.5 ? "4.8" : "4.7");

      state.teamPlans = (payload.data || []).map((item, index) => ({
        id: item.id,
        name: item.title || `方案${item.id}`,
        rate: randomRate(),
        imageUrl: imgs[index % imgs.length],
      }));

      if (!state.teamPlans.length) {
        state.teamPlans = DEFAULT_TEAM_PLANS.slice();
      }

      renderTeamPlans();
    } catch (error) {
      console.error("=== 请求后端失败 ===");
      console.error("错误信息:", error);
      console.error("错误类型:", error.name);
      console.error("错误消息:", error.message);
      console.warn("加载高分方案失败", error);
      state.teamPlans = DEFAULT_TEAM_PLANS.slice();
      renderTeamPlans();
    }
  }

  function handleTeamPlanClick(planId) {
    showToast(`已选择方案 ${planId}，请接入详情页跳转`);
  }

  function handleQuickAction(actionName) {
    showToast(`准备跳转：${actionName}`);
  }

  function bindEvents() {
    if (els.startBtn) {
      els.startBtn.addEventListener("click", () => {
        window.location.href = "pages/plan/index.html";
      });
    }

    if (els.teamPlanBtn) {
      els.teamPlanBtn.addEventListener("click", () => {
        window.location.href = "pages/team-plan/index.html";
      });
    }

    if (els.socialMatchBtn) {
      els.socialMatchBtn.addEventListener("click", openSocialModal);
    }

    if (els.teamPlans) {
      els.teamPlans.addEventListener("click", (event) => {
        const tile = event.target.closest("[data-id]");
        if (!tile) return;
        handleTeamPlanClick(tile.dataset.id);
      });
    }

    if (els.socialModalMask) {
      els.socialModalMask.addEventListener("click", closeSocialModal);
    }
    if (els.socialModalClose) {
      els.socialModalClose.addEventListener("click", closeSocialModal);
    }
    if (els.socialModalOk) {
      els.socialModalOk.addEventListener("click", closeSocialModal);
    }
  }

  async function init() {
    console.log("开始初始化...");
    cacheElements();
    console.log("元素缓存完成");
    await loadConfig();
    console.log("配置加载完成:", config);
    document.title = config.title;
    bindEvents();
    console.log("事件绑定完成");
    renderLikes();
    console.log("喜欢列表渲染完成");
    await loadTopPlans();
    console.log("初始化完成");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
