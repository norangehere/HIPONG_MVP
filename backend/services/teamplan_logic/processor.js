// services/plan_logic/processor.js
const geoLogic = require("./geo"); // 引用搜索能力(找酒店用)

/**
 * [辅助] 智能解析地点 (ID匹配 -> 名称模糊匹配)
 */
const resolvePlace = (draft, candidateList) => {
  // 1. 严格 ID 匹配
  let place = candidateList.find((p) => p.id === draft.id);
  // 2. 容错模糊匹配
  if (!place) {
    place = candidateList.find(
      (p) =>
        p.name === draft.name ||
        p.name.includes(draft.name) ||
        draft.name.includes(p.name)
    );
    if (place) {
      console.log(`[Processor] 修正地点匹配: ${draft.name} -> ${place.name}`);
      draft.id = place.id; // 修正 ID
    }
  }
  return place;
};

/**
 * [核心] 为一串活动计算交通耗时 (完全并行化)
 * @param {Array} activities - AI 生成的活动列表
 * @param {string} startCoords -当天的起始点坐标
 * @returns {Promise<Array>} - 带有 travel 信息的活动列表
 */
const enrichActivitiesWithTravel = async (
  activities,
  startCoords,
  candidateList
) => {
  // 1. 先把所有活动对应的真实地点信息填进去
  const validActivities = [];
  let lastCoords = startCoords;

  // 这里必须串行构建“坐标链”，因为下一个点的起点是上一个点的终点
  // 但注意：我们只是构建请求参数，不是发请求，所以很快
  const tasks = [];

  for (const draft of activities) {
    const placeInfo = resolvePlace(draft, candidateList);
    if (!placeInfo) {
      console.warn(`[Processor] 丢弃无效地点: ${draft.name}`);
      continue;
    }

    // 构建一个待计算的任务
    const origin = lastCoords;
    const destination = placeInfo.location;

    tasks.push({
      draft: draft,
      placeInfo: placeInfo,
      origin: origin,
      destination: destination,
    });

    lastCoords = destination; // 更新指针
  }

  if (tasks.length === 0) return [];

  console.log(`[Processor] 并行计算 ${tasks.length} 段路程交通...`);

  // 2. 并行发射所有交通请求 (核心提速点)
  const travelResults = await Promise.all(
    tasks.map((t) =>
      geoLogic.getComprehensiveTravelInfo(t.origin, t.destination)
    )
  );

  // 3. 组装结果
  return tasks.map((task, index) => ({
    ...task.placeInfo, // 基础信息 (高德)
    ...task.draft, // AI 描述 (时间、玩法)
    travel: travelResults[index] || null, // 交通信息
  }));
};

/**
 * [辅助] 智能匹配酒店
 */
const findBestHotel = async (locationCoords) => {
  try {
    // 搜 5km 内的酒店
    const hotels = await geoLogic.searchNearbyPlacesMultiCenter(
      locationCoords,
      "100000",
      5,
      5
    );
    if (hotels && hotels.length > 0) {
      // 按评分降序
      hotels.sort(
        (a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0)
      );
      return hotels[0];
    }
  } catch (e) {
    console.error("[Processor] 酒店匹配失败:", e.message);
  }
  return null;
};

module.exports = {
  enrichActivitiesWithTravel,
  findBestHotel,
};
