const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();
const config = require("./config/config");
const app = express();

// 动态导入数据库，避免启动失败
let db;
try {
  db = require("./config/db"); // 引入数据库
  console.log("✅ 数据库模块加载成功");
} catch (error) {
  console.log("⚠️ 数据库模块加载失败，将使用内存模式:", error.message);
  // 创建一个模拟的数据库对象
  db = {
    query: async (sql, params) => {
      console.log(`[内存模式] 模拟执行SQL: ${sql}`);
      if (sql && typeof sql === "string") {
        if (sql.includes("SELECT") && sql.includes("users")) {
          return [[], []];
        } else if (sql.includes("INSERT") && sql.includes("users")) {
          return [{ insertId: Date.now() }, []];
        } else if (sql.includes("UPDATE") && sql.includes("users")) {
          return [{ affectedRows: 1 }, []];
        } else if (
          sql.includes("SELECT") &&
          sql.includes("personality_analysis")
        ) {
          return [[], []];
        } else if (
          sql.includes("INSERT") &&
          sql.includes("personality_analysis")
        ) {
          return [{ insertId: Date.now() }, []];
        } else if (
          sql.includes("favorites") ||
          sql.includes("favorite_places")
        ) {
          return sql.includes("INSERT") || sql.includes("UPDATE")
            ? [{ affectedRows: 1 }, []]
            : [[], []];
        }
      }
      // 默认返回空结果
      return [[], []];
    },
  };
}

const {
  userSessions,
  recommendationStatus,
  generationStatus,
} = require("./config/global");
const PORT = config.PORT || 8080;
app.use(
  cors({
    origin: true, // 允许所有源
    credentials: true,
  })
);
app.use(express.json());

// 获取客户端IP
app.get("/api/ip", (req, res) => {
  try {
    const xff = req.headers["x-forwarded-for"];
    const forwardedIp = Array.isArray(xff)
      ? xff[0]
      : typeof xff === "string"
      ? xff.split(",")[0].trim()
      : "";
    const ip =
      forwardedIp ||
      (req.connection && req.connection.remoteAddress) ||
      (req.socket && req.socket.remoteAddress) ||
      req.ip ||
      "";
    return res.json({ success: true, data: { ip } });
  } catch (e) {
    console.error("获取客户端IP失败:", e);
    return res.status(500).json({ success: false, message: "获取IP失败" });
  }
});

// 清理过期状态
setInterval(() => {
  const now = Date.now();
  // 清理【方案生成】任务
  for (const [planId, status] of generationStatus.entries()) {
    if (status.ready && now - parseInt(planId.split("_")[1]) > 3600000) {
      // 1小时
      generationStatus.delete(planId);
    }
  }

  // 【新增】清理【目的地推荐】任务
  for (const [recId, status] of recommendationStatus.entries()) {
    if (status.ready && now - parseInt(recId.split("_")[1]) > 600000) {
      // 10分钟
      recommendationStatus.delete(recId);
    }
  }
}, 300000); // 每5分钟清理一次

// 推荐地点相关api
const recommendRoutes = require("./routes/recommend");
app.use("/", recommendRoutes);
// 团建计划相关api
const planRoutes = require("./routes/teamplan");
app.use("/api", planRoutes);
// 用户/特征相关api
const userRoutes = require("./routes/user");
app.use("/api", userRoutes);

// ==================== 抖音登录相关API ====================

const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);

// --- 启动服务器 ---
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 服务器已启动，正在监听 http://0.0.0.0:${PORT}`);
});
