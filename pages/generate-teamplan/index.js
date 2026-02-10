(() => {
  const DEFAULT_ACTIVITIES = [
    {
      id: "a1",
      time: "09:30",
      name: "集合签到",
      description: "在出发点集合，发放物资并简要介绍行程",
      distance: "2.4",
      photoUrl: "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/museum.jpg",
    },
    {
      id: "a2",
      time: "10:30",
      name: "主题体验",
      description: "体验项目安排，适合团队破冰",
      distance: "4.2",
      photoUrl: "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/mount.jpg",
    },
    {
      id: "a3",
      time: "12:30",
      name: "团队午餐",
      description: "在附近餐厅用餐，方便集体交流",
      distance: "1.6",
      photoUrl:
        "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/%E5%8D%83%E5%B2%9B%E6%B9%96.jpg",
    },
    {
      id: "a4",
      time: "14:00",
      name: "自由活动",
      description: "自由选择户外活动或拍照打卡",
      distance: "3.1",
      photoUrl: "https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/798.jpg",
    },
  ];

  const DEFAULT_SIMILAR = [
    { id: "s1", name: "城市美术馆", transit: 40, drive: 18, price: 120 },
    { id: "s2", name: "湖畔徒步", transit: 55, drive: 25, price: 98 },
    { id: "s3", name: "露营基地", transit: 60, drive: 35, price: 160 },
    { id: "s4", name: "创意园区", transit: 45, drive: 22, price: 110 },
  ];

  const state = {
    form: null,
    generatedPlan: null,
    activities: DEFAULT_ACTIVITIES.map((item) => ({ ...item })),
    quickList: DEFAULT_ACTIVITIES.map((item) => ({ ...item })),
    similarList: DEFAULT_SIMILAR.map((item) => ({ ...item })),
    feedback: "",
    baseUrl: "",
    isGenerating: false,
    pollingTimer: null,
  };

  const els = {};
  let toastTimer;

  function cacheElements() {
    els.planSummary = document.getElementById("planSummary");
    els.quickList = document.getElementById("quickList");
    els.similarList = document.getElementById("similarList");
    els.feedbackInput = document.getElementById("feedbackInput");
    els.regenerateBtn = document.getElementById("regenerateBtn");
    els.favoritePlanBtn = document.getElementById("favoritePlanBtn");
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
    if (els.regenerateBtn) {
      els.regenerateBtn.disabled = isGenerating;
      els.regenerateBtn.textContent = isGenerating ? "?????..." : "??????";
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
      console.warn("?? index.json ??????????", error);
    }
  }

  function formatBudgetInfo(form) {
    if (!form) return null;
    const people = Number(form.peopleCount) || 0;
    const min = Number(form.budgetMin) || 0;
    const max = Number(form.budgetMax) || min;
    let totalBudget = 0;
    let perCapitaCost = 0;
    if (form.budgetMode === "total") {
      totalBudget = max || min;
      perCapitaCost =
        people > 0 ? Math.round(totalBudget / people) : totalBudget;
    } else {
      perCapitaCost = max || min;
      totalBudget = perCapitaCost * (people || 1);
    }
    return {
      peopleCount: people || "-",
      perCapitaCost,
      hotelCost:
        form.startDate && form.endDate && form.startDate !== form.endDate
          ? 280
          : 0,
      totalBudget,
    };
  }

  function getPlanTitle(form) {
    if (form?.planName) return form.planName;
    return "团建方案";
  }

  function loadStoredPlan() {
    const raw = localStorage.getItem("lastTeamPlanForm");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.form) {
        state.form = parsed.form;
        state.generatedPlan = parsed.generatedPlan || null;
      } else if (parsed) {
        state.form = parsed;
      }
    } catch (error) {
      console.warn("?? lastTeamPlanForm ??", error);
    }
  }

  function formatDistance(value) {
    if (value === null || value === undefined) return "";
    const num = Number(value);
    if (Number.isFinite(num)) {
      return num >= 1000 ? `${(num / 1000).toFixed(1)}km` : `${num}m`;
    }
    return String(value);
  }

  function extractActivities(plan) {
    if (!plan) return [];
    if (plan.isMultiDay && Array.isArray(plan.days)) {
      return plan.days.flatMap((day) =>
        Array.isArray(day.activities)
          ? day.activities.map((act) => ({ ...act, day: day.day }))
          : []
      );
    }
    if (Array.isArray(plan.activities)) {
      return plan.activities;
    }
    return [];
  }

  function syncActivitiesFromPlan() {
    const activities = extractActivities(state.generatedPlan);
    if (!activities.length) return;
    state.activities = activities.map((item, index) => ({
      id: item.id || `a-${index}`,
      time: item.time || "",
      name: item.name || "????",
      description: item.description || "",
      distance: formatDistance(
        item.distance ||
          item.travel?.allInfo?.driving?.distance ||
          item.travel?.allInfo?.transit?.distance ||
          item.travel?.allInfo?.walking?.distance
      ),
      photoUrl: item.photoUrl || item.photos?.[0]?.url || "",
      day: item.day || null,
    }));
    state.quickList = state.activities.map((item) => ({ ...item }));
  }

  function buildGeneratedPlan() {
    const budgetInfo = formatBudgetInfo(state.form);
    return {
      title: getPlanTitle(state.form),
      budgetInfo,
    };
  }

  function renderPlanSummary() {
    if (!els.planSummary) return;
    if (!state.generatedPlan) {
      state.generatedPlan = buildGeneratedPlan();
    }
    const plan = state.generatedPlan;
    const budgetInfo = plan.budgetInfo || formatBudgetInfo(state.form);
    const title = plan.title || plan.name || getPlanTitle(state.form);

    const hotelHtml =
      plan.isMultiDay && plan.hotel
        ? `
        <div class="budget-info">
          <div class="budget-title">?? ????</div>
          <div class="budget-item">${plan.hotel.name || ""}</div>
          <div class="budget-item">${plan.hotel.address || ""}</div>
          <div class="budget-item">??: ${plan.hotel.checkin || ""} | ??: ${
            plan.hotel.checkout || ""
          }</div>
          <div class="budget-item">??: ${plan.hotel.cost || ""}</div>
          <div class="budget-item">${plan.hotel.description || ""}</div>
        </div>
      `
        : "";

    const activitiesHtml = state.activities
      .map((item) => {
        const dayTag = item.day ? `?${item.day}? ? ` : "";
        return `
        <div class="activity-item">
          <div class="activity-header">
            <span class="activity-time">${dayTag}${item.time || ""}</span>
            <span class="activity-name">${item.name}</span>
          </div>
          ${
            item.photoUrl
              ? `<img class="activity-image" src="${item.photoUrl}" alt="${item.name}" />`
              : ""
          }
          <span class="activity-desc">?? ${item.distance || "-"}</span>
          <span class="activity-desc">${item.description || ""}</span>
        </div>
      `;
      })
      .join("");

    els.planSummary.innerHTML = `
      <div class="plan-title">${title}</div>
      ${
        budgetInfo
          ? `
        <div class="budget-info">
          <div class="budget-title">预算信息</div>
          <div class="budget-item">参与人数：${budgetInfo.peopleCount} 人</div>
          <div class="budget-item">人均预算：${
            budgetInfo.perCapitaCost
          } 元 / 人</div>
          ${
            budgetInfo.hotelCost > 0
              ? `<div class="budget-item">住宿费用：${budgetInfo.hotelCost} 元 / 人</div>`
              : ""
          }
          <div class="budget-item">总预算：${budgetInfo.totalBudget} 元</div>
        </div>
      `
          : ""
      }
      ${hotelHtml}
      <div class="activities">
        ${activitiesHtml}
      </div>
    `;
  }

  function createQuickCard(item, index) {
    const card = document.createElement("div");
    card.className = "card";
    const body = document.createElement("div");
    body.className = "card-body";

    const row = document.createElement("div");
    row.className = "row";

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = item.name || "目的地";

    const likeBtn = document.createElement("button");
    likeBtn.className = `icon-like${item.liked ? " liked" : ""}`;
    likeBtn.type = "button";
    likeBtn.textContent = "♥";
    likeBtn.dataset.index = index;
    likeBtn.dataset.list = "quick";

    row.appendChild(name);
    row.appendChild(likeBtn);

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = `距离约 ${item.distance || "-"} km`;

    body.appendChild(row);
    body.appendChild(meta);
    card.appendChild(body);
    return card;
  }

  function createSimilarCard(item) {
    const card = document.createElement("div");
    card.className = "card";
    const body = document.createElement("div");
    body.className = "card-body";
    const row = document.createElement("div");
    row.className = "row";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = item.name || "推荐方案";
    const likeBtn = document.createElement("button");
    likeBtn.className = "icon-like liked";
    likeBtn.type = "button";
    likeBtn.textContent = "♥";
    row.appendChild(name);
    row.appendChild(likeBtn);
    body.appendChild(row);

    const transit = document.createElement("span");
    transit.className = "meta";
    transit.textContent = `路 公共交通 ${item.transit ?? "-"} min`;

    const drive = document.createElement("span");
    drive.className = "meta";
    drive.textContent = `路 驾车 ${item.drive ?? "-"} min`;

    const price = document.createElement("span");
    price.className = "meta";
    price.textContent = `路 人均 ¥${item.price ?? "-"}`;

    body.appendChild(transit);
    body.appendChild(drive);
    body.appendChild(price);
    card.appendChild(body);
    return card;
  }

  function renderQuickList() {
    if (!els.quickList) return;
    els.quickList.innerHTML = "";
    state.quickList.forEach((item, index) => {
      els.quickList.appendChild(createQuickCard(item, index));
    });
  }

  function renderSimilarList() {
    if (!els.similarList) return;
    els.similarList.innerHTML = "";
    state.similarList.forEach((item) => {
      els.similarList.appendChild(createSimilarCard(item));
    });
  }

  function toggleQuickLike(index) {
    const item = state.quickList[index];
    if (!item) return;
    item.liked = !item.liked;
    renderQuickList();
  }

  function shuffleActivities() {
    state.activities = state.activities
      .map((item) => ({ sort: Math.random(), item }))
      .sort((a, b) => a.sort - b.sort)
      .map((entry) => entry.item);
    state.quickList = state.activities.map((item) => ({ ...item }));
  }

  function buildRequestData(form, feedback, previousPlan) {
    const people = Number(form.peopleCount) || 0;
    const minBudget = Number(form.budgetMin) || 0;
    const maxBudget = Number(form.budgetMax) || minBudget;
    const budget =
      form.budgetMode === "percapita"
        ? `${minBudget}-${maxBudget}`
        : `${people ? Math.round(minBudget / people) : 0}-${
            people ? Math.round(maxBudget / people) : 0
          }`;

    const payload = {
      name: form.planName,
      people: people,
      budget: budget,
      timeRange: {
        start: form.startTime || "09:00",
        end: form.endTime || "18:00",
      },
      dateRange: {
        start: form.startDate,
        end: form.endDate,
      },
      needAccommodation:
        form.startDate && form.endDate && form.startDate !== form.endDate,
      startLocation: form.origin?.name || "",
      startLocationCoords: `${form.origin?.longitude || 120.1551},${
        form.origin?.latitude || 30.2741
      }`,
      distance: form.distance || 10,
      maxTransitTime: form.maxTransitTime || 60,
      taxiTime: form.taxiTime || 20,
      otherNotes: form.otherNotes || "",
      personalNeeds: form.otherNotes || "",
    };

    if (feedback) {
      payload.feedback = feedback;
    }
    if (previousPlan) {
      payload.previousPlan = previousPlan;
    }
    return payload;
  }

  function pollForPlan(baseUrl, planId, form) {
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
        showToast("????????????");
        return;
      }

      try {
        const res = await fetch(`${baseUrl}/api/plan-status/${planId}`);
        const data = await res.json();
        if (!data || !data.success) {
          throw new Error("????");
        }
        if (!data.ready) {
          return;
        }

        clearInterval(state.pollingTimer);
        state.pollingTimer = null;
        setGenerating(false);

        if (data.planSuccess && data.data) {
          state.generatedPlan = data.data;
          localStorage.setItem(
            "lastTeamPlanForm",
            JSON.stringify({ form, generatedPlan: data.data })
          );
          syncActivitiesFromPlan();
          renderPlanSummary();
          renderQuickList();
          showToast("?????");
        } else {
          showToast(data.error || "????????");
        }
      } catch (error) {
        clearInterval(state.pollingTimer);
        state.pollingTimer = null;
        setGenerating(false);
        showToast("??????????");
      }
    }, interval);
  }

  async function handleRegenerate() {
    state.feedback = els.feedbackInput?.value?.trim() || "";
    const baseUrl = getBaseUrl();

    if (!baseUrl || !state.form) {
      shuffleActivities();
      renderPlanSummary();
      renderQuickList();
      showToast("?????");
      return;
    }

    if (state.isGenerating) return;
    const previousPlan = state.generatedPlan
      ? {
          ...state.generatedPlan,
          activities: extractActivities(state.generatedPlan),
        }
      : null;
    const payload = buildRequestData(state.form, state.feedback, previousPlan);

    setGenerating(true);
    try {
      const res = await fetch(`${baseUrl}/api/plan-teambuilding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data && data.success && data.planId) {
        pollForPlan(baseUrl, data.planId, state.form);
      } else {
        throw new Error(data?.message || "????");
      }
    } catch (error) {
      console.warn("??????????", error);
      setGenerating(false);
      showToast("??????????");
    }
  }

  function bindEvents() {
    if (els.favoritePlanBtn) {
      els.favoritePlanBtn.addEventListener("click", () =>
        showToast("已收藏方案")
      );
    }
    if (els.regenerateBtn) {
      els.regenerateBtn.addEventListener("click", handleRegenerate);
    }
    if (els.quickList) {
      els.quickList.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.classList.contains("icon-like")) {
          toggleQuickLike(Number(target.dataset.index));
        }
      });
    }
    if (els.backBtn) {
      els.backBtn.addEventListener("click", () => {
        window.location.href = "../team-plan/index.html";
      });
    }
  }

  async function init() {
    cacheElements();
    await loadConfig();
    loadStoredPlan();
    syncActivitiesFromPlan();
    renderPlanSummary();
    renderQuickList();
    renderSimilarList();
    bindEvents();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
