// 存储用户登录状态的 Map
const userSessions = new Map();
// 存储地点推荐的 Map
const recommendationStatus = new Map();
// 存储方案生成的 Map
const generationStatus = new Map();

module.exports = {
    userSessions,
    recommendationStatus,
    generationStatus
};