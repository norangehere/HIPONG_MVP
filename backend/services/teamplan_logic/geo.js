const axios = require("axios");

const { calculatePlaceScore } = require("../score"); // 引入打分逻辑

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
  const apiKey = process.env.AMAP_API_KEY;
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
  const apiKey = process.env.AMAP_API_KEY;
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
  const apiKey = process.env.AMAP_API_KEY;
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
  const apiKey = process.env.AMAP_API_KEY;
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

const AMAP_KEY = process.env.AMAP_API_KEY;

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

/**
 * [搜索] 根据关键词列表搜索地点 (已增加强距离限制)
 * @param {Array<string>} keywords - 关键词数组
 * @param {string} locationCoords - "经度,纬度"
 * @param {number} radiusInMeters - 搜索半径 (米)
 */
const searchPlacesByKeywords = async (
  keywords,
  locationCoords,
  radiusInMeters
) => {
  if (!keywords || keywords.length === 0) return [];

  const apiKey = process.env.AMAP_API_KEY;
  const keywordUrl = "https://restapi.amap.com/v5/place/text";
  const combinedKeyword = keywords.join(" ");

  console.log(
    `[Geo] 正在执行关键字搜索: "${combinedKeyword}" (限制半径: ${radiusInMeters}米)`
  );

  // --- 内部辅助：计算两点距离 (Haversine 公式) ---
  const getDistance = (c1, c2) => {
    if (!c1 || !c2) return 99999999;
    const [lon1, lat1] = c1.split(",").map(Number);
    const [lon2, lat2] = c2.split(",").map(Number);
    const R = 6371000; // 地球半径 (米)
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // 返回米
  };

  try {
    const resp = await axios.get(keywordUrl, {
      params: {
        key: apiKey,
        keywords: combinedKeyword,
        location: locationCoords,
        radius: radiusInMeters,

        // 🔒 锁 1: 强制按距离排序 (默认是 weight，容易飘)
        sortrule: "distance",

        // 🔒 锁 2: 强制限制在当前城市内 (防止飘到外省)
        city_limit: "true",

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
      // 🔒 锁 3: 代码层面的硬过滤 (Hard Filter)
      // 允许 1.2 倍的误差缓冲 (防止高德把边缘的好店切掉)，超过的一律扔掉
      const maxAllowedDist = radiusInMeters * 1.2;

      const validPois = resp.data.pois.filter((poi) => {
        const dist = getDistance(locationCoords, poi.location);
        if (dist > maxAllowedDist) {
          console.warn(
            `[Geo] 剔除超距地点: ${poi.name} (距离 ${Math.round(
              dist
            )}米 > 限额 ${Math.round(maxAllowedDist)}米)`
          );
          return false;
        }
        return true;
      });

      if (validPois.length === 0) {
        console.log(
          `[Geo] 关键词 "${combinedKeyword}" 搜索结果经距离过滤后为空。`
        );
        return [];
      }

      return validPois.map((poi) => {
        const business = poi.business || {};
        return {
          id: poi.id,
          name: poi.name,
          address: poi.address,
          location: poi.location,
          rating: business.rating || "暂无",
          perCapitaCost: business.cost || "暂无",
          tel: business.tel || "暂无",
          photoUrl:
            poi.photos && poi.photos.length > 0 ? poi.photos[0].url : null,
          type: poi.type || "",
          business_area: poi.business_area || "",
          cityname: poi.cityname || "",
          adname: poi.adname || "",
          alias: poi.alias || "",
        };
      });
    }
  } catch (e) {
    console.error(`[Geo] 关键字搜索失败: ${combinedKeyword}`, e.message);
  }

  return [];
};

// services/plan_logic/geo.js

// 1. 获取位置的行政代码 (adcode)
const getAdcode = async (location) => {
  // location 格式: "120.123,30.456"
  const url = `https://restapi.amap.com/v3/geocode/regeo?key=${process.env.AMAP_API_KEY}&location=${location}&extensions=base`;
  try {
    const res = await axios.get(url);
    if (res.data.status === "1") {
      return res.data.regeocode.addressComponent.adcode;
    }
  } catch (e) {
    console.error("[Geo] 获取adcode失败:", e.message);
  }
  return null;
};

// 2. 获取天气预报
const getWeatherForecast = async (adcode) => {
  if (!adcode) return null;
  // extensions=all 表示获取预报，base 表示获取实况
  const url = `https://restapi.amap.com/v3/weather/weatherInfo?key=${process.env.AMAP_API_KEY}&city=${adcode}&extensions=all`;

  try {
    const res = await axios.get(url);
    if (
      res.data.status === "1" &&
      res.data.forecasts &&
      res.data.forecasts.length > 0
    ) {
      // 返回 casts 数组，里面包含未来几天的数据
      return res.data.forecasts[0].casts;
    }
  } catch (e) {
    console.error("[Geo] 获取天气失败:", e.message);
  }
  return null;
};

module.exports = {
  getComprehensiveTravelInfo,
  searchNearbyPlacesMultiCenter,
  searchPlacesByKeywords,
  getAdcode,
  getWeatherForecast,
};
