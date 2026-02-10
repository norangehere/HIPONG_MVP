(() => {
  const STEP_TITLES = ["基本信息", "选择出发点", "个人偏好"];
  const AMAP_KEY = "c644dfe4025597410cbdf2b6de3bd8d2";

  const DEFAULT_ORIGIN = {
    latitude: 30.2741,
    longitude: 120.1551,
    name: "默认出发点",
    address: "",
  };

  const state = {
    currentStep: 0,
    selectedTypes: new Set(),
    baseUrl: "",
    isGenerating: false,
    pollingTimer: null,
    origin: { ...DEFAULT_ORIGIN },
    map: null,
    mapMarker: null,
    mapError: false,
    regeoRequestId: 0,
  };

  const els = {};
  let toastTimer;

  function cacheElements() {
    els.stepDots = document.getElementById("stepDots");
    els.stepTitle = document.getElementById("stepTitle");
    els.progressFill = document.getElementById("progressFill");
    els.progressText = document.getElementById("progressText");
    els.prevStepBtn = document.getElementById("prevStepBtn");
    els.nextStepBtn = document.getElementById("nextStepBtn");
    els.generateBtn = document.getElementById("generateBtn");
    els.backBtn = document.getElementById("backBtn");
    els.steps = Array.from(document.querySelectorAll(".step"));
    els.toast = document.getElementById("toast");
    els.distanceRange = document.getElementById("distanceRange");
    els.transitRange = document.getElementById("transitRange");
    els.taxiRange = document.getElementById("taxiRange");
    els.distanceValue = document.getElementById("distanceValue");
    els.transitValue = document.getElementById("transitValue");
    els.taxiValue = document.getElementById("taxiValue");
    els.originName = document.getElementById("originName");
    els.originAddress = document.getElementById("originAddress");
    els.originMap = document.getElementById("originMap");
    els.originCoords = document.getElementById("originCoords");

    // 调试信息
    console.log("缓存的元素:");
    console.log("generateBtn:", els.generateBtn);
    console.log("所有按钮:", document.querySelectorAll("button"));
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
    if (els.generateBtn) {
      els.generateBtn.disabled = isGenerating;
      els.generateBtn.textContent = isGenerating
        ? "正在生成..."
        : "开始推荐目的地";
    }
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

  function renderStepDots() {
    if (!els.stepDots) return;
    els.stepDots.innerHTML = "";
    STEP_TITLES.forEach((_, index) => {
      const dot = document.createElement("span");
      dot.className = `step-dot${index === state.currentStep ? " active" : ""}`;
      els.stepDots.appendChild(dot);
    });
  }

  function updateProgress() {
    const percent = Math.round(
      ((state.currentStep + 1) / STEP_TITLES.length) * 100
    );
    if (els.progressFill) {
      els.progressFill.style.width = `${percent}%`;
    }
    if (els.progressText) {
      els.progressText.textContent = `${percent}%`;
    }
    if (els.stepTitle) {
      els.stepTitle.textContent = STEP_TITLES[state.currentStep];
    }
    if (els.prevStepBtn) {
      els.prevStepBtn.disabled = state.currentStep === 0;
    }
    if (els.nextStepBtn) {
      els.nextStepBtn.disabled = state.currentStep === STEP_TITLES.length - 1;
    }
  }

  function showStep(step) {
    state.currentStep = Math.max(0, Math.min(step, STEP_TITLES.length - 1));
    if (els.steps) {
      els.steps.forEach((section) => {
        const sectionStep = Number(section.dataset.step);
        section.classList.toggle(
          "step-active",
          sectionStep === state.currentStep
        );
      });
    }
    renderStepDots();
    updateProgress();
    if (state.currentStep === 1) {
      ensureMap();
      refreshMapSize();
    }
  }

  function updateRangeValue(rangeEl, valueEl) {
    if (!rangeEl || !valueEl) return;
    valueEl.textContent = rangeEl.value;
  }

  function formatCoords(lat, lng) {
    if (typeof lat !== "number" || typeof lng !== "number") return "";
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  function syncOriginCoordsDisplay() {
    if (!els.originCoords) return;
    els.originCoords.textContent = formatCoords(
      state.origin.latitude,
      state.origin.longitude
    );
  }

  function syncOriginStateFromInputs() {
    if (els.originName) {
      state.origin.name = els.originName.value.trim();
    }
    if (els.originAddress) {
      state.origin.address = els.originAddress.value.trim();
    }
  }

  function setOriginFromMap(lat, lng) {
    const coordsText = formatCoords(lat, lng);
    state.origin.latitude = lat;
    state.origin.longitude = lng;

    const nameInput = els.originName?.value?.trim();
    const addressInput = els.originAddress?.value?.trim();

    state.origin.address = coordsText;
    if (els.originAddress) {
      els.originAddress.value = coordsText;
    }

    if (!nameInput) {
      state.origin.name = "地图选点";
      if (els.originName) {
        els.originName.value = state.origin.name;
      }
    } else {
      state.origin.name = nameInput;
    }

    syncOriginCoordsDisplay();
  }

  async function reverseGeocode(lat, lng) {
    const url = new URL("https://restapi.amap.com/v3/geocode/regeo");
    url.searchParams.set("key", AMAP_KEY);
    url.searchParams.set("location", `${lng},${lat}`);
    url.searchParams.set("extensions", "base");

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error("逆地理编码请求失败");
    }
    const data = await res.json();
    if (data?.status !== "1" || !data.regeocode) {
      throw new Error(data?.info || "逆地理编码失败");
    }

    const address = data.regeocode.formatted_address || "未知位置";
    const poiName = data.regeocode?.pois?.[0]?.name;
    return {
      name: poiName || address,
      address,
    };
  }

  function applyReverseGeocode(lat, lng) {
    const requestId = ++state.regeoRequestId;
    reverseGeocode(lat, lng)
      .then((result) => {
        if (requestId !== state.regeoRequestId) return;
        state.origin.name = result.name;
        state.origin.address = result.address;
        if (els.originName) {
          els.originName.value = result.name;
        }
        if (els.originAddress) {
          els.originAddress.value = result.address;
        }
        syncOriginCoordsDisplay();
      })
      .catch((error) => {
        console.warn("逆地理编码失败:", error);
        showToast("地址解析失败，请重试");
      });
  }

  function ensureMap() {
    if (state.map || !els.originMap) return;
    if (!window.L) {
      if (!state.mapError) {
        showToast("地图组件加载失败，请检查网络");
        state.mapError = true;
      }
      return;
    }

    const { latitude, longitude } = state.origin;
    state.map = window.L.map(els.originMap, { zoomControl: true }).setView(
      [latitude, longitude],
      13
    );

    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(state.map);

    state.mapMarker = window.L.marker([latitude, longitude], {
      draggable: true,
    }).addTo(state.map);

    state.map.on("click", (event) => {
      const { lat, lng } = event.latlng || {};
      if (typeof lat !== "number" || typeof lng !== "number") return;
      state.mapMarker.setLatLng([lat, lng]);
      setOriginFromMap(lat, lng);
      applyReverseGeocode(lat, lng);
    });

    state.mapMarker.on("drag", () => {
      const { lat, lng } = state.mapMarker.getLatLng();
      setOriginFromMap(lat, lng);
    });

    state.mapMarker.on("dragend", () => {
      const { lat, lng } = state.mapMarker.getLatLng();
      setOriginFromMap(lat, lng);
      applyReverseGeocode(lat, lng);
    });

    setOriginFromMap(latitude, longitude);
    applyReverseGeocode(latitude, longitude);
  }

  function refreshMapSize() {
    if (!state.map) return;
    setTimeout(() => {
      state.map.invalidateSize();
    }, 80);
  }

  function getFieldValue(id) {
    const el = document.getElementById(id);
    if (!el) return "";
    return el.value?.trim() || "";
  }

  function collectFormData() {
    const originNameInput = getFieldValue("originName");
    const originAddressInput = getFieldValue("originAddress");
    const originName =
      originNameInput || state.origin.name || DEFAULT_ORIGIN.name;
    const originAddress =
      originAddressInput || state.origin.address || DEFAULT_ORIGIN.address;
    const originLatitude = state.origin.latitude ?? DEFAULT_ORIGIN.latitude;
    const originLongitude = state.origin.longitude ?? DEFAULT_ORIGIN.longitude;
    const form = {
      planName: getFieldValue("planName"),
      budgetMin: getFieldValue("budgetMin"),
      budgetMax: getFieldValue("budgetMax"),
      playDate: getFieldValue("playDate"),
      startTime: getFieldValue("startTime"),
      endTime: getFieldValue("endTime"),
      origin: {
        name: originName || DEFAULT_ORIGIN.name,
        address: originAddress || DEFAULT_ORIGIN.address,
        latitude: originLatitude,
        longitude: originLongitude,
      },
      partners: getFieldValue("partners")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((name, index) => ({ id: Date.now() + index, name })),
      distance: Number(els.distanceRange?.value || 10),
      maxTransitTime: Number(els.transitRange?.value || 60),
      taxiTime: Number(els.taxiRange?.value || 20),
      types: Array.from(state.selectedTypes),
      prefs: getFieldValue("prefs"),
    };
    return form;
  }

  function validateForm(form) {
    if (!form.planName) {
      showToast("请填写计划名称");
      showStep(0);
      return false;
    }
    if (!form.origin.name) {
      showToast("请填写出发点名称");
      showStep(1);
      return false;
    }
    return true;
  }

  function mapPoiToCard(item, index) {
    const price =
      item?.business?.cost && item.business.cost !== "暂无"
        ? item.business.cost
        : item?.cost || item?.price || "";
    return {
      id: item.id || `poi-${index}`,
      name: item.name || "推荐地点",
      transit: item.transitTime ?? item.transit ?? null,
      drive: item.drivingTime ?? item.drive ?? null,
      price: price || "-",
      cover: item.photos?.[0]?.url || item.cover || "",
      address: item.address || "",
      liked: false,
    };
  }

  function storeRecommendations(pois, originalQuery) {
    const mapped = Array.isArray(pois) ? pois.map(mapPoiToCard) : [];
    localStorage.setItem("llmRecommendations", JSON.stringify(mapped));
    if (originalQuery) {
      localStorage.setItem("lastPlanForm", JSON.stringify(originalQuery));
    }
  }

  function pollForRecommendations(baseUrl, recId, fallbackForm) {
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

        if (status.success && status.data?.pois?.length) {
          storeRecommendations(
            status.data.pois,
            status.data.originalQuery || fallbackForm
          );
          window.location.href = "../generate-plan/index.html";
        } else {
          showToast(status.error || "暂未生成推荐结果");
        }
      } catch (error) {
        clearInterval(state.pollingTimer);
        state.pollingTimer = null;
        setGenerating(false);
        showToast("网络异常，请稍后重试");
      }
    }, interval);
  }

  async function handleGenerate() {
    if (state.isGenerating) return;
    const form = collectFormData();
    if (!validateForm(form)) return;

    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      localStorage.setItem("lastPlanForm", JSON.stringify(form));
      showToast("已生成推荐方案");
      setTimeout(() => {
        window.location.href = "../generate-plan/index.html";
      }, 600);
      return;
    }

    const preferenceText = form.prefs || form.planName || "寻找合适的碰面地点";
    const requestPayload = {
      preferenceText,
      prefs: form.prefs || "",
      origin: form.origin,
      types: form.types,
      partners: form.partners || [],
      maxTransitTime: form.maxTransitTime,
      maxBudget: form.budgetMax ? Number(form.budgetMax) : null,
      minBudget: form.budgetMin ? Number(form.budgetMin) : null,
    };

    setGenerating(true);
    try {
      const res = await fetch(`${baseUrl}/getInitialPoisByPrefs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });
      const data = await res.json();
      if (data && data.success && data.recId) {
        localStorage.setItem("lastPlanForm", JSON.stringify(requestPayload));
        pollForRecommendations(baseUrl, data.recId, requestPayload);
      } else {
        throw new Error(data?.message || "启动失败");
      }
    } catch (error) {
      console.warn("请求初始推荐失败，已切换为本地示例", error);
      setGenerating(false);
      localStorage.setItem("lastPlanForm", JSON.stringify(form));
      showToast("生成失败，已使用默认推荐");
      setTimeout(() => {
        window.location.href = "../generate-plan/index.html";
      }, 600);
    }
  }

  function bindEvents() {
    console.log("开始绑定事件...");
    console.log("prevStepBtn:", els.prevStepBtn);
    console.log("nextStepBtn:", els.nextStepBtn);
    console.log("generateBtn:", els.generateBtn);
    console.log("backBtn:", els.backBtn);

    if (els.prevStepBtn) {
      els.prevStepBtn.addEventListener("click", () =>
        showStep(state.currentStep - 1)
      );
    }
    if (els.nextStepBtn) {
      els.nextStepBtn.addEventListener("click", () =>
        showStep(state.currentStep + 1)
      );
    }
    if (els.generateBtn) {
      console.log("绑定generateBtn点击事件");
      els.generateBtn.addEventListener("click", handleGenerate);
    } else {
      console.error("generateBtn元素未找到！");
    }
    if (els.backBtn) {
      els.backBtn.addEventListener("click", () => {
        window.location.href = "../../index.html";
      });
    }

    document.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const type = chip.dataset.type;
        if (!type) return;
        if (state.selectedTypes.has(type)) {
          state.selectedTypes.delete(type);
          chip.classList.remove("active");
        } else {
          state.selectedTypes.add(type);
          chip.classList.add("active");
        }
      });
    });

    if (els.distanceRange) {
      els.distanceRange.addEventListener("input", () =>
        updateRangeValue(els.distanceRange, els.distanceValue)
      );
    }
    if (els.transitRange) {
      els.transitRange.addEventListener("input", () =>
        updateRangeValue(els.transitRange, els.transitValue)
      );
    }
    if (els.taxiRange) {
      els.taxiRange.addEventListener("input", () =>
        updateRangeValue(els.taxiRange, els.taxiValue)
      );
    }

    if (els.originName) {
      els.originName.addEventListener("input", syncOriginStateFromInputs);
    }
    if (els.originAddress) {
      els.originAddress.addEventListener("input", syncOriginStateFromInputs);
    }
  }

  async function init() {
    cacheElements();
    await loadConfig();
    renderStepDots();
    updateProgress();
    showStep(0);
    syncOriginCoordsDisplay();
    updateRangeValue(els.distanceRange, els.distanceValue);
    updateRangeValue(els.transitRange, els.transitValue);
    updateRangeValue(els.taxiRange, els.taxiValue);
    bindEvents();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
