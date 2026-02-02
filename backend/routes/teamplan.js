const express = require("express");
const router = express.Router();
const db = require("../config/db"); // 引入刚才的第一步
const { generationStatus, userSessions } = require("../config/global"); // 引入刚才的第二步
const generatePlanId = () =>
  `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const { generatePlanAsync } = require("../services/teamplan"); // 引入刚才的 AI 大脑

// 团建方案生成接口
router.post("/plan-teambuilding", async (req, res) => {
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
    personalNeeds,
    forceNew,
  } = req.body;
  console.log(`收到团建规划请求: ${name}`);
  // 解析发起者 userId，优先 token 映射
  let creatorId = 1;
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.replace("Bearer ", "")
      : "";
    if (token && typeof userSessions !== "undefined") {
      const sessionData = userSessions.get(token);
      if (sessionData && sessionData.openid) {
        try {
          const [rows] = await db.query(
            "SELECT id FROM users WHERE openid = ? LIMIT 1",
            [sessionData.openid]
          );
          if (rows && rows.length > 0 && rows[0].id) {
            creatorId = rows[0].id;
          }
        } catch (e) {
          console.warn(
            "根据token解析creatorId失败，回退body/默认:",
            e?.message || e
          );
        }
      }
    }
    if (creatorId === 1 && req.body && req.body.userId) {
      const n = parseInt(req.body.userId, 10);
      if (Number.isFinite(n) && n > 0) creatorId = n;
    }
  } catch (e) {
    console.warn("解析creatorId异常，使用默认1:", e?.message || e);
    creatorId = 1;
  }

  const safeType = type || "";
  const safeTeamType = teamType || "";
  const safeCustomTypes = customTypes || "";
  const mergedOtherNotes = otherNotes || personalNeeds || "";

  if (!people || !budget || !timeRange || !startLocationCoords || !distance) {
    return res
      .status(400)
      .json({ success: false, message: "缺少必要的匹配条件" });
  }

  // 生成唯一的方案ID
  const planId = generatePlanId();

  // 初始化状态
  generationStatus.set(planId, {
    ready: false,
    success: false,
    data: null,
    error: null,
  });

  // 立即返回方案ID给前端
  res.json({
    success: true,
    planId: planId,
    message: "方案生成已开始，请轮询查询结果",
  });

  // 异步执行方案生成
  generatePlanAsync(planId, {
    name,
    people,
    budget,
    type: safeType,
    teamType: safeTeamType,
    customTypes: safeCustomTypes,
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
    otherNotes: mergedOtherNotes,
    forceNew: !!forceNew,
    creatorId,
  });
});

// 轮询查询接口
router.get("/plan-status/:planId", (req, res) => {
  const { planId } = req.params;

  if (!planId) {
    return res.status(400).json({ success: false, message: "缺少方案ID" });
  }

  const status = generationStatus.get(planId);

  if (!status) {
    return res.status(404).json({ success: false, message: "方案ID不存在" });
  }

  res.json({
    success: true,
    ready: status.ready,
    planSuccess: status.success,
    data: status.data,
    error: status.error,
  });
});

router.post("/save-plan", async (req, res) => {
  const { planName, playDate, startTime, endTime, recommendations } = req.body;

  if (!planName || !recommendations) {
    return res.status(400).json({ error: "缺少必要的参数" });
  }

  const connection = await db.getConnection(); // 从连接池获取一个连接

  try {
    // 开启数据库事务，确保数据一致性
    await connection.beginTransaction();

    // 1. 将计划的总体信息插入到 `zujuplans` 表
    const [planResult] = await connection.query(
      "INSERT INTO zujuplans (plan_name, play_date, start_time, end_time) VALUES ( ?, ?, ?, ?)",
      [planName, playDate, startTime, endTime]
    );

    const newPlanId = planResult.insertId; // 获取刚刚插入的计划的 ID

    // 2. 遍历推荐的地点列表，将每个地点插入到 `plan_locations` 表
    for (const location of recommendations) {
      await connection.query(
        "INSERT INTO plan_locations (plan_id, location_id, location_name, location_address, price, drive_time, transit_time) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          newPlanId,
          location.id,
          location.name,
          location.address || "", // 确保 recommendations 对象中有 address 字段
          String(location.price || "N/A"), // 确保转为字符串
          String(location.drive || "N/A"),
          String(location.transit || "N/A"),
        ]
      );
    }

    // 3. 如果所有操作都成功，提交事务
    await connection.commit();

    res.status(200).json({ message: "行程计划保存成功", planId: newPlanId });
  } catch (error) {
    // 如果任何一步出错，回滚所有操作
    await connection.rollback();
    console.error("保存行程计划失败:", error);
    res.status(500).json({
      error: "服务器内部错误，保存失败",
      details: error.message,
      sqlMessage: error.sqlMessage,
    });
  } finally {
    // 无论成功还是失败，最后都要释放数据库连接
    connection.release();
  }
});

// 获取用户创建和收藏的方案
router.get("/user/:userId/plans", async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ success: false, message: "缺少用户ID" });
  }

  try {
    const createdSql =
      "SELECT id, title, details, createdAt FROM `plans` WHERE `creatorId` = ?";
    const [createdPlans] = await db.query(createdSql, [userId]);

    // 查询用户收藏的方案, 增加 p.createdAt 字段
    const favoritedSql = `
            SELECT p.id, p.title, p.details, p.createdAt 
            FROM \`plans\` AS p
            JOIN \`favorites\` AS f ON p.id = f.planId
            WHERE f.userId = ?
        `;
    const [favoritedPlans] = await db.query(favoritedSql, [userId]);

    console.log(`成功获取用户 ${userId} 的方案列表`);
    res.json({
      success: true,
      data: {
        createdPlans,
        favoritedPlans,
      },
    });
  } catch (error) {
    console.error(`获取用户 ${userId} 的方案列表时出错:`, error);
    res.status(500).json({ success: false, message: "服务器内部错误" });
  }
});

router.get("/my-plans", async (req, res) => {
  // 1. 从前端的请求中获取 userId (通过查询参数)

  console.log(`正在为用户查询其发起的组局...`);

  try {
    // 2. 编写 SQL 查询语句
    // - 使用 LEFT JOIN 以确保即使某个计划下没有地点，计划本身也能被查询出来
    // - 使用 GROUP_CONCAT 将所有地点名称合并成一个字段
    const sql = `
        SELECT
          p.id,
          p.plan_name,
          p.play_date,
          p.start_time,
          p.end_time,
          GROUP_CONCAT(pl.location_name SEPARATOR ', ') AS locations
        FROM
          zujuplans AS p
        LEFT JOIN
          plan_locations AS pl ON p.id = pl.plan_id
        GROUP BY
          p.id
        ORDER BY
          p.created_at DESC;
      `;

    // 3. 执行查询
    const [plans] = await db.query(sql);

    console.log(`成功查询到 ${plans.length} 条组局计划。`);

    // 4. 将查询结果返回给前端
    res.status(200).json(plans);
  } catch (error) {
    console.error("查询组局列表失败:", error);
    res.status(500).json({ error: "服务器内部错误，查询失败" });
  }
});

/**
 * API 接口: /api/all-plans
 * 功能: 获取所有团建方案数据（用于社交匹配）
 */
router.get("/all-plans", async (req, res) => {
  try {
    const sql = `
            SELECT 
                id,
                title,
                details,
                creatorId,
                createdAt
            FROM plans 
            ORDER BY createdAt DESC
        `;

    const [results] = await db.query(sql);

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error("获取所有团建方案数据失败:", error);
    res.status(500).json({
      success: false,
      message: "服务器错误，获取失败",
    });
  }
});

// 获取方案（用于首页展示）
router.get("/plans/by-ids", async (req, res) => {
  try {
    const idsParam = req.query.ids;
    if (!idsParam) {
      return res.status(400).json({ success: false, message: "缺少ids参数" });
    }

    const ids = idsParam
      .split(",")
      .map((id) => parseInt(id.trim(), 10))
      .filter((n) => Number.isFinite(n));
    if (ids.length === 0) {
      return res.status(400).json({ success: false, message: "ids参数无效" });
    }

    const placeholders = ids.map(() => "?").join(",");
    // 使用 FIELD 保持传入顺序
    const sql = `SELECT id, title FROM plans WHERE id IN (${placeholders}) ORDER BY FIELD(id, ${placeholders})`;
    const params = [...ids, ...ids];
    const [results] = await db.query(sql, params);

    res.json({ success: true, data: results });
  } catch (error) {
    console.error("按ID获取方案失败:", error);
    res.status(500).json({ success: false, message: "服务器错误，获取失败" });
  }
});

// 获取单个方案详情
router.get("/plans/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: "无效的方案ID" });
    }
    const sql = "SELECT id, title, details FROM plans WHERE id = ? LIMIT 1";
    const [rows] = await db.query(sql, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "方案不存在" });
    }
    const plan = rows[0];
    let detailsParsed = null;
    try {
      detailsParsed =
        typeof plan.details === "string"
          ? JSON.parse(plan.details)
          : plan.details;
    } catch (e) {
      detailsParsed = plan.details;
    }
    res.json({
      success: true,
      data: { id: plan.id, title: plan.title, details: detailsParsed },
    });
  } catch (error) {
    console.error("获取方案详情失败:", error);
    res.status(500).json({ success: false, message: "服务器错误，获取失败" });
  }
});

module.exports = router;
