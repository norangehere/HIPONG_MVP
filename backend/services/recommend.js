const got = require("got");
const { recommendationStatus } = require("../config/global");
const {
  getCityByCoords,
  getPlaceDetailsByNameAndAddress,
  isNearSubway,
  calculateAllPersonsTravelTime,
} = require("../utils/map");

const DEEPSEEK_API_KEY =
  process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY;
const API_ENDPOINT = "https://api.deepseek.com/chat/completions";

// ============================================================
// 【核心算法】计算单个地点的综合得分
// 权重: 公平性 0.3 + 交通便利性 0.3 + 地点质量 0.4
// ============================================================
function calculatePoiScore(poi, travelTimes, hasSubwayNearby) {
  const validTimes = travelTimes.filter(
    (t) => t !== null && t !== Infinity && !isNaN(t)
  );

  // 1. 公平性得分 (0.3权重) - 基于到达时间的方差
  let fairnessScore = 0;
  if (validTimes.length > 0) {
    const avgTime = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
    const variance =
      validTimes.reduce((sum, t) => sum + Math.pow(t - avgTime, 2), 0) /
      validTimes.length;
    const stdDev = Math.sqrt(variance);
    // 标准差在30分钟以内是可接受的
    fairnessScore = Math.max(0, 1 - stdDev / 30);
  }

  // 2. 交通便利性得分 (0.3权重) - 是否靠近地铁站
  const convenienceScore = hasSubwayNearby ? 1.0 : 0.4;

  // 3. 地点质量得分 (0.4权重) - 基于评分
  let qualityScore = 0.5;
  if (
    poi.business &&
    poi.business.rating &&
    poi.business.rating !== "暂无" &&
    poi.business.rating !== "暂無"
  ) {
    const rating = parseFloat(poi.business.rating);
    if (!isNaN(rating)) {
      qualityScore = Math.min(1, rating / 5);
    }
  }

  const totalScore =
    0.3 * fairnessScore + 0.3 * convenienceScore + 0.4 * qualityScore;

  return {
    totalScore,
    fairnessScore,
    convenienceScore,
    qualityScore,
    avgTravelTime:
      validTimes.length > 0
        ? validTimes.reduce((a, b) => a + b, 0) / validTimes.length
        : Infinity,
    maxTravelTime: validTimes.length > 0 ? Math.max(...validTimes) : Infinity,
  };
}

// ============================================================
// 【新增】检查地点是否在预算范围内
// ============================================================
function checkBudget(poi, maxBudget, minBudget = null) {
  // 如果没有设置预算限制，直接返回通过
  if (!maxBudget && !minBudget) {
    return { withinBudget: true, cost: null, reason: null };
  }

  // 获取人均消费
  let cost = null;
  if (poi.business && poi.business.cost && poi.business.cost !== "暂无") {
    cost = parseFloat(poi.business.cost);
    if (isNaN(cost)) {
      cost = null;
    }
  }

  // 如果没有价格信息，默认通过（不因为缺少数据而淘汰）
  if (cost === null) {
    return { withinBudget: true, cost: null, reason: null };
  }

  // 检查是否超出最大预算
  if (maxBudget && cost > maxBudget) {
    return {
      withinBudget: false,
      cost: cost,
      reason: `人均${cost}元 > 最大预算${maxBudget}元`,
    };
  }

  // 检查是否低于最小预算（可选）
  if (minBudget && cost < minBudget) {
    return {
      withinBudget: false,
      cost: cost,
      reason: `人均${cost}元 < 最小预算${minBudget}元`,
    };
  }

  return { withinBudget: true, cost: cost, reason: null };
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================
// 【主函数】异步生成目的地推荐列表（带公平性排序 + 预算筛选）
// ============================================================
async function generateRecommendationsAsync(recId, params) {
  try {
    const {
      preferenceText,
      origin,
      partners = [],
      types,
      maxTransitTime = 60,
      maxBudget = null, // 【新增】最大人均预算（元）
      minBudget = null, // 【新增】最小人均预算（元），可选
    } = params;

    console.log(`[${recId}] ========== 开始智能推荐流程 ==========`);
    console.log(`[${recId}] 用户偏好: "${preferenceText}"`);
    console.log(`[${recId}] 出发点: ${origin.name}`);
    console.log(`[${recId}] 同行者数量: ${partners.length}`);
    console.log(`[${recId}] 最大公交时间: ${maxTransitTime}分钟`);
    // 【新增】打印预算信息
    if (maxBudget || minBudget) {
      console.log(
        `[${recId}] 预算范围: ${minBudget || 0} ~ ${maxBudget || "不限"}元/人`
      );
    } else {
      console.log(`[${recId}] 预算范围: 不限`);
    }

    // 收集所有人的位置
    const allLocations = [origin];
    if (partners && partners.length > 0) {
      partners.forEach((p, idx) => {
        if (p.latitude && p.longitude) {
          allLocations.push({
            latitude: p.latitude,
            longitude: p.longitude,
            name: p.name || `同行者${idx + 1}`,
          });
        }
      });
    }
    console.log(`[${recId}] 参与计算的位置点: ${allLocations.length}个`);

    // ============ 第一步：调用大模型获取候选地点 ============
    console.log(`[${recId}] [步骤1] 正在调用大模型...`);

    // 【优化】在prompt中加入预算和交通时间提示，让大模型优先推荐符合预算和交通时间的地点
    let budgetHint = "";
    if (maxBudget) {
      budgetHint = `\n4. 优先推荐人均消费在${maxBudget}元以内的地点`;
    }

    // 【新增】添加交通时间约束提示
    const transitTimeHint = `\n5. 优先推荐距离出发点较近、交通便利的地点，确保大多数人能在${maxTransitTime}分钟内到达`;

    const prompt = `
你是一位顶级的本地生活发现家。请根据用户的偏好和位置，推荐 15-20 个真实的地点。

【用户偏好】"${preferenceText}"
【位置】${origin.name} (${origin.latitude}, ${origin.longitude})
【类型】${types && types.length > 0 ? types.join("、") : "不限"}
${maxBudget ? `【预算】人均${maxBudget}元以内` : ""}
【交通时间限制】${maxTransitTime}分钟

要求：
1. 优先推荐交通便利的地点（靠近地铁站）
2. 推荐口碑好、评价高的地点
3. 地点分布在城市不同区域
4. 重要：地点应位于出发点附近或交通便利区域，确保能在${maxTransitTime}分钟内通过公共交通到达${transitTimeHint}
${budgetHint}

返回纯JSON：
{
  "pois": [
    { "name": "店铺完整名称", "address": "大致地址" }
  ]
}

RETURN ONLY JSON.
`;

    const response = await got.post(API_ENDPOINT, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      json: {
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
      },
      responseType: "json",
      timeout: { request: 60000 },
    });

    const llmResult = response.body.choices[0].message.content;
    const cleanedJson = llmResult
      .replace(/```json\n?/g, "")
      .replace(/\n?```/g, "")
      .trim();
    const resultJson = JSON.parse(cleanedJson);
    const suggestedPois = resultJson.pois;

    if (!Array.isArray(suggestedPois) || suggestedPois.length === 0) {
      throw new Error("大模型未能推荐任何地点");
    }
    console.log(
      `[${recId}] [步骤1完成] 获得 ${suggestedPois.length} 个候选地点`
    );

    // ============ 第二步：使用高德API丰富地点信息 ============
    console.log(`[${recId}] [步骤2] 正在获取地点详情...`);

    const userCityInfo = await getCityByCoords(origin);
    const searchCityName = userCityInfo?.name || "全国";
    const searchCityCode = userCityInfo?.code || "100000";

    const enrichedPois = [];
    for (let i = 0; i < suggestedPois.length; i++) {
      const poi = suggestedPois[i];
      try {
        const enriched = await getPlaceDetailsByNameAndAddress(
          poi.name,
          poi.address,
          searchCityName,
          searchCityCode
        );
        if (enriched && enriched.location) {
          enrichedPois.push(enriched);
        }
      } catch (error) {
        console.warn(`获取 "${poi.name}" 详情失败`);
      }
      if (i < suggestedPois.length - 1) await delay(150);
    }
    console.log(
      `[${recId}] [步骤2完成] 成功获取 ${enrichedPois.length} 个地点详情`
    );

    if (enrichedPois.length === 0) {
      throw new Error("无法获取任何地点详情");
    }

    // ============ 第三步：计算交通时间并评分 ============
    console.log(`[${recId}] [步骤3] 正在计算交通时间并筛选...`);

    const poisWithScores = [];
    let budgetFilteredCount = 0; // 【新增】记录因预算被淘汰的数量
    let timeFilteredCount = 0; // 【新增】记录因超时被淘汰的数量

    for (let i = 0; i < enrichedPois.length; i++) {
      const poi = enrichedPois[i];
      console.log(
        `[${recId}] 处理 ${i + 1}/${enrichedPois.length}: "${poi.name}"`
      );

      // 【新增】首先检查预算
      const budgetCheck = checkBudget(poi, maxBudget, minBudget);
      if (!budgetCheck.withinBudget) {
        console.log(`[${recId}] ❌ 淘汰 "${poi.name}": ${budgetCheck.reason}`);
        budgetFilteredCount++;
        continue; // 跳过这个地点，不再计算交通时间（节省API调用）
      }

      // 计算所有人到这个地点的交通时间
      const travelResult = await calculateAllPersonsTravelTime(
        allLocations,
        poi,
        searchCityName
      );
      const travelTimes = travelResult.times || [];

      // 检查是否靠近地铁
      let hasSubwayNearby = false;
      try {
        hasSubwayNearby = await isNearSubway(poi.location);
      } catch (e) {
        console.warn(`检查地铁站失败: ${e.message}`);
      }

      // 计算得分
      const scoreInfo = calculatePoiScore(poi, travelTimes, hasSubwayNearby);

      // 筛选：所有人时间都不超过限制
      const validTimes = travelTimes.filter(
        (t) => t !== null && t !== Infinity && !isNaN(t)
      );
      const allWithinLimit =
        validTimes.length === 0 || validTimes.every((t) => t <= maxTransitTime);

      if (allWithinLimit) {
        poisWithScores.push({
          ...poi,
          travelTimes,
          hasSubwayNearby,
          scoreInfo,
          cost: budgetCheck.cost, // 【新增】保存人均消费信息
        });
      } else {
        console.log(
          `[${recId}] ❌ 淘汰 "${poi.name}": 超时 (最大${Math.max(
            ...validTimes
          )}分钟 > 限制${maxTransitTime}分钟)`
        );
        timeFilteredCount++;
      }

      await delay(300);
    }

    // 【新增】打印筛选统计
    console.log(
      `[${recId}] 筛选统计: 预算淘汰${budgetFilteredCount}个, 超时淘汰${timeFilteredCount}个`
    );
    console.log(`[${recId}] 筛选后剩余 ${poisWithScores.length} 个地点`);

    // 排序并取前10
    poisWithScores.sort(
      (a, b) => b.scoreInfo.totalScore - a.scoreInfo.totalScore
    );
    const topPois = poisWithScores.slice(0, 10);

    // ============ 第四步：格式化结果 ============
    const finalPois = topPois.map((poi, index) => {
      const validTimes = poi.travelTimes.filter(
        (t) => t !== null && t !== Infinity && !isNaN(t)
      );
      const avgTransitTime =
        validTimes.length > 0
          ? Math.round(
              validTimes.reduce((a, b) => a + b, 0) / validTimes.length
            )
          : null;

      return {
        id: poi.id,
        name: poi.name,
        location: poi.location,
        address: poi.address,
        citycode: poi.citycode,
        business: poi.business,
        photos: poi.photos,
        transitTime: avgTransitTime,
        drivingTime: avgTransitTime ? Math.round(avgTransitTime * 0.7) : null,
        travelDetails: {
          individualTimes: poi.travelTimes,
          avgTime: avgTransitTime,
          maxTime: validTimes.length > 0 ? Math.max(...validTimes) : null,
          minTime: validTimes.length > 0 ? Math.min(...validTimes) : null,
          timeDifference:
            validTimes.length > 1
              ? Math.max(...validTimes) - Math.min(...validTimes)
              : 0,
        },
        scoreInfo: {
          total: Math.round(poi.scoreInfo.totalScore * 100) / 100,
          fairness: Math.round(poi.scoreInfo.fairnessScore * 100) / 100,
          convenience: Math.round(poi.scoreInfo.convenienceScore * 100) / 100,
          quality: Math.round(poi.scoreInfo.qualityScore * 100) / 100,
        },
        hasSubwayNearby: poi.hasSubwayNearby,
        rank: index + 1,
      };
    });

    console.log(`[${recId}] ========== 推荐完成 ==========`);
    finalPois.forEach((poi, i) => {
      // 【优化】打印时增加人均消费信息
      const costInfo =
        poi.business?.cost && poi.business.cost !== "暂无"
          ? `, 人均:${poi.business.cost}元`
          : "";
      console.log(
        `[${recId}] ${i + 1}. ${poi.name} (得分:${
          poi.scoreInfo.total
        }, 公平性:${poi.scoreInfo.fairness}, 便利:${
          poi.scoreInfo.convenience
        }, 质量:${poi.scoreInfo.quality}${costInfo})`
      );
    });

    // 返回数据时包含原始查询参数，以便后续的优化推荐可以继承这些设置
    recommendationStatus.set(recId, {
      ready: true,
      success: true,
      data: {
        pois: finalPois,
        // 包含原始查询参数，用于后续优化推荐
        originalQuery: {
          preferenceText,
          origin,
          partners,
          types,
          maxTransitTime,
          maxBudget,
          minBudget,
          allLocations, // 包含所有位置信息
        },
      },
      error: null,
    });
  } catch (error) {
    console.error(`[${recId}] ❌ 任务失败:`, error.message);
    recommendationStatus.set(recId, {
      ready: true,
      success: false,
      data: null,
      error: error.message,
    });
  }
}

// ============================================================
// 多轮对话优化推荐（自动继承第一轮的设置）
// ============================================================
async function refineRecommendationsAsync(recId, params) {
  try {
    const { originalQuery, currentResults, refinementRequest } = params;

    // 调试日志：输出 originalQuery 的内容
    console.log(
      `[${recId}] DEBUG: originalQuery received:`,
      JSON.stringify(originalQuery, null, 2)
    );

    // 【核心修改】从 originalQuery 中继承第一轮的所有设置
    // 前端只需传 refinementRequest（用户新要求），其他参数自动从 originalQuery 读取
    // 如果 allLocations 为空但 origin 存在，则重建 allLocations
    const allLocations =
      originalQuery &&
      originalQuery.allLocations &&
      originalQuery.allLocations.length > 0
        ? originalQuery.allLocations
        : originalQuery && originalQuery.origin
        ? [originalQuery.origin]
        : [];
    const maxTransitTime =
      originalQuery && originalQuery.maxTransitTime
        ? originalQuery.maxTransitTime
        : 60;
    const maxBudget =
      originalQuery && originalQuery.maxBudget !== undefined
        ? originalQuery.maxBudget
        : null;
    const minBudget =
      originalQuery && originalQuery.minBudget !== undefined
        ? originalQuery.minBudget
        : null;

    console.log(`[${recId}] 开始优化推荐...`);
    console.log(`[${recId}] 用户新要求: "${refinementRequest}"`);
    console.log(`[${recId}] 【继承第一轮设置】`);
    console.log(`[${recId}]   - 参与位置计算的人数: ${allLocations.length}`);
    console.log(`[${recId}]   - 最大通勤时间: ${maxTransitTime}分钟`);
    if (maxBudget || minBudget) {
      console.log(
        `[${recId}]   - 预算范围: ${minBudget || 0} ~ ${
          maxBudget || "不限"
        }元/人`
      );
    } else {
      console.log(`[${recId}]   - 预算范围: 不限`);
    }

    // 在prompt中加入预算信息
    const prompt = `
你是地点推荐助手。根据用户新要求优化推荐列表。

【原始偏好】${originalQuery.prefs || originalQuery.preferenceText || "未指定"}
【当前推荐】${JSON.stringify(currentResults.map((r) => r.name))}
【新要求】"${refinementRequest}"
${maxBudget ? `【预算限制】人均${maxBudget}元以内` : ""}

推荐10-15个新地点，返回纯JSON：
{ "pois": [{ "name": "名称", "address": "地址" }] }

RETURN ONLY JSON.
`;

    const response = await got.post(API_ENDPOINT, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      json: {
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
      },
      responseType: "json",
      timeout: { request: 60000 },
    });

    const llmResult = response.body.choices[0].message.content;
    const jsonMatch = llmResult.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("返回格式错误");

    const newPois = JSON.parse(jsonMatch[0]).pois || [];
    console.log(`[${recId}] 大模型推荐了 ${newPois.length} 个新地点`);

    const cityName = currentResults?.[0]?.cityname || "全国";
    const cityCode = currentResults?.[0]?.citycode || "100000";

    const enrichedPois = [];
    for (const poi of newPois) {
      try {
        const enriched = await getPlaceDetailsByNameAndAddress(
          poi.name,
          poi.address,
          cityName,
          cityCode
        );
        if (enriched) enrichedPois.push(enriched);
      } catch (e) {
        console.warn(`获取 "${poi.name}" 详情失败`);
      }
      await delay(150);
    }

    let finalRecommendations = enrichedPois.slice(0, 10).map((poi) => ({
      ...poi,
      transit: null,
      drive: null,
      liked: false,
      cover: poi.photos && poi.photos.length > 0 ? poi.photos[0].url : "",
    }));

    // 如果有位置信息，计算交通时间并排序
    if (allLocations && allLocations.length > 0) {
      console.log(
        `[${recId}] 开始计算 ${enrichedPois.length} 个地点的交通时间...`
      );
      const scoredPois = [];

      for (const poi of enrichedPois) {
        if (!poi.location) continue;

        // 【新增】首先检查预算
        const budgetCheck = checkBudget(poi, maxBudget, minBudget);
        if (!budgetCheck.withinBudget) {
          console.log(
            `[${recId}] ❌ 淘汰 "${poi.name}": ${budgetCheck.reason}`
          );
          continue;
        }

        const travelResult = await calculateAllPersonsTravelTime(
          allLocations,
          poi,
          cityName
        );
        const travelTimes = travelResult.times || [];

        let hasSubwayNearby = false;
        try {
          hasSubwayNearby = await isNearSubway(poi.location);
        } catch (e) {}

        const scoreInfo = calculatePoiScore(poi, travelTimes, hasSubwayNearby);
        const validTimes = travelTimes.filter(
          (t) => t !== null && t !== Infinity && !isNaN(t)
        );

        // 筛选：所有人都能在时间限制内到达
        if (
          validTimes.length === 0 ||
          validTimes.every((t) => t <= maxTransitTime)
        ) {
          const avgTime =
            validTimes.length > 0
              ? Math.round(
                  validTimes.reduce((a, b) => a + b, 0) / validTimes.length
                )
              : null;

          scoredPois.push({
            ...poi,
            transit: avgTime,
            drive: avgTime ? Math.round(avgTime * 0.7) : null,
            scoreInfo: {
              total: Math.round(scoreInfo.totalScore * 100) / 100,
              fairness: Math.round(scoreInfo.fairnessScore * 100) / 100,
              convenience: Math.round(scoreInfo.convenienceScore * 100) / 100,
              quality: Math.round(scoreInfo.qualityScore * 100) / 100,
            },
            hasSubwayNearby,
            liked: false,
            cover: poi.photos && poi.photos.length > 0 ? poi.photos[0].url : "",
          });
        } else {
          console.log(`[${recId}] ❌ 淘汰 "${poi.name}": 超时`);
        }

        await delay(300);
      }

      // 按综合得分排序
      scoredPois.sort((a, b) => b.scoreInfo.total - a.scoreInfo.total);
      finalRecommendations = scoredPois.slice(0, 10);
    }

    console.log(
      `[${recId}] 优化完成，返回 ${finalRecommendations.length} 个地点`
    );

    recommendationStatus.set(recId, {
      ready: true,
      success: true,
      data: { recommendations: finalRecommendations },
      error: null,
    });
  } catch (error) {
    console.error(`[${recId}] 优化失败:`, error.message);
    recommendationStatus.set(recId, {
      ready: true,
      success: false,
      data: null,
      error: error.message,
    });
  }
}

module.exports = { refineRecommendationsAsync, generateRecommendationsAsync };
