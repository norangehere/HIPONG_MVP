const express = require("express");
const router = express.Router();
const { recommendationStatus } = require("../config/global");
const generateRecId = () =>
  `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const {
  refineRecommendationsAsync,
  generateRecommendationsAsync,
} = require("../services/recommend");

// 1. 优化推荐接口（多轮对话）
// 【重要】前端只需传递 originalQuery、currentResults、refinementRequest
// 交通时间、预算、好友位置等信息都从 originalQuery 中自动继承
router.post("/refineRecommendations", async (req, res) => {
  console.log("【异步】收到重新生成目的地的请求...");

  const {
    originalQuery,      // 包含第一轮的所有设置（偏好、位置、预算、好友等）
    currentResults,     // 当前推荐的地点列表
    refinementRequest,  // 用户新输入的要求
  } = req.body;

  if (!originalQuery || !currentResults || !refinementRequest) {
    return res.status(400).json({ success: false, message: "缺少上下文参数" });
  }

  const recId = generateRecId();

  recommendationStatus.set(recId, {
    ready: false,
    success: false,
    data: null,
    error: null,
  });

  res.json({
    success: true,
    recId: recId,
    message: "重新生成任务已开始，请轮询查询结果",
  });

  // 只传递三个核心参数，其他设置由服务层从 originalQuery 中读取
  refineRecommendationsAsync(recId, {
    originalQuery,
    currentResults,
    refinementRequest,
  });
});

// 2. 初始推荐接口（智能公平性排序）
router.post("/getInitialPoisByPrefs", async (req, res) => {
  console.log("【新流程-异步】收到前端的第一步请求：启动目的地推荐...");

  // 【修改】新增接收 partners、maxTransitTime、maxBudget、minBudget 参数
  const { preferenceText, origin, types, partners, maxTransitTime, maxBudget, minBudget } = req.body;

  if (!preferenceText || !origin || !origin.latitude) {
    return res
      .status(400)
      .json({ success: false, message: "缺少偏好或出发点信息" });
  }

  const recId = generateRecId();

  recommendationStatus.set(recId, {
    ready: false,
    success: false,
    data: null,
    error: null,
  });

  res.json({
    success: true,
    recId: recId,
    message: "目的地推荐任务已开始，请轮询查询结果",
  });

  // 【修改】传递新参数：同行者列表、最大公交时间限制、预算范围
  generateRecommendationsAsync(recId, {
    preferenceText,
    origin,
    types,
    partners: partners || [],
    maxTransitTime: maxTransitTime || 60,
    maxBudget: maxBudget || null,      // 【新增】最大人均预算
    minBudget: minBudget || null,      // 【新增】最小人均预算
  });
});

// 3. 查询状态接口（轮询用）
router.get("/recommendation-status/:recId", (req, res) => {
  const { recId } = req.params;

  if (!recId) {
    return res.status(400).json({ success: false, message: "缺少推荐任务ID" });
  }

  const status = recommendationStatus.get(recId);

  if (!status) {
    return res
      .status(404)
      .json({ success: false, message: "推荐任务ID不存在" });
  }

  res.json({
    success: true,
    taskStatus: status,
  });
});

module.exports = router;
