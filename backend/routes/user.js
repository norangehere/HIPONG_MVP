const express = require("express");
const router = express.Router();
const db = require("../config/db"); // 引入全局 db
const { userSessions } = require("../config/global"); // 引入全局会话管理

// 获取收藏方案
router.post("/favorite", async (req, res) => {
  const { planId } = req.body;
  // 从认证头获取当前登录用户
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.replace("Bearer ", "")
    : "";
  const sessionData = token ? userSessions.get(token) : null;
  const userId = sessionData?.openid
    ? await (async () => {
        try {
          const [rows] = await db.query(
            "SELECT id FROM users WHERE openid = ? LIMIT 1",
            [sessionData.openid]
          );
          return rows && rows[0] ? rows[0].id : null;
        } catch (e) {
          return null;
        }
      })()
    : null;

  if (!planId) {
    return res.status(400).json({ success: false, message: "缺少 planId" });
  }

  if (!token || !sessionData || !userId) {
    return res
      .status(401)
      .json({ success: false, message: "未认证或会话失效" });
  }

  try {
    const sql = "INSERT IGNORE INTO `favorites` (userId, planId) VALUES (?, ?)";
    const [result] = await db.query(sql, [userId, planId]);

    if (result.affectedRows > 0) {
      console.log(`用户 ${userId} 成功收藏方案 ${planId}`);
      res.status(201).json({ success: true, message: "方案收藏成功" });
    } else {
      console.log(`用户 ${userId} 尝试收藏已存在的方案 ${planId}`);
      res.status(200).json({ success: true, message: "您已收藏过此方案" });
    }
  } catch (error) {
    // 6. 异常处理
    console.error("收藏方案时数据库出错:", error);
    res.status(500).json({ success: false, message: "服务器错误，收藏失败" });
  }
});

// 获取收藏地点
router.post("/favorite-place", async (req, res) => {
  const {
    placeId,
    placeName,
    placeAddress,
    placeType,
    placeRating,
    placeCost,
    placePhotoUrl,
    placeLocation,
    action,
  } = req.body;
  // 从认证头获取当前登录用户
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.replace("Bearer ", "")
    : "";
  const sessionData = token ? userSessions.get(token) : null;
  const userId = sessionData?.openid
    ? await (async () => {
        try {
          const [rows] = await db.query(
            "SELECT id FROM users WHERE openid = ? LIMIT 1",
            [sessionData.openid]
          );
          return rows && rows[0] ? rows[0].id : null;
        } catch (e) {
          return null;
        }
      })()
    : null;

  // 数据校验
  if (!placeId || !placeName || !action) {
    return res.status(400).json({ success: false, message: "缺少必要参数" });
  }

  if (!token || !sessionData || !userId) {
    return res
      .status(401)
      .json({ success: false, message: "未认证或会话失效" });
  }

  try {
    if (action === "add") {
      // 收藏地点
      const sql = `INSERT INTO favorite_places 
                        (userId, placeId, placeName, placeAddress, placeType, placeRating, 
                         placeCost, placePhotoUrl, placeLocation) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      const [result] = await db.query(sql, [
        userId,
        placeId,
        placeName,
        placeAddress,
        placeType,
        placeRating,
        placeCost,
        placePhotoUrl,
        placeLocation,
      ]);

      if (result.affectedRows > 0) {
        console.log(`用户 ${userId} 成功收藏地点 ${placeName} (${placeId})`);
        res.status(201).json({ success: true, message: "地点收藏成功" });
      } else {
        res.status(200).json({ success: true, message: "您已收藏过此地" });
      }
    } else if (action === "remove") {
      // 取消收藏地点
      const sql =
        "DELETE FROM favorite_places WHERE userId = ? AND placeId = ?";
      const [result] = await db.query(sql, [userId, placeId]);

      if (result.affectedRows > 0) {
        console.log(
          `用户 ${userId} 成功取消收藏地点 ${placeName} (${placeId})`
        );
        res.status(200).json({ success: true, message: "取消收藏成功" });
      } else {
        res.status(200).json({ success: true, message: "该地点未被收藏" });
      }
    } else {
      res.status(400).json({ success: false, message: "无效的操作类型" });
    }
  } catch (error) {
    console.error("收藏地点时数据库出错:", error);
    res.status(500).json({ success: false, message: "服务器错误，操作失败" });
  }
});

// profile

/**
 * API 接口: /api/personality-analysis
 * 功能: 保存或更新个人特质分析结果
 */
router.post("/personality-analysis", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.replace("Bearer ", "")
    : "";
  const {
    nickname,
    avatar,
    customNickname,
    gender,
    preferredGender,
    ageRange,
    preferredAgeRange,
    city,
    selectedLocation,
    regionValue,
    crossDistrict,
    interests,
    otherInterests,
    groupTypes,
    personality,
    customPersonality,
    preferredPersonality,
    preferredCustomPersonality,
    relationshipType,
    notifications,
    userId: bodyUserId,
  } = req.body;

  // 数据校验
  if (!nickname) {
    return res
      .status(400)
      .json({ success: false, message: "缺少必要参数：用户昵称" });
  }

  // 解析 userId：优先从鉴权token推导，其次接受 body.userId
  let userId = 1;
  try {
    if (token && typeof userSessions !== "undefined") {
      const sessionData = userSessions.get(token);
      if (sessionData && sessionData.openid) {
        try {
          const [rows] = await db.query(
            "SELECT id FROM users WHERE openid = ? LIMIT 1",
            [sessionData.openid]
          );
          if (rows && rows.length > 0 && rows[0].id) {
            userId = rows[0].id;
          }
        } catch (e) {
          console.warn(
            "根据token解析userId失败，回退到body/默认:",
            e?.message || e
          );
        }
      }
    }
    if ((!userId || userId === 1) && bodyUserId) {
      userId = bodyUserId;
    }
  } catch (e) {
    console.warn("解析userId异常，使用默认1:", e?.message || e);
    userId = 1;
  }
  console.log("[POST /api/personality-analysis] 解析得到 userId =", userId);

  try {
    // 先检查是否存在该用户的记录
    const checkSql = "SELECT id FROM personality_analysis WHERE user_id = ?";
    const [existingRecords] = await db.query(checkSql, [userId]);

    let result;
    let isUpdate = false;

    if (existingRecords.length > 0) {
      // 存在记录，执行更新
      const updateSql = `
                UPDATE personality_analysis SET
                    nickname = ?, avatar = ?, custom_nickname = ?,
                    gender = ?, preferred_gender = ?, age_range = ?, preferred_age_range = ?,
                    city = ?, selected_location = ?, region_value = ?, cross_district = ?,
                    interests = ?, other_interests = ?, group_types = ?,
                    personality = ?, custom_personality = ?, preferred_personality = ?, preferred_custom_personality = ?,
                    relationship_type = ?, notifications = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            `;

      const updateParams = [
        nickname || "",
        avatar || "",
        customNickname || "",
        gender || "",
        preferredGender || "",
        ageRange || "",
        preferredAgeRange || "",
        city || "",
        selectedLocation || "",
        regionValue ? JSON.stringify(regionValue) : null,
        crossDistrict || "",
        interests ? JSON.stringify(interests) : null,
        otherInterests || "",
        groupTypes ? JSON.stringify(groupTypes) : null,
        personality ? JSON.stringify(personality) : null,
        customPersonality || "",
        preferredPersonality ? JSON.stringify(preferredPersonality) : null,
        preferredCustomPersonality || "",
        relationshipType || "",
        notifications ? JSON.stringify(notifications) : null,
        userId,
      ];

      [result] = await db.query(updateSql, updateParams);
      isUpdate = true;
      console.log(
        `用户 ${userId} 的个人特质分析已更新，影响行数: ${result.affectedRows}`
      );
    } else {
      // 不存在记录，执行插入
      const insertSql = `
                INSERT INTO personality_analysis (
                    user_id, nickname, avatar, custom_nickname,
                    gender, preferred_gender, age_range, preferred_age_range,
                    city, selected_location, region_value, cross_district,
                    interests, other_interests, group_types,
                    personality, custom_personality, preferred_personality, preferred_custom_personality,
                    relationship_type, notifications
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

      const insertParams = [
        userId,
        nickname || "",
        avatar || "",
        customNickname || "",
        gender || "",
        preferredGender || "",
        ageRange || "",
        preferredAgeRange || "",
        city || "",
        selectedLocation || "",
        regionValue ? JSON.stringify(regionValue) : null,
        crossDistrict === "cross_district",
        interests ? JSON.stringify(interests) : null,
        otherInterests || "",
        groupTypes ? JSON.stringify(groupTypes) : null,
        personality ? JSON.stringify(personality) : null,
        customPersonality || "",
        preferredPersonality ? JSON.stringify(preferredPersonality) : null,
        preferredCustomPersonality || "",
        relationshipType || "",
        notifications ? JSON.stringify(notifications) : null,
      ];

      [result] = await db.query(insertSql, insertParams);
      console.log(
        `用户 ${userId} 的个人特质分析已创建，ID: ${result.insertId}`
      );
    }

    const responseData = {
      success: true,
      message: isUpdate ? "个人特质分析更新成功" : "个人特质分析保存成功",
      data: {
        id: isUpdate ? existingRecords[0].id : result.insertId,
        userId: userId,
        isUpdate: isUpdate,
        success: true,
      },
    };

    console.log("准备返回的响应数据:", JSON.stringify(responseData, null, 2));
    res.status(200).json(responseData);
  } catch (error) {
    console.error("保存/更新个人特质分析失败:", error);
    res.status(500).json({
      success: false,
      message: "服务器错误，操作失败",
    });
  }
});

/**
 * API 接口: /api/personality-analysis/:userId
 * 功能: 获取指定用户的个人特质分析结果
 */
router.get("/personality-analysis/:userId", async (req, res) => {
  const { userId } = req.params;
  console.log(
    "[GET /api/personality-analysis/:userId] 收到请求 userId =",
    userId
  );

  if (!userId) {
    return res.status(400).json({ success: false, message: "缺少用户ID" });
  }

  try {
    const sql = `
            SELECT * FROM personality_analysis 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT 1
        `;

    const [results] = await db.query(sql, [userId]);
    console.log(
      `[GET /api/personality-analysis/${userId}] 查询结果条数:`,
      results.length
    );

    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        message: "未找到该用户的个人特质分析",
      });
    }

    const analysis = results[0];

    // 解析JSON字段
    const parsedAnalysis = {
      ...analysis,
      regionValue: analysis.region_value
        ? (() => {
            try {
              return JSON.parse(analysis.region_value);
            } catch (e) {
              return analysis.region_value;
            }
          })()
        : null,
      interests: analysis.interests
        ? (() => {
            try {
              return JSON.parse(analysis.interests);
            } catch (e) {
              return [];
            }
          })()
        : [],
      groupTypes: analysis.group_types
        ? (() => {
            try {
              return JSON.parse(analysis.group_types);
            } catch (e) {
              return [];
            }
          })()
        : [],
      personality: analysis.personality
        ? (() => {
            try {
              return JSON.parse(analysis.personality);
            } catch (e) {
              return [];
            }
          })()
        : [],
      preferredPersonality: analysis.preferred_personality
        ? (() => {
            try {
              return JSON.parse(analysis.preferred_personality);
            } catch (e) {
              return [];
            }
          })()
        : [],
      notifications: analysis.notifications
        ? (() => {
            try {
              return JSON.parse(analysis.notifications);
            } catch (e) {
              return [];
            }
          })()
        : [],
    };

    // 删除原始字段，避免重复
    delete parsedAnalysis.region_value;
    delete parsedAnalysis.group_types;
    delete parsedAnalysis.preferred_personality;
    console.log("准备返回的响应数据:", JSON.stringify(parsedAnalysis, null, 2));
    res.json({
      success: true,
      data: parsedAnalysis,
    });
  } catch (error) {
    console.error(`获取用户 ${userId} 的个人特质分析失败:`, error);
    res.status(500).json({
      success: false,
      message: "服务器错误，获取失败",
    });
  }
});

/**
 * API 接口: /api/personality-analysis/:userId/history
 * 功能: 获取指定用户的所有个人特质分析历史记录
 */
router.get("/personality-analysis/:userId/history", async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ success: false, message: "缺少用户ID" });
  }

  try {
    const sql = `
            SELECT id, nickname, custom_nickname, created_at, updated_at
            FROM personality_analysis 
            WHERE user_id = ? 
            ORDER BY created_at DESC
        `;

    const [results] = await db.query(sql, [userId]);

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error(`获取用户 ${userId} 的个人特质分析历史失败:`, error);
    res.status(500).json({
      success: false,
      message: "服务器错误，获取失败",
    });
  }
});

/**
 * API 接口: /api/all-users
 * 功能: 获取所有用户的个人特质分析数据（用于社交匹配）
 */
router.get("/all-users", async (req, res) => {
  try {
    const sql = `
            SELECT 
                user_id,
                nickname,
                custom_nickname,
                gender,
                preferred_gender,
                age_range,
                preferred_age_range,
                city,
                cross_district,
                interests,
                group_types,
                personality,
                preferred_personality,
                relationship_type,
                notifications,
                avatar
            FROM personality_analysis 
            ORDER BY created_at DESC
        `;

    const [results] = await db.query(sql);

    // 解析多选/数组字段（健壮兼容JSON、分隔符字符串等）
    const parsedResults = results.map((user) => {
      const parsedUser = { ...user };

      const parseFlexibleArray = (value) => {
        if (Array.isArray(value)) return value;
        if (value === null || value === undefined) return [];
        if (typeof value === "string") {
          const trimmed = value.trim();
          if (!trimmed) return [];
          try {
            const obj = JSON.parse(trimmed);
            if (Array.isArray(obj)) return obj;
          } catch (_) {}
          return trimmed
            .split(/[，,;；|\u3001\s]+/)
            .map((s) => s.trim())
            .filter(Boolean);
        }
        return [];
      };

      // 输出驼峰字段供前端直接使用，同时保留原始蛇形字段以兼容
      parsedUser.interests = parseFlexibleArray(user.interests);
      parsedUser.groupTypes = parseFlexibleArray(user.group_types);
      parsedUser.personality = parseFlexibleArray(user.personality);
      parsedUser.preferredPersonality = parseFlexibleArray(
        user.preferred_personality
      );
      parsedUser.notifications = parseFlexibleArray(user.notifications);

      parsedUser.customNickname = user.custom_nickname;
      parsedUser.preferredGender = user.preferred_gender;
      parsedUser.ageRange = user.age_range;
      parsedUser.preferredAgeRange = user.preferred_age_range;
      parsedUser.crossDistrict = user.cross_district;
      parsedUser.relationshipType = user.relationship_type;

      return parsedUser;
    });
    res.json({
      success: true,
      data: parsedResults,
    });
  } catch (error) {
    console.error("获取所有用户数据失败:", error);
    res.status(500).json({
      success: false,
      message: "服务器错误，获取失败",
    });
  }
});

module.exports = router;
