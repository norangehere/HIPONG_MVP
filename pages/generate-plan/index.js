(() => {
  const DEFAULT_RECO_LIST = [
    {
      id: "s1",
      name: "城市美术馆",
      transit: 46,
      drive: 24,
      price: 80,
      cover: "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/museum.jpg",
      reason: "氛围感强，适合拍照打卡"
    },
    {
      id: "s2",
      name: "天目山徒步",
      transit: 38,
      drive: 20,
      price: 68,
      cover: "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/mount.jpg",
      reason: "轻徒步体验，风景开阔"
    },
    {
      id: "s3",
      name: "玉渡山露营",
      transit: 42,
      drive: 22,
      price: 75,
      cover: "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/%E7%8E%89%E6%B8%A1%E5%B1%B1.jpg",
      reason: "夜景与星空体验佳"
    },
    {
      id: "s4",
      name: "798艺术区",
      transit: 46,
      drive: 30,
      price: 90,
      cover: "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/798.jpg",
      reason: "艺术氛围浓厚"
    }
  ];

  const DEFAULT_SIMILAR_LIST = [
    {
      id: "s5",
      name: "日本",
      transit: 46,
      drive: 24,
      price: 4800,
      cover: "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/%E6%97%A5%E6%9C%AC.jpg"
    },
    {
      id: "s6",
      name: "千岛湖",
      transit: 38,
      drive: 20,
      price: 420,
      cover: "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/%E5%8D%83%E5%B2%9B%E6%B9%96.jpg"
    },
    {
      id: "s7",
      name: "露营基地",
      transit: 42,
      drive: 22,
      price: 260,
      cover: "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/%E9%9C%B2%E8%90%A5%E5%9F%BA%E5%9C%B0.jpg"
    },
    {
      id: "s8",
      name: "西湖",
      transit: 46,
      drive: 30,
      price: 180,
      cover: "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/%E8%A5%BF%E6%B9%96.jpg"
    }
  ];

  const state = {
    recoList: DEFAULT_RECO_LIST.map((item) => ({ ...item })),
    similarList: DEFAULT_SIMILAR_LIST.map((item) => ({ ...item })),
    userInput: "",
    isGenerating: false,
    pollingTimer: null,
    baseUrl: "",
    originalQuery: null
  };

  const els = {};
  let toastTimer;

  function cacheElements() {
    els.recoList = document.getElementById("recoList");
    els.similarList = document.getElementById("similarList");
    els.chatInput = document.getElementById("chatInput");
    els.sendBtn = document.getElementById("sendBtn");
    els.chatInputContainer = document.getElementById("chatInputContainer");
    els.toast = document.getElementById("toast");
    els.backBtn = document.getElementById("backBtn");
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

  function setGenerating(isGenerating) {
    state.isGenerating = isGenerating;
    if (els.chatInput) {
      els.chatInput.disabled = isGenerating;
    }
    if (els.sendBtn) {
      els.sendBtn.disabled = isGenerating;
    }
    if (els.chatInputContainer) {
      els.chatInputContainer.classList.toggle("disabled", isGenerating);
    }
  }

  function createCard(item, listName, index) {
    const card = document.createElement("div");
    card.className = "card";

    const pic = document.createElement("div");
    pic.className = "pic";

    if (item.cover) {
      const img = document.createElement("img");
      img.src = item.cover;
      img.alt = item.name || "推荐图片";
      pic.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "pic-placeholder";
      placeholder.textContent = "暂无图片";
      pic.appendChild(placeholder);
    }

    const body = document.createElement("div");
    body.className = "card-body";

    const row = document.createElement("div");
    row.className = "row";

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = item.name || "推荐地点";

    const likeBtn = document.createElement("button");
    likeBtn.className = `icon-like${item.liked ? " liked" : ""}`;
    likeBtn.type = "button";
    likeBtn.setAttribute("aria-pressed", item.liked ? "true" : "false");
    likeBtn.textContent = "♥";
    likeBtn.dataset.idx = index;
    likeBtn.dataset.listName = listName;

    row.appendChild(name);
    row.appendChild(likeBtn);

    body.appendChild(row);

    if (item.reason) {
      const reason = document.createElement("span");
      reason.className = "reason";
      reason.textContent = `✦ ${item.reason}`;
      body.appendChild(reason);
    }

    const metaTransit = document.createElement("span");
    metaTransit.className = "meta";
    metaTransit.textContent = `路 公共交通 ${item.transit ?? "-"}min`;

    const metaDrive = document.createElement("span");
    metaDrive.className = "meta";
    metaDrive.textContent = `路 驾车 ${item.drive ?? "-"}min`;

    const metaPrice = document.createElement("span");
    metaPrice.className = "meta";
    metaPrice.textContent = `路 人均 ¥${item.price ?? "-"}`;

    body.appendChild(metaTransit);
    body.appendChild(metaDrive);
    body.appendChild(metaPrice);

    card.appendChild(pic);
    card.appendChild(body);
    return card;
  }

  function renderList(list, container, listName) {
    if (!container) return;
    container.innerHTML = "";
    list.forEach((item, index) => {
      container.appendChild(createCard(item, listName, index));
    });
  }

  function render() {
    renderList(state.recoList, els.recoList, "recoList");
    renderList(state.similarList, els.similarList, "similarList");
  }

  function toggleLike(idx, listName) {
    const list = state[listName];
    if (!list || !list[idx]) return;
    list[idx].liked = !list[idx].liked;
    render();
  }

  function getBaseUrl() {
    const bodyBaseUrl = document.body?.dataset?.baseUrl?.trim();
    return bodyBaseUrl || state.baseUrl || window.location.origin || "";
  }

  async function loadConfig() {
    try {
      const res = await fetch("../../index.json", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.baseUrl === "string") {
        state.baseUrl = data.baseUrl.trim();
      }
    } catch (error) {
      console.warn("读取 index.json 失败，将使用默认配置", error);
    }
  }

  function normalizeRecommendation(item, index) {
    const price =
      item?.business?.cost && item.business.cost !== "??"
        ? item.business.cost
        : item?.cost || item?.price || 0;
    return {
      id: item.id || `r-${index}`,
      name: item.name || item.title || "????",
      transit: item.transit ?? item.transitTime ?? 0,
      drive: item.drive ?? item.driveTime ?? 0,
      price: price || 0,
      cover: item.cover || item.imageUrl || item.photos?.[0]?.url || "",
      reason: item.reason || "",
      address: item.address || ""
    };
  }

  function buildCurrentResults() {
    return state.recoList.map((item) => ({
      id: item.id,
      name: item.name,
      address: item.address || "",
      location: item.location || ""
    }));
  }

  function loadStoredRecommendations() {
    const stored = localStorage.getItem("llmRecommendations");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length) {
        state.recoList = parsed.map((item, index) => normalizeRecommendation(item, index));
      }
    } catch (error) {
      console.warn("解析 llmRecommendations 失败，将使用默认数据", error);
    } finally {
      localStorage.removeItem("llmRecommendations");
    }
  }

  function loadStoredForm() {
    const stored = localStorage.getItem("lastPlanForm");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (parsed) {
        state.originalQuery = parsed;
      }
    } catch (error) {
      console.warn("?? lastPlanForm ??", error);
    }
  }

  function simulateRefine() {
    const shuffled = state.recoList
      .map((item) => ({ sort: Math.random(), item }))
      .sort((a, b) => a.sort - b.sort)
      .map((entry) => entry.item);
    state.recoList = shuffled;
    state.userInput = "";
    if (els.chatInput) {
      els.chatInput.value = "";
    }
    render();
    showToast("已根据你的想法更新推荐");
  }

  async function refineRecommendations() {
    if (state.isGenerating) return;
    const inputValue = els.chatInput ? els.chatInput.value.trim() : "";
    if (!inputValue) {
      showToast("请输入你的想法");
      return;
    }

    state.userInput = inputValue;
    setGenerating(true);

    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      setTimeout(() => {
        setGenerating(false);
        simulateRefine();
      }, 900);
      return;
    }

    const originalQuery =
      state.originalQuery ||
      (localStorage.getItem("lastPlanForm")
        ? JSON.parse(localStorage.getItem("lastPlanForm"))
        : null);

    const requestPayload = {
      refinementRequest: inputValue,
      currentResults: buildCurrentResults(),
      originalQuery: originalQuery || {
        preferenceText: state.userInput,
        origin: { latitude: 30.2741, longitude: 120.1551, name: "?????" }
      }
    };

    try {
      const res = await fetch(`${baseUrl}/refineRecommendations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload)
      });
      const data = await res.json();
      if (data && data.success && data.recId) {
        pollForRefinedResults(baseUrl, data.recId);
      } else {
        throw new Error(data?.message || "启动失败");
      }
    } catch (error) {
      console.warn("请求优化失败，已切换为本地模拟", error);
      setGenerating(false);
      simulateRefine();
    }
  }

  function pollForRefinedResults(baseUrl, recId) {
    if (state.pollingTimer) {
      clearInterval(state.pollingTimer);
    }

    let pollCount = 0;
    const maxPolls = 20;
    const interval = 3000;

    state.pollingTimer = setInterval(async () => {
      pollCount += 1;
      if (pollCount > maxPolls) {
        clearInterval(state.pollingTimer);
        state.pollingTimer = null;
        setGenerating(false);
        showToast("AI 思考超时了");
        return;
      }

      try {
        const res = await fetch(`${baseUrl}/recommendation-status/${recId}`);
        const data = await res.json();
        if (!data || !data.success) {
          throw new Error("查询失败");
        }

        const status = data.taskStatus;
        if (!status || !status.ready) {
          return;
        }

        clearInterval(state.pollingTimer);
        state.pollingTimer = null;
        setGenerating(false);

        if (status.success && status.data?.recommendations?.length) {
          state.recoList = status.data.recommendations.map((item, index) => normalizeRecommendation(item, index));
          if (els.chatInput) {
            els.chatInput.value = "";
          }
          render();
          showToast("已为你更新一批推荐");
        } else {
          showToast(status.error || "AI 没有找到更合适的");
        }
      } catch (error) {
        clearInterval(state.pollingTimer);
        state.pollingTimer = null;
        setGenerating(false);
        showToast("网络异常，请稍后重试");
      }
    }, interval);
  }

  function bindEvents() {
    if (els.recoList) {
      els.recoList.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.classList.contains("icon-like")) {
          toggleLike(Number(target.dataset.idx), target.dataset.listName);
        }
      });
    }

    if (els.similarList) {
      els.similarList.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.classList.contains("icon-like")) {
          toggleLike(Number(target.dataset.idx), target.dataset.listName);
        }
      });
    }

    if (els.sendBtn) {
      els.sendBtn.addEventListener("click", refineRecommendations);
    }

    if (els.chatInput) {
      els.chatInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          refineRecommendations();
        }
      });
    }

    if (els.backBtn) {
      els.backBtn.addEventListener("click", () => {
        window.location.href = "../../index.html";
      });
    }
  }

  async function init() {
    cacheElements();
    await loadConfig();
    loadStoredForm();
    loadStoredRecommendations();
    render();
    bindEvents();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
