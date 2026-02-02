const axios = require("axios"); // 【修复问题1】必须引入 axios
const db = require("../config/db"); // 确保引入了数据库
const { generationStatus } = require("../config/global"); // 【修复问题2】引入全局状态变量
const {
  getComprehensiveTravelInfo,
  searchNearbyPlaces,
} = require("../utils/map"); // 引入刚才的地图工具

// team-plan
/**
 * [筛选型] 使用大模型初步筛选地点，去除不符合团建要求的地点
 * @param {Array} places - 候选地点数组
 * @returns {Promise<Array>} - 返回筛选后的地点数组
 */
const filterPlacesWithLLM = async (places) => {
  console.log("开始使用大模型分批筛选地点...");

  // 分批处理，每次最多25个地点
  const batchSize = 25;
  const batches = [];
  for (let i = 0; i < places.length; i += batchSize) {
    batches.push(places.slice(i, i + batchSize));
  }

  console.log(
    `地点总数: ${places.length}, 分为 ${batches.length} 批处理，每批最多 ${batchSize} 个地点`
  );

  let allRemovedIndexes = [];
  let batchStartIndex = 0;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    console.log(
      `正在处理第 ${batchIndex + 1}/${batches.length} 批，包含 ${
        batch.length
      } 个地点`
    );

    // 为当前批次的地点添加全局索引编号
    const batchWithIndex = batch.map((place, localIndex) => ({
      globalIndex: batchStartIndex + localIndex,
      localIndex: localIndex,
      ...place,
    }));

    const filterPrompt = `
        你是一位专业的团建活动策划师。请分析以下候选地点，找出不适合团建活动的地点。

        【候选地点列表】
        ${JSON.stringify(batchWithIndex, null, 2)}

        【筛选标准】
        请找出以下类型的地点（需要筛选掉）：
        1. 政府机构：大使馆、领事馆、政府机关、法院、检察院等
        2. 军事设施：军营、军事基地、军事禁区等
        3. 特殊区域：监狱、看守所、戒毒所等
        4. 纯住宅区：普通住宅小区、公寓楼等
        5. 工业设施：工厂、仓库、物流中心等
        6. 基础设施：变电站、水厂、垃圾处理厂等
        7. 不适合团建的地点：殡仪馆、墓地、医院等
        8. 过于偏僻或难以到达的地点

        【返回格式】
        请返回一个JSON对象，格式如下：
        {
        "removedIndexes": [0, 5, 12],
        "reason": "筛选原因说明"
        }

        其中 removedIndexes 是需要筛选掉的地点索引数组（使用globalIndex），reason 是筛选原因的简要说明。

        请仔细分析每个地点的名称、地址、类型，判断是否适合团建活动。

        RETURN ONLY JSON. NO MARKDOWN. NO EXPLANATION.
        `;

    try {
      const response = await callLLMForFiltering(filterPrompt);
      if (
        response &&
        response.removedIndexes &&
        Array.isArray(response.removedIndexes)
      ) {
        // 将批次内的索引转换为全局索引
        const globalRemovedIndexes = response.removedIndexes;
        allRemovedIndexes = allRemovedIndexes.concat(globalRemovedIndexes);

        console.log(
          `第 ${batchIndex + 1} 批筛选完成: 移除了 ${
            response.removedIndexes.length
          } 个不适合的地点`
        );
        console.log(`移除的地点索引: [${response.removedIndexes.join(", ")}]`);
      }
    } catch (error) {
      console.error(`第 ${batchIndex + 1} 批大模型筛选失败:`, error);
    }

    batchStartIndex += batch.length;
  }

  // 根据所有批次的结果筛选地点
  const filteredPlaces = places.filter((place, index) => {
    return !allRemovedIndexes.includes(index);
  });

  console.log(
    `分批筛选完成: 总共移除了 ${allRemovedIndexes.length} 个不适合的地点`
  );
  console.log(`最终保留 ${filteredPlaces.length} 个适合团建的地点`);
  console.log(`移除的地点索引: [${allRemovedIndexes.join(", ")}]`);

  return filteredPlaces;
};

/**
 * [推理型] 使用大模型推理地点的人均花费
 * @param {Array} places - 地点数组
 * @returns {Promise<Array>} - 返回包含推理花费的地点数组
 */
const inferCostWithLLM = async (places) => {
  console.log("开始使用大模型推理地点人均花费...");

  // 筛选出没有花费信息的地点
  const placesWithoutCost = places.filter(
    (place) =>
      !place.perCapitaCost ||
      place.perCapitaCost === "暂无" ||
      place.perCapitaCost === ""
  );

  if (placesWithoutCost.length === 0) {
    console.log("所有地点都有花费信息，无需推理");
    return places;
  }

  console.log(`需要推理花费的地点数量: ${placesWithoutCost.length}`);

  // 分批处理，每批最多20个地点
  const batchSize = 20;
  const batches = [];
  for (let i = 0; i < placesWithoutCost.length; i += batchSize) {
    batches.push(placesWithoutCost.slice(i, i + batchSize));
  }

  let allInferredPlaces = [...places];

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    console.log(
      `正在推理第 ${batchIndex + 1}/${batches.length} 批，包含 ${
        batch.length
      } 个地点的花费`
    );

    const costPrompt = `
        你是一位专业的消费评估专家。请根据以下地点的名称、类型、地址等信息，推理出每个地点的人均消费水平。

        【地点列表】
        ${JSON.stringify(
          batch.map((place, index) => ({
            index: index,
            name: place.name,
            type: place.type,
            address: place.address,
            rating: place.rating,
          })),
          null,
          2
        )}

        【推理标准】
        请根据以下标准推理人均消费：
        1. 餐厅类：根据餐厅档次和类型推理
        - 快餐/小吃：20-50元
        - 普通餐厅：50-100元
        - 中档餐厅：100-200元
        - 高档餐厅：200-500元
        2. 娱乐类：根据娱乐类型推理
        - KTV：70-150元
        - 电影院：30-80元
        - 游戏厅：40-100元
        - 密室逃脱：80-200元
        3. 景点类：根据景点类型推理
        - 免费景点：0元
        - 普通景点：20-100元
        - 主题公园：100-300元
        4. 购物类：根据商场档次推理
        - 普通商场：50-200元
        - 高档商场：200-1000元

        【返回格式】
        请返回一个JSON对象，格式如下：
        {
        "costs": [
            {"index": 0, "perCapitaCost": "80-120元", "reason": "推理原因"},
            {"index": 1, "perCapitaCost": "50-80元", "reason": "推理原因"}
        ]
        }

        其中 index 是地点在批次中的索引，perCapitaCost 是推理的人均消费范围，reason 是推理原因。

        RETURN ONLY JSON. NO MARKDOWN. NO EXPLANATION.
        `;

    try {
      const response = await callLLMForFiltering(costPrompt);
      if (response && response.costs && Array.isArray(response.costs)) {
        // 更新地点信息
        response.costs.forEach((costInfo) => {
          const placeIndex = batch[costInfo.index];
          if (placeIndex) {
            const globalIndex = allInferredPlaces.findIndex(
              (p) => p.id === placeIndex.id
            );
            if (globalIndex !== -1) {
              allInferredPlaces[globalIndex].perCapitaCost =
                costInfo.perCapitaCost;
              allInferredPlaces[globalIndex].costReason = costInfo.reason;
            }
          }
        });

        console.log(
          `第 ${batchIndex + 1} 批花费推理完成: 推理了 ${
            response.costs.length
          } 个地点的花费`
        );
      }
    } catch (error) {
      console.error(`第 ${batchIndex + 1} 批花费推理失败:`, error);
    }
  }

  console.log(
    `花费推理完成: 共推理了 ${placesWithoutCost.length} 个地点的花费`
  );
  return allInferredPlaces;
};

/**
 * [计算型] 计算方案的总预算和人均预算
 * @param {Array} activities - 活动数组
 * @param {number} peopleCount - 参与人数
 * @param {Object} hotelInfo - 酒店信息（可选）
 * @returns {Object} - 返回预算计算结果
 */
const calculatePlanBudget = (activities, peopleCount, hotelInfo = null) => {
  console.log("开始计算方案预算...");

  let totalCost = 0;
  let activityCount = 0;
  let hotelCost = 0;

  // 计算所有活动的总花费
  activities.forEach((activity) => {
    if (activity.cost && activity.cost !== "暂无") {
      // 尝试从花费字符串中提取数字
      const costStr = activity.cost.toString();
      const costMatch = costStr.match(/(\d+)-?(\d+)?/);
      console.log(`活动 "${activity.name}" costMatch:`, costMatch);

      if (costMatch) {
        const minCost = parseInt(costMatch[1]);
        const maxCost = costMatch[2] ? parseInt(costMatch[2]) : minCost;
        const avgCost = (minCost + maxCost) / 2;

        totalCost += avgCost;
        activityCount++;

        console.log(
          `活动 "${activity.name}" 花费: ${activity.cost} -> 平均 ${avgCost}元`
        );
      }
    }
  });

  // 计算酒店花费（如果存在）
  if (hotelInfo && hotelInfo.cost && hotelInfo.cost !== "暂无") {
    const hotelCostStr = hotelInfo.cost.toString();
    const hotelCostMatch = hotelCostStr.match(/(\d+)-?(\d+)?/);
    console.log(`酒店 "${hotelInfo.name}" costMatch:`, hotelCostMatch);

    if (hotelCostMatch) {
      const minHotelCost = parseInt(hotelCostMatch[1]);
      const maxHotelCost = hotelCostMatch[2]
        ? parseInt(hotelCostMatch[2])
        : minHotelCost;
      hotelCost = (minHotelCost + maxHotelCost) / 2;

      console.log(
        `酒店 "${hotelInfo.name}" 花费: ${hotelInfo.cost} -> 平均 ${hotelCost}元`
      );
    }
  }

  // 计算总人均花费（活动 + 酒店）
  const totalPerCapitaCost = totalCost + hotelCost;
  const perCapitaCost =
    activityCount > 0
      ? Math.round(totalPerCapitaCost / activityCount)
      : Math.round(hotelCost);
  const totalBudget = totalPerCapitaCost * peopleCount;

  console.log(`预算计算完成:`);
  console.log(`- 活动总花费: ${totalCost}元 (${activityCount}个活动)`);
  console.log(`- 酒店花费: ${hotelCost}元`);
  console.log(`- 总人均花费: ${totalPerCapitaCost}元`);
  console.log(`- 人均预算: ${totalPerCapitaCost}元`);
  console.log(`- 总预算: ${totalBudget}元 (${peopleCount}人)`);

  return {
    perCapitaCost: totalPerCapitaCost,
    totalBudget: totalBudget,
    activityCount: activityCount,
    totalCost: totalCost,
    hotelCost: hotelCost,
    totalPerCapitaCost: totalPerCapitaCost,
  };
};

const withTimeout = (promise, ms, label) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timeout after ${ms}ms`));
    }, ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });

const parseTimeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== "string") return null;
  const parts = timeStr.split(":").map((p) => parseInt(p, 10));
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return null;
  return parts[0] * 60 + parts[1];
};

const formatMinutesToTime = (minutes) => {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, minutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const buildFallbackActivities = (count, startMin, endMin, baseLocation) => {
  const templates = [
    { name: "破冰游戏", type: "团队互动", cost: "20-40" },
    { name: "协作挑战", type: "团队协作", cost: "50-80" },
    { name: "轻松交流", type: "休闲放松", cost: "30-60" },
    { name: "团建用餐", type: "餐饮", cost: "80-120" },
  ];
  const total = Math.max(endMin - startMin, 180);
  const slot = Math.max(60, Math.floor(total / count));
  const activities = [];
  for (let i = 0; i < count; i++) {
    const t = templates[i % templates.length];
    const s = startMin + i * slot;
    const e = Math.min(s + Math.min(120, slot), endMin);
    activities.push({
      id: `mock_${Date.now()}_${i}`,
      name: t.name,
      time: `${formatMinutesToTime(s)}-${formatMinutesToTime(e)}`,
      description: `${t.name}，适合团队参与与放松交流。`,
      cost: t.cost,
      type: t.type,
      address: `${baseLocation}附近`,
      location: baseLocation,
      day: 1,
    });
  }
  return activities;
};

const buildActivitiesFromPlaces = (places, startMin, endMin, baseLocation) => {
  const usable = Array.isArray(places) ? places.slice(0, 3) : [];
  if (usable.length === 0) {
    return buildFallbackActivities(3, startMin, endMin, baseLocation);
  }

  const total = Math.max(endMin - startMin, 180);
  const slot = Math.max(60, Math.floor(total / usable.length));
  return usable.map((p, i) => {
    const s = startMin + i * slot;
    const e = Math.min(s + Math.min(120, slot), endMin);
    const cost =
      p.perCapitaCost || p.cost || p?.business?.cost || "暂无";
    return {
      id: p.id || `mock_${Date.now()}_${i}`,
      name: p.name || "活动地点",
      time: `${formatMinutesToTime(s)}-${formatMinutesToTime(e)}`,
      description: `前往${p.name || "活动地点"}进行团建活动。`,
      cost: String(cost),
      type: p.type || "活动",
      address: p.address || "",
      location: p.location || baseLocation,
      day: 1,
    };
  });
};

const buildPlanFromPlaces = ({
  places,
  people,
  timeRange,
  dateRange,
  startLocation,
  startLocationCoords,
}) => {
  const startMin =
    parseTimeToMinutes(timeRange?.start) ?? 9 * 60;
  const endMin =
    parseTimeToMinutes(timeRange?.end) ?? 18 * 60;
  const safeEndMin = endMin <= startMin + 120 ? startMin + 240 : endMin;

  const isMultiDay =
    dateRange &&
    dateRange.start &&
    dateRange.end &&
    dateRange.start !== dateRange.end;

  if (!isMultiDay) {
    const activities = buildActivitiesFromPlaces(
      places,
      startMin,
      safeEndMin,
      startLocationCoords
    );
    const budgetInfo = calculatePlanBudget(activities, parseInt(people), null);
    return {
      activities,
      isMultiDay: false,
      budgetInfo,
    };
  }

  const days = [];
  for (let d = 1; d <= 2; d++) {
    const activities = buildActivitiesFromPlaces(
      places,
      startMin,
      safeEndMin,
      startLocationCoords
    ).map((act) => ({ ...act, day: d }));
    days.push({ day: d, activities });
  }
  const hotel = {
    id: "hotel_mock",
    name: `${startLocation}精选酒店`,
    address: `${startLocation}附近`,
    checkin: "18:00",
    checkout: "09:00",
    cost: "200-300",
    description: "距离活动点较近，便于团队休息。",
  };
  const allActivities = days.flatMap((day) => day.activities);
  const budgetInfo = calculatePlanBudget(allActivities, parseInt(people), hotel);
  return {
    hotel,
    days,
    isMultiDay: true,
    budgetInfo,
  };
};

const buildFallbackPlan = ({
  people,
  timeRange,
  dateRange,
  startLocation,
  startLocationCoords,
}) => {
  const startMin =
    parseTimeToMinutes(timeRange?.start) ?? 9 * 60;
  const endMin =
    parseTimeToMinutes(timeRange?.end) ?? 18 * 60;
  const safeEndMin = endMin <= startMin + 120 ? startMin + 240 : endMin;

  const isMultiDay =
    dateRange &&
    dateRange.start &&
    dateRange.end &&
    dateRange.start !== dateRange.end;

  if (!isMultiDay) {
    const activities = buildFallbackActivities(
      3,
      startMin,
      safeEndMin,
      startLocationCoords
    );
    const budgetInfo = calculatePlanBudget(activities, parseInt(people), null);
    return {
      activities,
      isMultiDay: false,
      budgetInfo,
    };
  }

  const days = [];
  for (let d = 1; d <= 2; d++) {
    const activities = buildFallbackActivities(
      3,
      startMin,
      safeEndMin,
      startLocationCoords
    ).map((act) => ({ ...act, day: d }));
    days.push({ day: d, activities });
  }
  const hotel = {
    id: "hotel_mock",
    name: `${startLocation}精选酒店`,
    address: `${startLocation}附近`,
    checkin: "18:00",
    checkout: "09:00",
    cost: "200-300",
    description: "距离活动点较近，便于团队休息。",
  };
  const allActivities = days.flatMap((day) => day.activities);
  const budgetInfo = calculatePlanBudget(allActivities, parseInt(people), hotel);
  return {
    hotel,
    days,
    isMultiDay: true,
    budgetInfo,
  };
};

/**
 * [筛选型] 调用大模型API进行地点筛选（不使用thinking功能）
 * @param {string} prompt - 发送给大模型的筛选提示词
 * @returns {Promise<Object|null>} - 返回筛选结果
 */
const callLLMForFiltering = async (prompt) => {
  console.log("正在向大模型发送筛选请求...");
  const OpenAI = require("openai");

  const openai = new OpenAI({
    apiKey: process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
  });

  try {
    const response = await openai.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "deepseek-chat",
      // thinking: { type: 'enabled' }, // 筛选任务可能不需要 thinking，或者根据模型支持情况开启
    });

    const content = response.choices[0].message.content;
    console.log(
      "大模型筛选返回 (前100字符):",
      content.substring(0, 100) + "..."
    );
    try {
      const cleanedContent = content.replace(/```json\n?|```/g, "").trim();
      return JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("解析大模型返回的JSON失败:", content);
      return null;
    }
  } catch (error) {
    console.error("调用大模型进行筛选失败:", error);
    return null;
  }
};

/**
 * [决策型] 调用大模型API
 * @param {string} prompt - 发送给大模型的决策型提示词
 * @returns {Promise<Object|null>} - 返回决策出的单个活动对象
 */
const decideNextActivityWithLLM = async (prompt) => {
  console.log("正在向大模型发送决策请求...");
  const OpenAI = require("openai");

  const openai = new OpenAI({
    apiKey: process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
  });

  try {
    const timeoutMs = parseInt(
      process.env.TEAMPLAN_LLM_TIMEOUT_MS || "45000",
      10
    );
    const response = await withTimeout(
      openai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "deepseek-chat",
        thinking: { type: "enabled" },
      }),
      timeoutMs,
      "LLM决策"
    );

    const content = response.choices[0].message.content;
    console.log("大模型决策返回:", content);
    try {
      const cleanedContent = content.replace(/```json\n?|```/g, "").trim();
      return JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("解析大模型返回的JSON失败:", content);
      return null;
    }
  } catch (error) {
    console.error("调用大模型进行决策失败:", error);
    return null;
  }
};

/**
 * 计算地点综合评分
 * @param {Object} place - 地点对象
 * @param {string} userSelectedTypes - 用户选择的类型
 * @returns {number} - 综合评分
 */
const calculatePlaceScore = (place) => {
  let score = 0;

  // 1. 评分因素 (40%权重)
  const rating = place.rating === "暂无" ? 0 : parseFloat(place.rating);
  score += rating * 0.4;

  // 3. 热门程度 (40%权重) - 基于评分和评论数
  const popularityScore = calculatePopularityScore(place);
  score += popularityScore * 0.4;

  // 4. 团建适宜度 (20%权重) - 基于地点类型判断是否适合团建
  const teamBuildingScore = calculateTeamBuildingScore(place);
  score += teamBuildingScore * 0.2;

  return score;
};

/**
 * 计算热门程度评分
 * @param {Object} place - 地点对象
 * @returns {number} - 热门程度评分 (0-10)
 */
const calculatePopularityScore = (place) => {
  let score = 0;

  // 基于评分的热门程度
  const rating = place.rating === "暂无" ? 0 : parseFloat(place.rating);
  if (rating >= 4.5) score += 6;
  else if (rating >= 4.0) score += 4;
  else if (rating >= 3.5) score += 2;

  // 基于消费水平的热门程度（适中消费更受欢迎）
  const cost = place.cost || "";
  if (cost.includes("适中") || cost.includes("中等")) score += 2;
  else if (cost.includes("便宜") || cost.includes("经济")) score += 1;

  // 基于地址的热门程度（商业区更热门）
  const address = place.address || "";
  if (
    address.includes("商业") ||
    address.includes("中心") ||
    address.includes("广场")
  )
    score += 2;

  return Math.min(score, 10);
};

/**
 * 计算团建适宜度评分
 * @param {Object} place - 地点对象
 * @returns {number} - 团建适宜度评分 (0-10)
 */
const calculateTeamBuildingScore = (place) => {
  const name = place.name || "";
  const type = place.type || "";
  const address = place.address || "";

  let score = 5; // 基础分数

  // 团建友好关键词
  const teamBuildingKeywords = [
    "团建",
    "拓展",
    "聚会",
    "聚餐",
    "KTV",
    "桌游",
    "密室",
    "剧本杀",
    "温泉",
    "度假村",
    "农家乐",
    "烧烤",
    "火锅",
    "自助",
    "娱乐",
    "运动",
    "健身",
    "游泳",
    "保龄球",
    "台球",
    "射箭",
    "攀岩",
  ];

  // 检查名称和地址中的团建关键词
  const text = (name + " " + address).toLowerCase();
  for (const keyword of teamBuildingKeywords) {
    if (text.includes(keyword)) {
      score += 2;
    }
  }

  // 服务性地点减分
  const serviceKeywords = [
    "售票处",
    "银行",
    "医院",
    "药店",
    "维修",
    "洗车",
    "加油站",
    "邮局",
  ];
  for (const keyword of serviceKeywords) {
    if (text.includes(keyword)) {
      score -= 3;
    }
  }

  return Math.max(0, Math.min(score, 10));
};

/**
 * [多中心点搜索] 从主中心点向外扩展多个次中心点进行搜索
 * @param {string} centerLocation - 主中心点坐标, "经度,纬度"
 * @param {string} types - POI类型编码，多个用'|'分隔
 * @param {number} pageSize - 每种类型期望返回的结果数量
 * @param {number} distance - 搜索半径（公里）
 * @returns {Promise<Array<Object>|null>} - 返回多样化的地点数组
 */
const searchNearbyPlacesMultiCenter = async (
  centerLocation,
  types,
  pageSize = 5,
  distance = 10
) => {
  console.log(
    `多中心点搜索: 从主中心点 ${centerLocation} 开始，扩展3个次中心点，搜索半径 ${distance}km`
  );

  // 1. 生成次中心点
  const subCenters = generateSubCenters(centerLocation, distance, 3);
  console.log(`生成的次中心点: ${subCenters.join(", ")}`);

  // 2. 并行搜索所有中心点（主中心点 + 3个次中心点）
  const searchPromises = [
    searchNearbyPlaces(centerLocation, types, Math.ceil(15), distance), // 主中心点占40%
    ...subCenters.map(
      (center) => searchNearbyPlaces(center, types, Math.ceil(10), distance) // 每个次中心点占20%
    ),
  ];

  try {
    const results = await Promise.all(searchPromises);

    // 3. 合并所有结果
    let allPlaces = [];
    results.forEach((result) => {
      if (result && result.length > 0) {
        allPlaces = allPlaces.concat(result);
      }
    });

    // 4. 去重（按ID去重）
    const uniquePlaces = Array.from(
      new Map(allPlaces.map((item) => [item.id, item])).values()
    );

    // 5. 按综合评分排序
    uniquePlaces.sort((a, b) => {
      const scoreA = calculatePlaceScore(a);
      const scoreB = calculatePlaceScore(b);
      return scoreB - scoreA;
    });

    // 只保留前60个候选地点，减少大模型工作量
    const topPlaces = uniquePlaces.slice(0, 60);
    console.log(
      `多中心点搜索完成: 共获取到 ${uniquePlaces.length} 个不重复的候选地点，保留前 ${topPlaces.length} 个高质量地点`
    );
    return topPlaces;
  } catch (error) {
    console.error("多中心点搜索时发生错误:", error);
    return null;
  }
};

/**
 * 生成次中心点 - 在主中心点周围创建多个搜索点
 * @param {string} centerLocation - 主中心点坐标, "经度,纬度"
 * @param {number} distance - 距离（公里）
 * @param {number} count - 生成的中心点数量
 * @returns {Array<string>} - 次中心点坐标数组
 */
const generateSubCenters = (centerLocation, distance, count) => {
  const [lng, lat] = centerLocation.split(",").map(Number);
  const centers = [];

  for (let i = 0; i < count; i++) {
    // 均匀分布角度：0°, 120°, 240°
    const angle = (Math.PI * 2 * i) / count;

    // 计算新坐标（简化计算，适用于小范围）
    // 1度约111km，所以 distance/111 就是度数
    const deltaLng = (distance / 111) * Math.cos(angle);
    const deltaLat = (distance / 111) * Math.sin(angle);

    const newLng = lng + deltaLng;
    const newLat = lat + deltaLat;

    centers.push(`${newLng.toFixed(6)},${newLat.toFixed(6)}`);
  }

  return centers;
};

// 异步生成方案的函数
async function generatePlanAsync(planId, params) {
  try {
    console.log(`开始异步生成方案 ${planId}...`);

    const {
      name,
      people,
      budget,
      type,
      teamType,
      customTypes,
      timeRange,
      dateRange,
      needAccommodation,
      startLocation,
      startLocationCoords,
      feedback,
      previousPlan,
      distance,
      maxTransitTime,
      taxiTime,
      otherNotes,
      forceNew,
      creatorId,
    } = params;

    const fastMode =
      process.env.TEAMPLAN_FAST === "1" ||
      (process.env.NODE_ENV === "local" &&
        process.env.TEAMPLAN_FORCE_LLM !== "1");
    const liteMode = process.env.TEAMPLAN_LITE === "1";

    if (fastMode) {
      const fallbackPlan = buildFallbackPlan({
        people,
        timeRange,
        dateRange,
        startLocation,
        startLocationCoords,
      });
      generationStatus.set(planId, {
        ready: true,
        success: true,
        data: {
          name: name || "团建方案",
          id: Number(String(Date.now()).slice(-9)),
          title: name || "团建方案",
          ...fallbackPlan,
        },
        error: null,
      });
      console.log(`方案 ${planId} 使用快速模式生成完成`);
      return;
    }

    // --- 步骤 1: 基于个性化需求解析并进行关键字检索 ---
    // 从 params.otherNotes 中提取用户个性化需求
    let personalizedSeeds = [];
    if (!liteMode && otherNotes && otherNotes.trim() !== "") {
      const parsePrompt = `你是一位擅长从自然语言中提取搜索关键词的助手。

【用户个性化需求】
${otherNotes}

【任务】
1. 识别多个独立的需求主题，每个主题提炼出2-4个适合用于搜索POI的中文关键词。
2. 输出一个JSON数组，每个元素是字符串数组，例如：[["蹦床","公园"],["溜冰","商场"]]，不要输出其它文字。`;

      const parsed = await callLLMForFiltering(parsePrompt);
      if (Array.isArray(parsed)) {
        personalizedSeeds = parsed.filter(
          (arr) => Array.isArray(arr) && arr.length > 0
        );
      }
    }

    // 针对每个主题关键词组合，使用关键字检索挑选一个最符合的地点（在可接受范围内）
    const keywordResults = [];
    if (!liteMode && personalizedSeeds.length > 0) {
      const apiKey = process.env.MAP_API_KEY || process.env.AMAP_API_KEY;
      const keywordUrl = "https://restapi.amap.com/v5/place/text";
      for (const keywords of personalizedSeeds) {
        const keyword = keywords.join(" ");
        try {
          const resp = await axios.get(keywordUrl, {
            params: {
              key: apiKey,
              keywords: keyword,
              location: startLocationCoords,
              radius: parseInt(distance) * 1000,
              sortrule: "weight",
              page_size: 5,
              show_fields: "business,photos,children",
            },
          });
          if (
            resp.data &&
            resp.data.status === "1" &&
            resp.data.pois &&
            resp.data.pois.length > 0
          ) {
            const mapped = resp.data.pois.map((poi, index) => {
              const business = resp.data.pois[index].business
                ? resp.data.pois[index].business
                : null;
              return {
                id: poi.id,
                name: poi.name,
                address: poi.address,
                location: poi.location,
                rating: business ? business.rating : "暂无",
                perCapitaCost: business ? business.cost : "暂无",
                tel: business ? business.tel : "暂无",
                photoUrl:
                  poi.photos && poi.photos.length > 0
                    ? poi.photos[0].url
                    : null,
                type: poi.type || "",
                business_area: poi.business_area || "",
                cityname: poi.cityname || "",
                adname: poi.adname || "",
                alias: poi.alias || "",
              };
            });

            // 选择一个最佳
            mapped.sort(
              (a, b) => calculatePlaceScore(b, "") - calculatePlaceScore(a, "")
            );
            keywordResults.push(mapped[0]);
          }
        } catch (e) {
          console.error("关键字搜索失败:", keyword, e.message);
        }
      }
    }

    // --- 步骤 1.1: 对关键字检索结果做初步筛选（去掉不适合团建的地点） ---
    let refinedKeywordResults = keywordResults;
    if (!liteMode && keywordResults && keywordResults.length > 0) {
      const filtered = await filterPlacesWithLLM(keywordResults, "", "");
      if (filtered && filtered.length > 0) {
        refinedKeywordResults = filtered;
      }
    }

    // --- 步骤 1.2: 扩大候选池（周边搜索） ---
    console.log("步骤1: 开始扩大搜索范围，获取候选地点池...");
    poiTypes = [];
    poiTypes.push("050000", "080000", "070000", "060000", "110000", "140000");

    // 4. 如果需要住宿，添加酒店类型
    if (needAccommodation) {
      poiTypes.push("100000");
    }

    poiTypes = poiTypes.filter(Boolean).join("|");

    const candidatePlaces = await searchNearbyPlacesMultiCenter(
      startLocationCoords,
      poiTypes,
      liteMode ? 6 : 15,
      distance
    );

    if (!candidatePlaces || candidatePlaces.length === 0) {
      throw new Error("在指定范围内未能找到合适的活动地点");
    }

    // --- 步骤 1.5: 大模型初步筛选 ---
    let filteredPlaces = candidatePlaces;
    if (!liteMode) {
      console.log("步骤1.5: 开始大模型初步筛选，去除不符合要求的地点...");
      filteredPlaces = await filterPlacesWithLLM(candidatePlaces);
      console.log(
        `初步筛选完成: 从 ${candidatePlaces.length} 个地点筛选出 ${filteredPlaces.length} 个合适地点`
      );

      if (filteredPlaces.length === 0) {
        throw new Error("经过初步筛选后，没有找到符合团建要求的地点");
      }
    } else {
      filteredPlaces = candidatePlaces.slice(0, 20);
    }

    // --- 步骤 1.6: 大模型推理花费 ---
    let placesWithCost = filteredPlaces;
    if (!liteMode) {
      console.log("步骤1.6: 开始大模型推理地点人均花费...");
      placesWithCost = await inferCostWithLLM(filteredPlaces);
      console.log(`花费推理完成: 为所有地点补充了花费信息`);
    }

    // --- 步骤 2: 构建增强型 Prompt ---
    console.log("步骤2: 构建增强型Prompt，请求大模型进行整体规划...");
    const totalBudget = parseInt(budget) * parseInt(people);

    // 判断是否为多天行程
    const isMultiDay =
      dateRange &&
      dateRange.start &&
      dateRange.end &&
      dateRange.start !== dateRange.end;
    const dayCount = isMultiDay
      ? Math.ceil(
          (new Date(dateRange.end) - new Date(dateRange.start)) /
            (1000 * 60 * 60 * 24)
        ) + 1
      : 1;

    const promptPlaces = liteMode
      ? placesWithCost.slice(0, 12).map((p) => ({
          id: p.id,
          name: p.name,
          address: p.address,
          location: p.location,
          type: p.type || "",
          cost: p.perCapitaCost || p.cost || "暂无",
          rating: p.rating || "暂无",
        }))
      : placesWithCost;

    let decisionPrompt = `
      你是一位专业的团建活动策划师。请根据以下要求，从我提供的【候选地点列表】中，设计一个完整的团建${
        isMultiDay ? `${dayCount}天` : "一日"
      }游方案。

      【团建总体要求】
      - 人数: ${people}人
      - 总预算: ${totalBudget}元 (人均 ${budget}元)
      - 行程天数: ${dayCount}天
      - 活动时间: 从 ${timeRange.start} 到 ${timeRange.end}
      - 出发地点: ${startLocation}
      - 活动范围: 距离出发点 ${distance} 公里内
      - 交通偏好: 可接受的打车时间为 ${taxiTime} 分钟内, 公共交通时间为 ${maxTransitTime} 分钟内
      - 住宿需求: ${
        needAccommodation
          ? "需要安排酒店作为住宿场地，酒店预算不超过总预算的45%"
          : "不需要住宿"
      }
      ${otherNotes ? `- 个性化需求: ${otherNotes}` : ""}

      ${
        feedback && previousPlan
          ? `
      【重要参考 - 用户反馈】
      你必须参考用户的反馈，这极其重要！！！
      用户对之前的方案不满意，这是他的反馈："${feedback}"。
      请在本次规划中重点考虑用户的反馈，避免推荐他不喜欢的内容。
      之前的方案是: ${JSON.stringify(previousPlan.activities, null, 2)}
      `
          : ""
      }

      【候选地点列表】
      这是一个包含多种类型地点的JSON数组，请从中挑选：
      ${JSON.stringify(promptPlaces, null, 2)}

      ${
        refinedKeywordResults && refinedKeywordResults.length > 0
          ? `\n【用户个性化关键词命中的地点（优先包含）】\n请尽可能在方案中包含以下地点（若确实不合适可替换，但需在理由中解释）：\n${JSON.stringify(
              refinedKeywordResults,
              null,
              2
            )}`
          : ""
      }

      【你的任务】
      1.  **全局规划**：设计一个包含${
        isMultiDay ? "每天3-5个活动" : "3到5个活动"
      }的完整行程，**务必确保活动间的时间衔接流畅、逻辑合理，活动内容多样**。
      2.  **预算控制**：合理搭配高消费和低消费的活动，确保所有活动的总消费不超过总预算。${
        needAccommodation ? "酒店费用应控制在总预算的45%以内。" : ""
      }
      3.  **时间安排**：${
        isMultiDay
          ? "多天行程请灵活安排时间，比如第一天11:00-21:00活动，22:00回到酒店；第二天9:00-20:00活动等。"
          : '为每个活动分配合理的起止时间（格式 "HH:mm-HH:mm"），确保整体行程从' +
            timeRange.start +
            "开始，在 " +
            timeRange.end +
            " 之前结束。"
      }
      4.  **地点唯一性**：确保方案中没有选择重复的地点。
      5.  **住宿安排**：${
        needAccommodation
          ? "如果需要住宿，请合理安排酒店入住和退房时间，只有**酒店**可以作为住宿场地，网吧等地方不可作为住宿场地，确保酒店位置便利。酒店信息单独放在day0中。"
          : "不需要安排住宿。"
      }
      6.  **餐饮安排**：请合理安排餐饮时间，确保活动中没有连续两个活动都是用餐时间，确保活动安排中包括用餐，并且两餐之间至少间隔2小时。
      7.  **返回格式**：你的回答**必须**是一个纯粹的JSON对象，不能包含任何的解释，格式如下：
      ${
        isMultiDay
          ? `
      {
        "hotel": {
          "id": "酒店ID",
          "name": "酒店名称",
          "address": "酒店地址",
          "checkin": "入住时间",
          "checkout": "退房时间",
          "cost": "酒店费用",
          "description": "酒店描述"
        },
        "days": [
          {
            "day": "数字，从1开始",
            "activities": [
              {
                "id": "地点的ID",
                "name": "地点的名称",
                "time": "HH:mm-HH:mm",
                "description": "用一句话简单描述这个活动安排",
                "cost": "预估的人均消费（必须是一个数字字符串）",
                "type": "为这个活动定义的类型，如'午餐', '团队游戏', '休闲放松'等"
              }
            ]
          }
        ]
      }
      `
          : `
      {
        "activities": [
          {
            "id": "地点的ID",
            "name": "地点的名称",
            "time": "HH:mm-HH:mm",
            "description": "用一句话简单描述这个活动安排",
            "cost": "预估的人均消费（必须是一个数字字符串）",
            "type": "为这个活动定义的类型，如'午餐', '团队游戏', '休闲放松'等",
            "day": 1
          }
        ]
      }
      `
      }
    `;

    // --- 步骤 3: 调用 LLM ---
    console.log("步骤3: 准备调用 decideNextActivityWithLLM...");
    console.log("Prompt 长度:", decisionPrompt.length);
    const llmResponse = await decideNextActivityWithLLM(decisionPrompt);
    console.log(
      "步骤3: decideNextActivityWithLLM 返回:",
      llmResponse ? "成功" : "失败/Null"
    );

    let finalPlanData;

    if (!llmResponse) {
      console.warn("LLM未能生成有效方案，使用候选地点回退生成");
      finalPlanData = buildPlanFromPlaces({
        places: placesWithCost,
        people,
        timeRange,
        dateRange,
        startLocation,
        startLocationCoords,
      });
    } else if (isMultiDay && llmResponse.hotel && llmResponse.days) {
      // --- 步骤 4: 后端校验、丰富和最终确定方案 ---
      console.log("步骤4: 开始对AI方案进行校验、补充交通信息...");
      // 多天行程处理
      console.log("处理多天行程方案...");

      // 处理酒店信息
      const hotelDetails = placesWithCost.find(
        (p) => p.id === llmResponse.hotel.id
      );
      const finalHotel = hotelDetails
        ? {
            ...hotelDetails,
            ...llmResponse.hotel,
          }
        : llmResponse.hotel;

      // 处理每天的活动
      const finalDays = [];
      let currentLocationCoords = startLocationCoords;

      for (const dayData of llmResponse.days) {
        const dayActivities = [];

        for (const activityDraft of dayData.activities) {
          const fullActivityDetails = placesWithCost.find(
            (p) => p.id === activityDraft.id
          );
          if (!fullActivityDetails) {
            console.warn(
              `警告: AI决策的地点 "${activityDraft.name}" (ID: ${activityDraft.id}) 不在候选列表中，已跳过。`
            );
            continue;
          }

          const travelInfo = await getComprehensiveTravelInfo(
            currentLocationCoords,
            fullActivityDetails.location
          );
          console.log(
            `第${dayData.day}天活动 ${activityDraft.name} 综合交通信息:`,
            travelInfo
          );

          const finalActivity = {
            ...fullActivityDetails,
            ...activityDraft,
            travel: travelInfo || null,
          };

          dayActivities.push(finalActivity);
          currentLocationCoords = fullActivityDetails.location;
        }

        if (dayActivities.length > 0) {
          finalDays.push({
            day: dayData.day,
            activities: dayActivities,
          });
        }
      }

      // 计算预算信息（多天行程）
      const allActivities = finalDays.flatMap((day) => day.activities);
      const budgetInfo = calculatePlanBudget(
        allActivities,
        parseInt(people),
        finalHotel
      );

      finalPlanData = {
        hotel: finalHotel,
        days: finalDays,
        isMultiDay: true,
        budgetInfo: budgetInfo,
      };
    } else {
      // --- 步骤 4: 后端校验、丰富和最终确定方案 ---
      console.log("步骤4: 开始对AI方案进行校验、补充交通信息...");
      // 单天行程处理（保持原有逻辑）
      if (!llmResponse.activities || llmResponse.activities.length === 0) {
        throw new Error("AI未能生成有效的活动方案");
      }

      const finalPlanActivities = [];
      let currentLocationCoords = startLocationCoords;

      for (const activityDraft of llmResponse.activities) {
        const fullActivityDetails = placesWithCost.find(
          (p) => p.id === activityDraft.id
        );
        if (!fullActivityDetails) {
          console.warn(
            `警告: AI决策的地点 "${activityDraft.name}" (ID: ${activityDraft.id}) 不在候选列表中，已跳过。`
          );
          continue;
        }
        const travelInfo = await getComprehensiveTravelInfo(
          currentLocationCoords,
          fullActivityDetails.location
        );
        console.log("步骤 4: 获取到各地点综合交通信息:", travelInfo);
        const finalActivity = {
          ...fullActivityDetails,
          ...activityDraft,
          travel: travelInfo || null,
        };

        finalPlanActivities.push(finalActivity);
        currentLocationCoords = fullActivityDetails.location;
      }

      if (finalPlanActivities.length === 0) {
        throw new Error("未能生成任何有效的活动方案");
      }

      // 计算预算信息（单天行程）
      const budgetInfo = calculatePlanBudget(
        finalPlanActivities,
        parseInt(people),
        null
      );

      finalPlanData = {
        activities: finalPlanActivities,
        isMultiDay: false,
        budgetInfo: budgetInfo,
      };
    }

    // --- 步骤 5: 存储到数据库（可选） ---
    const planTitle = name;
    let dbPlanId = null;

    try {
      if (!forceNew && feedback && previousPlan && previousPlan.id) {
        console.log(`正在覆盖数据库中的旧方案 ID: ${previousPlan.id}...`);
        const updateSql =
          "UPDATE `plans` SET title = ?, details = ? WHERE id = ?";
        await db.query(updateSql, [
          planTitle,
          JSON.stringify(finalPlanData),
          previousPlan.id,
        ]);
        dbPlanId = previousPlan.id;
      } else {
        console.log("正在创建新方案到数据库...");
        const planSql =
          "INSERT INTO `plans` (title, details, creatorId) VALUES (?, ?, ?)";
        const [result] = await db.query(planSql, [
          planTitle,
          JSON.stringify(finalPlanData),
          creatorId || 1,
        ]);
        dbPlanId = result && result.insertId ? result.insertId : null;
      }
    } catch (e) {
      console.warn("数据库不可用，跳过保存:", e?.message || e);
    }

    const normalizedId = Number(dbPlanId);
    dbPlanId = Number.isFinite(normalizedId)
      ? normalizedId
      : Number(String(Date.now()).slice(-9));

    // 更新状态为完成
    generationStatus.set(planId, {
      ready: true,
      success: true,
      data: {
        name: planTitle,
        id: dbPlanId,
        title: planTitle,
        ...finalPlanData,
      },
      error: null,
    });

    console.log(`方案 ${planId} 生成完成！`);
  } catch (error) {
    console.error(`方案 ${planId} 生成失败:`, error);

    // 更新状态为失败
    generationStatus.set(planId, {
      ready: true,
      success: false,
      data: null,
      error: error.message,
    });
  }
}

module.exports = {
  generatePlanAsync,
};
