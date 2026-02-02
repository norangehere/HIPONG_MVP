const axios = require("axios");

/**
 * [最终版] 使用高德关键字搜索，结合地址和中心点来提高准确性
 * @param {string} name 店铺名称
 * @param {string} address 大致地址
 * @param {string} city 城市名称，用于高德API的city参数。
 * @param {string} citycode 城市编码，用于在最终结果中返回。
 * @returns {Promise<object|null>} 返回一个结构化的 POI 对象，或 null
 */
const getPlaceDetailsByNameAndAddress = async (
  name,
  address,
  city = "全国",
  citycode = "100000"
) => {
  // 优化搜索关键词：去掉括号里的分店信息，只保留核心店名
  // 例如："海底捞火锅(西单店)" -> "海底捞火锅"
  let keywords = name
    .replace(/\(.*?\)/g, "")
    .replace(/（.*?）/g, "")
    .trim();

  // 如果处理后为空，使用原名
  if (!keywords) {
    keywords = name;
  }

  // 防御性检查：确保 city 是一个有效的字符串
  const searchCity = typeof city === "string" && city ? city : "全国";

  console.log(`高德搜索 -> 关键词: "${keywords}", 城市: ${searchCity}`);

  const apiKey = process.env.MAP_API_KEY || process.env.AMAP_API_KEY;
  const url = "https://restapi.amap.com/v3/place/text";

  try {
    const response = await axios.get(url, {
      params: {
        key: apiKey,
        keywords: keywords,
        city: searchCity,
        citylimit: searchCity !== "全国",
        offset: 1, // 【修复】v3 API 用 offset 而不是 page_size
        extensions: "all", // 【修复】v3 API 需要 extensions=all 获取评分等详细信息
      },
    });

    if (
      response.data &&
      response.data.status === "1" &&
      response.data.pois.length > 0
    ) {
      const poi = response.data.pois[0];

      // 【修复】v3 API 的评分和价格在 biz_ext 字段里，不是 business
      // biz_ext.rating 和 biz_ext.cost 可能是数组(空)或字符串(有值)
      let rating = "暂无";
      let cost = "暂无";

      if (poi.biz_ext) {
        // 处理 rating：可能是 "4.5" 或 [] 或 undefined
        if (
          poi.biz_ext.rating &&
          !Array.isArray(poi.biz_ext.rating) &&
          String(poi.biz_ext.rating).length > 0
        ) {
          rating = poi.biz_ext.rating;
        }
        // 处理 cost：可能是 "80" 或 [] 或 undefined
        if (
          poi.biz_ext.cost &&
          !Array.isArray(poi.biz_ext.cost) &&
          String(poi.biz_ext.cost).length > 0
        ) {
          cost = poi.biz_ext.cost;
        }
      }

      // 调试日志：查看原始返回的评分数据
      console.log(
        `  📊 原始评分数据: rating=${JSON.stringify(
          poi.biz_ext?.rating
        )}, cost=${JSON.stringify(poi.biz_ext?.cost)}`
      );

      const formattedPoi = {
        id: poi.id,
        name: poi.name,
        location: poi.location,
        address: poi.address,
        citycode: citycode,
        business: {
          cost: cost,
          rating: rating,
        },
        photos: poi.photos || [],
      };
      console.log(
        `  ✅ 成功匹配到: "${poi.name}" (评分: ${rating}, 人均: ${cost})`
      );
      return formattedPoi;
    }
    console.warn(
      `  ❌ 未能通过关键词 "${keywords}" 在城市 "${searchCity}" 找到匹配的地点。`
    );
    return null;
  } catch (error) {
    // 关键：在 catch 块中也要返回 null，以防止 Promise.all 中断
    console.error(`  ❌ 高德API请求失败 for "${keywords}":`, error.message);
    return null;
  }
};

/**
 * [工具型] 通过经纬度逆地理编码获取城市信息（名称和编码）
 * @param {object} coords - 包含经纬度的对象 { latitude, longitude }
 * @returns {Promise<object|null>} - 返回一个包含城市名称和编码的对象 { name: "杭州市", code: "0571" }，或 null
 */
const getCityByCoords = async (coords) => {
  if (!coords || !coords.latitude || !coords.longitude) {
    return null;
  }
  console.log(
    `高德逆地理编码 -> 经纬度: ${coords.longitude},${coords.latitude}`
  );
  const apiKey = process.env.MAP_API_KEY || process.env.AMAP_API_KEY;
  const url = "https://restapi.amap.com/v3/geocode/regeo";
  try {
    const response = await axios.get(url, {
      params: {
        key: apiKey,
        location: `${coords.longitude},${coords.latitude}`,
      },
    });

    if (
      response.data &&
      response.data.status === "1" &&
      response.data.regeocode
    ) {
      const addressComponent = response.data.regeocode.addressComponent;
      console.log(
        `  调试 - addressComponent:`,
        JSON.stringify(addressComponent)
      );
      const city = addressComponent.city;

      // 【新增】同时获取 citycode
      const cityCode = addressComponent.citycode;

      // 如果 city 是一个空数组（直辖市的情况），则使用 province
      const cityName =
        Array.isArray(city) && city.length === 0
          ? addressComponent.province
          : city;

      console.log(`  ✅ 成功解析城市为: ${cityName} (编码: ${cityCode})`);

      // 【修改】返回一个包含名称和编码的对象
      return { name: cityName, code: cityCode };
    }
    console.log(
      `  ❌ 逆地理编码失败，返回数据:`,
      JSON.stringify(response.data)
    );
    return null;
  } catch (error) {
    console.error(`  ❌ 逆地理编码失败:`, error.message);
    return null;
  }
};

/**
 * [工具型] 调用高德地图【驾车路径规划】API
 * @param {string} origin - 起点坐标, "经度,纬度"
 * @param {string} destination - 终点坐标, "经度,纬度"
 * @returns {Promise<Object|null>} - 返回包含距离和时间的交通信息对象
 */
const getDrivingInfo = async (origin, destination) => {
  console.log(
    `高德地图API: 计算从 ${origin} 到 ${destination} 的驾车时间和距离。`
  );
  const apiKey = process.env.MAP_API_KEY || process.env.AMAP_API_KEY;
  const url = "https://restapi.amap.com/v3/direction/driving";

  try {
    const response = await axios.get(url, {
      params: {
        key: apiKey,
        origin,
        destination,
        show_fields: "cost,tmcs,cities",
      },
    });

    if (
      response.data &&
      response.data.status === "1" &&
      response.data.route?.paths?.length > 0
    ) {
      const path = response.data.route.paths[0];
      // console.log('full response data',response.data.route);
      const distanceMeters = parseFloat(path.distance);
      const durationSeconds = parseFloat(path.duration);

      return {
        distance: `${(distanceMeters / 1000).toFixed(2)} km`,
        duration: `${Math.ceil(durationSeconds / 60)} 分钟`,
      };
    }
    return null;
  } catch (error) {
    console.error("请求高德地图驾车路径API失败:", error);
    return null;
  }
};

/**
 * [工具型] 调用高德地图【步行路径规划】API
 * @param {string} origin - 起点坐标, "经度,纬度"
 * @param {string} destination - 终点坐标, "经度,纬度"
 * @returns {Promise<Object|null>} - 返回包含步行距离和时间的交通信息对象
 */
const getWalkingInfo = async (origin, destination) => {
  console.log(
    `高德地图API: 计算从 ${origin} 到 ${destination} 的步行时间和距离。`
  );
  const apiKey = process.env.MAP_API_KEY || process.env.AMAP_API_KEY;
  const url = "https://restapi.amap.com/v3/direction/walking";

  try {
    const response = await axios.get(url, {
      params: {
        key: apiKey,
        origin,
        destination,
      },
    });

    if (
      response.data &&
      response.data.status === "1" &&
      response.data.route?.paths?.length > 0
    ) {
      const path = response.data.route.paths[0];
      const distanceMeters = parseFloat(path.distance);
      const durationSeconds = parseFloat(path.duration);

      return {
        distance: `${(distanceMeters / 1000).toFixed(2)} km`,
        duration: `${Math.ceil(durationSeconds / 60)} 分钟`,
      };
    }
    return null;
  } catch (error) {
    console.error("请求高德地图步行路径API失败:", error);
    return null;
  }
};

/**
 * [工具型] 通过经纬度动态获取城市名称（逆地理）只为getTransitInfo服务
 * @param {string} location - 坐标字符串 "经度,纬度"
 * @returns {Promise<string|null>} - 返回城市名称（直辖市时返回省级名称），失败返回 null
 */
const getCityNameByCoords = async (location) => {
  const apiKey = process.env.MAP_API_KEY || process.env.AMAP_API_KEY;
  const url = "https://restapi.amap.com/v3/geocode/regeo";

  try {
    const response = await axios.get(url, {
      params: {
        key: apiKey,
        location,
        extensions: "base",
        radius: 1000,
      },
    });

    if (response.data && response.data.status === "1") {
      const comp = response.data.regeocode?.addressComponent;
      if (comp) {
        const cityField = comp.city;
        if (typeof cityField === "string" && cityField.length > 0) {
          return cityField;
        }
        // 直辖市等场景，city 可能为空数组或空字符串，退回 province
        if (
          (Array.isArray(cityField) && cityField.length === 0) ||
          !cityField
        ) {
          return comp.province || null;
        }
      }
    }
    return null;
  } catch (error) {
    console.error("通过坐标逆地理获取城市失败:", error);
    return null;
  }
};

/**
 * [工具型] 调用高德地图【公交路径规划】API
 * @param {string} origin - 起点坐标, "经度,纬度"
 * @param {string} destination - 终点坐标, "经度,纬度"
 * @returns {Promise<Object|null>} - 返回包含公交距离和时间的交通信息对象
 */
const getTransitInfo = async (origin, destination) => {
  console.log(
    `高德地图API: 计算从 ${origin} 到 ${destination} 的公交时间和距离。`
  );
  const apiKey = process.env.MAP_API_KEY || process.env.AMAP_API_KEY;
  const url = "https://restapi.amap.com/v3/direction/transit/integrated";

  try {
    const cityName = await getCityNameByCoords(origin);

    const params = {
      key: apiKey,
      origin,
      destination,
    };
    if (cityName) {
      params.city = cityName;
    }

    const response = await axios.get(url, { params });

    if (
      response.data &&
      response.data.status === "1" &&
      response.data.route?.transits?.length > 0
    ) {
      const transit = response.data.route.transits[0];
      const distanceMeters = parseFloat(transit.distance);
      const durationSeconds = parseFloat(transit.duration);

      return {
        distance: `${(distanceMeters / 1000).toFixed(2)} km`,
        duration: `${Math.ceil(durationSeconds / 60)} 分钟`,
      };
    }
    return null;
  } catch (error) {
    console.error("请求高德地图公交路径API失败:", error);
    return null;
  }
};

/**
 * [综合型] 获取多种交通方式的完整信息
 * @param {string} origin - 起点坐标, "经度,纬度"
 * @param {string} destination - 终点坐标, "经度,纬度"
 * @returns {Promise<Object|null>} - 返回包含多种交通方式的完整信息
 */
const getComprehensiveTravelInfo = async (origin, destination) => {
  console.log(`获取从 ${origin} 到 ${destination} 的综合交通信息`);

  try {
    // 并行获取所有交通方式信息
    const [walkingInfo, drivingInfo, transitInfo] = await Promise.all([
      getWalkingInfo(origin, destination),
      getDrivingInfo(origin, destination),
      getTransitInfo(origin, destination),
    ]);

    // 提取步行距离用于判断显示逻辑
    const walkingDistance = walkingInfo ? parseFloat(walkingInfo.distance) : 0;

    // 根据距离决定显示哪些交通方式
    let displayOptions = [];

    if (walkingDistance < 3) {
      // 小于3km仅显示步行
      displayOptions = [{ type: "walking", info: walkingInfo, label: "步行" }];
    } else {
      // 超过8km，显示打车和公共交通
      displayOptions = [
        { type: "driving", info: drivingInfo, label: "打车" },
        { type: "transit", info: transitInfo, label: "公共交通" },
      ];
    }

    return {
      walkingDistance: walkingDistance,
      displayOptions: displayOptions,
      allInfo: {
        walking: walkingInfo,
        driving: drivingInfo,
        transit: transitInfo,
      },
    };
  } catch (error) {
    console.error("获取综合交通信息失败:", error);
    return null;
  }
};

// /**
//  * [搜索型] 调用高德地图【周边搜索】API
//  * @param {string} location - 中心点坐标, "经度,纬度"
//  * @param {string} types - POI类型编码，多个用'|'分隔
//  * @param {number} pageSize - **每种类型**期望返回的结果数量
//  * @param {number} radiusInKm - 搜索半径（公里）
//  * @returns {Promise<Array<Object>|null>} - 返回一个按综合评分排序的、包含多种类型地点的数组
//  */
// const searchNearbyPlaces = async (location, types, pageSize = 5, radiusInKm = 10) => {
//     console.log(`高德地图API: 在 ${location} 周边 ${radiusInKm}km 范围内搜索类型为 ${types} 的地点, 每种类型最多 ${pageSize} 个`);
//     const apiKey = process.env.AMAP_API_KEY;
//     const url = `https://restapi.amap.com/v5/place/around`;

//     const typeArray = types.split('|');
//     const searchPromises = typeArray.map(type => {
//         return axios.get(url, {
//             params: {
//                 key: apiKey,
//                 location,
//                 types: type,
//                 radius: radiusInKm * 1000,
//                 sortrule: 'weight',
//                 page_size: pageSize,
//                 show_fields: 'business,photos,children'
//             }
//         });
//     });

//     try {
//         const responses = await Promise.all(searchPromises);
//         console.log("🔥 高德API原始返回:", JSON.stringify(responses.data));
//         let allPlaces = [];
//         responses.forEach(response => {
//             if (response.data && response.data.status === '1' && response.data.pois.length > 0) {
//                 const places = response.data.pois.map((poi, index) => {
//                     const business = response.data.pois[index].business ? response.data.pois[index].business : null;
//                     return {
//                         id: poi.id,
//                         name: poi.name,
//                         address: poi.address,
//                         location: poi.location,
//                         rating: business ? business.rating : '暂无',
//                         perCapitaCost: business ? business.cost : '暂无', // 新增：人均花费信息
//                         tel: business ? business.tel : '暂无',
//                         photoUrl: poi.photos && poi.photos.length > 0 ? poi.photos[0].url : null,
//                         type: poi.type || '',
//                         business_area: poi.business_area || '',
//                         cityname: poi.cityname || '',
//                         adname: poi.adname || '',
//                         alias: poi.alias || ''
//                     };
//                 });
//                 allPlaces = allPlaces.concat(places);
//             }
//         });

//         // 优化排序算法：综合考虑评分、热门程度、类型匹配度等因素
//         allPlaces.sort((a, b) => {
//             const scoreA = calculatePlaceScore(a);
//             const scoreB = calculatePlaceScore(b);
//             return scoreB - scoreA;
//         });

//         const uniquePlaces = Array.from(new Map(allPlaces.map(item => [item.id, item])).values());

//         // 优化1: 只保留前60个候选地点，减少大模型工作量
//         const topPlaces = uniquePlaces.slice(0, 60);
//         console.log(`共获取到 ${uniquePlaces.length} 个不重复的候选地点，保留前 ${topPlaces.length} 个高质量地点。`);
//         return topPlaces;

//     } catch (error) {
//         console.error("请求高德地图API时发生并发错误:", error);
//         return null;
//     }
// };

const AMAP_KEY = process.env.MAP_API_KEY || process.env.AMAP_API_KEY;

/**
 * 搜索周边地点 (POI搜索) - 优化版
 * 1. 不再拆分 types，直接通过管道符 | 一次性请求，避免 QPS 超限。
 * 2. 增加详细的错误日志。
 */
const searchNearbyPlaces = async (
  location,
  types,
  pageSize = 20,
  radiusInKm = 5
) => {
  // 1. 检查 Key
  if (!AMAP_KEY) {
    console.error("❌ [MapUtils] 错误: .env 中未配置 AMAP_API_KEY");
    return [];
  }

  // 2. 转换半径 (km -> m)
  const radiusInMeters = Math.floor(radiusInKm * 1000);

  // 3. 构造 URL
  const url = "https://restapi.amap.com/v5/place/around";

  // 打印调试信息，确认参数是否正确
  console.log(
    `🌍 [MapUtils] 发起搜索: 中心[${location}] 半径[${radiusInKm}km] 类型[${types}]`
  );

  try {
    // 发起单个请求（高德支持 types 用 | 分隔）
    const response = await axios.get(url, {
      params: {
        key: AMAP_KEY,
        location: location,
        types: types, // 直接传 "050000|060000"
        radius: radiusInMeters,
        sortrule: "weight",
        page_size: pageSize,
        show_fields: "business,photos",
      },
      timeout: 8000, // 8秒超时
    });

    const data = response.data;

    // 4. 检查高德返回的状态
    if (data && data.status === "1") {
      const pois = data.pois || [];
      console.log(`✅ [MapUtils] 搜索成功: 找到 ${pois.length} 个结果`);

      // 5. 格式化数据
      return pois.map((poi) => {
        const business = poi.business || {};
        return {
          id: poi.id,
          name: poi.name,
          address: poi.address,
          location: poi.location,
          // 评分和花费很多时候是空的，给个默认值
          rating:
            business.rating && business.rating.length > 0
              ? business.rating
              : "暂无",
          perCapitaCost:
            business.cost && business.cost.length > 0 ? business.cost : "暂无",
          tel: business.tel || "暂无",
          photoUrl:
            poi.photos && poi.photos.length > 0 ? poi.photos[0].url : null,
          type: poi.type || "",
          adname: poi.adname || "",
        };
      });
    } else {
      // 6. 关键：如果失败，打印高德给的错误信息
      // 常见错误：10001(Key无效), 10003(超限), 10004(IP白名单)
      console.error(
        `❌ [MapUtils] 高德API报错: Code [${data?.infocode}] Info [${data?.info}]`
      );
      // 打印完整的返回以便排查
      console.log("完整返回:", JSON.stringify(data));
      return [];
    }
  } catch (error) {
    console.error(`❌ [MapUtils] 请求异常: ${error.message}`);
    if (error.response) {
      console.error("响应数据:", error.response.data);
    }
    return [];
  }
};

/**
 * [工具型] 检查某个位置是否靠近地铁站
 * @param {string} location - 坐标字符串 "经度,纬度"
 * @returns {Promise<boolean>} - 是否靠近地铁站（500米内）
 */
const isNearSubway = async (location) => {
  const apiKey = process.env.AMAP_API_KEY;
  const url = "https://restapi.amap.com/v5/place/around";

  try {
    const response = await axios.get(url, {
      params: {
        key: apiKey,
        location: location,
        types: "150500", // 地铁站
        radius: 500,
        page_size: 1,
      },
      timeout: 5000,
    });

    if (response.data && response.data.status === "1") {
      const pois = response.data.pois || [];
      return pois.length > 0;
    }
    return false;
  } catch (error) {
    console.warn("检查地铁站失败:", error.message);
    return false;
  }
};

/**
 * [工具型] 计算所有人到某个地点的公交时间
 * @param {Array} allLocations - 所有人的位置数组 [{latitude, longitude, name}]
 * @param {Object} poi - 目的地 POI 对象，包含 location 字段
 * @param {string} city - 城市名称
 * @returns {Promise<Object>} - 包含 times 数组的对象
 */
const calculateAllPersonsTravelTime = async (allLocations, poi, city) => {
  const times = [];

  for (const loc of allLocations) {
    try {
      const origin = `${loc.longitude},${loc.latitude}`;
      const destination = poi.location;

      const transitInfo = await getTransitInfo(origin, destination);

      if (transitInfo && transitInfo.duration) {
        // 从 "xx 分钟" 格式提取数字
        const minutes = parseInt(transitInfo.duration);
        times.push(isNaN(minutes) ? null : minutes);
      } else {
        times.push(null);
      }
    } catch (error) {
      console.warn(
        `计算从 ${loc.name} 到 ${poi.name} 的时间失败:`,
        error.message
      );
      times.push(null);
    }
  }

  return { times };
};

module.exports = {
  getCityByCoords,
  getPlaceDetailsByNameAndAddress,
  getComprehensiveTravelInfo,
  searchNearbyPlaces,
  isNearSubway,
  calculateAllPersonsTravelTime,
};
