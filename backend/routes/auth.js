const express = require('express');
const router = express.Router();
const axios = require('axios'); // 你的代码里肯定用了axios请求抖音，记得引入！
const db = require('../config/db'); // 引入刚才的第一步
const { userSessions } = require('../config/global'); // 引入刚才的第二步

// ==========================================
// 1. 辅助函数定义
// ==========================================

/**
 * 检查抖音开放平台配置
 */
function checkDouyinConfig() {
    const requiredConfigs = ['DOUYIN_APPID', 'DOUYIN_SECRET'];
    const missingConfigs = [];

    for (const config of requiredConfigs) {
        if (!process.env[config]) {
            missingConfigs.push(config);
        }
    }

    if (missingConfigs.length > 0) {
        console.error('缺少必要的抖音开放平台配置:', missingConfigs);
        console.error('请在 .env 文件中设置以下环境变量:');
        missingConfigs.forEach(config => {
            console.error(`  ${config}=your_${config.toLowerCase()}`);
        });
        return false;
    }

    console.log('抖音开放平台配置检查通过:', {
        appid: process.env.DOUYIN_APPID,
        secret: process.env.DOUYIN_SECRET ? '已设置' : '未设置',
        sandbox: process.env.DOUYIN_SANDBOX
    });

    return true;
}

/**
 * 调用抖音开放平台code2session接口
 * @param {string} code - 前端传来的code
 * @returns {Promise<Object>} 返回session_key, openid, unionid
 */
async function code2session(code) {
    const appid = process.env.DOUYIN_APPID;
    const secret = process.env.DOUYIN_SECRET;
    const isSandbox = process.env.DOUYIN_SANDBOX === 'true';

    const baseURL = isSandbox ? 'https://open-sandbox.douyin.com' : 'https://developer.toutiao.com';

    try {
        console.log('调用抖音code2session接口:', {
            baseURL,
            appid,
            secret: secret ? '已设置' : '未设置',
            code: code ? '已设置' : '未设置'
        });

        const response = await axios.post(`${baseURL}/api/apps/v2/jscode2session`, {
            appid,
            secret,
            code
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log('抖音code2session响应:', response.data);

        if (response.data && response.data.err_no === 0) {
            return {
                session_key: response.data.data.session_key,
                openid: response.data.data.openid,
                unionid: response.data.data.unionid
            };
        } else {
            console.error('抖音code2session返回错误:', response.data);
            throw new Error(response.data?.err_tips || `code2session失败: ${response.data?.err_no}`);
        }
    } catch (error) {
        console.error('调用抖音code2session失败:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });
        throw error;
    }
}

/**
 * 生成用户token
 * @param {string} openid - 用户openid
 * @returns {string} 生成的token
 */
function generateToken(openid) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `token_${openid}_${timestamp}_${random}`;
}

/**
 * 字符串脱敏处理
 * @param {string} str - 原始字符串
 * @returns {string} 脱敏后的字符串
 */
function desensitization(str) {
    if (!str || str.length < 4) return str;
    const len = str.length;
    const mid = Math.floor(len / 2);
    return `${str.substring(0, mid - 1)}****${str.substring(mid + 2)}`;
}

/**
 * 调用抖音开放平台anonymousCode2session接口
 * @param {string} anonymousCode - 前端传来的anonymousCode
 * @returns {Promise<Object>} 返回anonymous_openid
 */
async function anonymousCode2session(anonymousCode) {
    const appid = process.env.DOUYIN_APPID;
    const secret = process.env.DOUYIN_SECRET;
    const isSandbox = process.env.DOUYIN_SANDBOX === 'true';

    const baseURL = isSandbox ? 'https://open-sandbox.douyin.com' : 'https://developer.toutiao.com';

    try {
        console.log('调用抖音anonymousCode2session接口:', {
            baseURL,
            appid,
            secret: secret ? '已设置' : '未设置',
            anonymousCode: anonymousCode ? '已设置' : '未设置'
        });

        const response = await axios.post(`${baseURL}/api/apps/v2/jscode2session`, {
            appid,
            secret,
            anonymousCode
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log('抖音anonymousCode2session响应:', response.data);

        if (response.data && response.data.err_no === 0) {
            return {
                anonymous_openid: response.data.data.anonymous_openid
            };
        } else {
            console.error('抖音anonymousCode2session返回错误:', response.data);
            throw new Error(response.data?.err_tips || `anonymousCode2session失败: ${response.data?.err_no}`);
        }
    } catch (error) {
        console.error('调用抖音anonymousCode2session失败:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });
        throw error;
    }
}

// ==========================================
// 2. 路由定义
// ==========================================

/**
 * API 接口: /api/auth/anonymous-login
 * 功能: 抖音小程序匿名登录接口
 */
router.post('/anonymous-login', async (req, res) => {
    const { anonymousCode } = req.body;

    if (!anonymousCode) {
        return res.status(400).json({
            success: false,
            message: '缺少anonymousCode参数'
        });
    }

    try {
        console.log('收到匿名登录请求，anonymousCode:', anonymousCode);

        // 检查抖音开放平台配置
        if (!checkDouyinConfig()) {
            return res.status(500).json({
                success: false,
                message: '服务器配置错误，请联系管理员'
            });
        }

        // 调用抖音开放平台anonymousCode2session接口
        const sessionData = await anonymousCode2session(anonymousCode);
        const { anonymous_openid } = sessionData;

        console.log('anonymousCode2session成功:', { anonymous_openid });

        // 生成用户token
        const token = generateToken(anonymous_openid);

        // 存储用户会话信息
        userSessions.set(token, {
            openid: anonymous_openid,
            unionid: null,
            token,
            loginTime: Date.now(),
            isAnonymous: true
        });

        // 检查用户是否已存在
        const checkUserSql = 'SELECT * FROM users WHERE openid = ?';
        const [existingUsers] = await db.query(checkUserSql, [anonymous_openid]);

        let userInfo = null;

        if (existingUsers.length > 0) {
            // 用户已存在，更新登录时间
            try {
                const updateSql = 'UPDATE users SET last_login_time = CURRENT_TIMESTAMP WHERE openid = ?';
                await db.query(updateSql, [anonymous_openid]);
                console.log('匿名用户已存在，更新登录时间:', anonymous_openid);
            } catch (updateError) {
                if (updateError.code === 'ER_BAD_FIELD_ERROR') {
                    console.log('表结构不包含last_login_time字段，跳过更新时间');
                } else {
                    throw updateError;
                }
            }
            userInfo = existingUsers[0];
        } else {
            // 新匿名用户，创建用户记录
            try {
                // 尝试完整的INSERT语句
                const insertSql = `
                    INSERT INTO users (openid, unionid, created_at, last_login_time, is_anonymous) 
                    VALUES (?, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
                `;
                const [result] = await db.query(insertSql, [anonymous_openid]);

                userInfo = {
                    id: result.insertId,
                    openid: anonymous_openid,
                    unionid: null,
                    created_at: new Date(),
                    last_login_time: new Date(),
                    is_anonymous: true
                };
                console.log('新匿名用户注册成功（完整字段）:', anonymous_openid);
            } catch (insertError) {
                if (insertError.code === 'ER_BAD_FIELD_ERROR') {
                    // 表结构不完整，使用简化版本
                    console.log('检测到简化表结构，使用兼容模式');
                    const simpleInsertSql = `
                        INSERT INTO users (openid, username, avatar, createdAt) 
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    `;
                    const [result] = await db.query(simpleInsertSql, [anonymous_openid, `匿名用户${anonymous_openid.slice(-6)}`, 'https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/Group%2013.png/avatar_me.jpg']);

                    userInfo = {
                        id: result.insertId,
                        openid: anonymous_openid,
                        unionid: null,
                        created_at: new Date(),
                        last_login_time: new Date(),
                        is_anonymous: true
                    };
                    console.log('新匿名用户注册成功（兼容模式）:', anonymous_openid);
                } else {
                    throw insertError;
                }
            }
        }

        res.json({
            success: true,
            message: '匿名登录成功',
            data: {
                token,
                anonymousOpenid: desensitization(anonymous_openid),
                userInfo: {
                    id: userInfo.id,
                    openid: desensitization(anonymous_openid),
                    unionid: null,
                    created_at: userInfo.created_at,
                    last_login_time: userInfo.last_login_time,
                    is_anonymous: true
                }
            }
        });

    } catch (error) {
        console.error('匿名登录失败:', error);
        res.status(500).json({
            success: false,
            message: '匿名登录失败: ' + error.message
        });
    }
});

/**
 * API 接口: /api/auth/login
 * 功能: 抖音小程序登录接口
 */
router.post('/login', async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({
            success: false,
            message: '缺少code参数'
        });
    }

    try {
        console.log('收到登录请求，code:', code);

        // 检查抖音开放平台配置
        if (!checkDouyinConfig()) {
            return res.status(500).json({
                success: false,
                message: '服务器配置错误，请联系管理员'
            });
        }

        // 调用抖音开放平台code2session接口
        const sessionData = await code2session(code);
        const { session_key, openid, unionid } = sessionData;

        console.log('code2session成功:', { openid, unionid });

        // 生成用户token
        const token = generateToken(openid);

        // 存储用户会话信息
        userSessions.set(token, {
            session_key,
            openid,
            unionid,
            token,
            loginTime: Date.now()
        });

        // 检查用户是否已存在
        const checkUserSql = 'SELECT * FROM users WHERE openid = ?';
        const [existingUsers] = await db.query(checkUserSql, [openid]);

        let userInfo = null;

        if (existingUsers.length > 0) {
            // 用户已存在，更新登录时间
            // 检查表结构，如果存在last_login_time字段则更新，否则跳过
            try {
                const updateSql = 'UPDATE users SET last_login_time = CURRENT_TIMESTAMP WHERE openid = ?';
                await db.query(updateSql, [openid]);
                console.log('用户已存在，更新登录时间:', openid);
            } catch (updateError) {
                if (updateError.code === 'ER_BAD_FIELD_ERROR') {
                    console.log('表结构不包含last_login_time字段，跳过更新时间');
                } else {
                    throw updateError;
                }
            }
            userInfo = existingUsers[0];
        } else {
            // 新用户，创建用户记录
            // 检查表结构，动态构建INSERT语句
            try {
                // 尝试完整的INSERT语句
                const insertSql = `
                    INSERT INTO users (openid, unionid, session_key, created_at, last_login_time) 
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `;
                const [result] = await db.query(insertSql, [openid, unionid, session_key]);

                userInfo = {
                    id: result.insertId,
                    openid,
                    unionid,
                    created_at: new Date(),
                    last_login_time: new Date()
                };
                console.log('新用户注册成功（完整字段）:', openid);
            } catch (insertError) {
                if (insertError.code === 'ER_BAD_FIELD_ERROR') {
                    // 表结构不完整，使用简化版本
                    console.log('检测到简化表结构，使用兼容模式');
                    const simpleInsertSql = `
                        INSERT INTO users (openid, username, avatar, createdAt) 
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    `;
                    const [result] = await db.query(simpleInsertSql, [openid, `用户${openid.slice(-6)}`, 'https://pixe1ran9e.oss-cn-hangzhou.aliyuncs.com/avatar_me.jpg']);

                    userInfo = {
                        id: result.insertId,
                        openid,
                        unionid: null,
                        created_at: new Date(),
                        last_login_time: new Date()
                    };
                    console.log('新用户注册成功（兼容模式）:', openid);
                } else {
                    throw insertError;
                }
            }
        }

        res.json({
            success: true,
            message: '登录成功',
            data: {
                token,
                openid: desensitization(openid),
                unionid: unionid ? desensitization(unionid) : null,
                userInfo: {
                    id: userInfo.id,
                    openid: desensitization(openid),
                    unionid: unionid ? desensitization(unionid) : null,
                    created_at: userInfo.created_at,
                    last_login_time: userInfo.last_login_time
                }
            }
        });

    } catch (error) {
        console.error('登录失败:', error);
        res.status(500).json({
            success: false,
            message: '登录失败: ' + error.message
        });
    }
});

/**
 * API 接口: /api/auth/logout
 * 功能: 用户登出接口
 */
router.post('/logout', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({
            success: false,
            message: '缺少token参数'
        });
    }

    try {
        // 从内存中移除用户会话
        userSessions.delete(token);

        res.json({
            success: true,
            message: '登出成功'
        });

    } catch (error) {
        console.error('登出失败:', error);
        res.status(500).json({
            success: false,
            message: '登出失败'
        });
    }
});

/**
 * API 接口: /api/auth/update-profile
 * 功能: 更新当前登录用户的昵称/头像
 * 认证: Header Authorization: Bearer <token>
 * Body: { nickname?: string, avatar?: string }
 */
router.post('/update-profile', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : '';

    if (!token) {
        return res.status(401).json({ success: false, message: '缺少认证token' });
    }

    const { nickname, avatar } = req.body || {};
    if (!nickname && !avatar) {
        return res.status(400).json({ success: false, message: '缺少需要更新的字段' });
    }

    try {
        const sessionData = userSessions.get(token);
        if (!sessionData) {
            return res.status(401).json({ success: false, message: 'token无效或已过期' });
        }

        const openid = sessionData.openid;

        // 优先更新标准字段（nickname, avatar, updated_at）
        try {
            const updateSql = 'UPDATE users SET nickname = COALESCE(?, nickname), avatar = COALESCE(?, avatar), updated_at = CURRENT_TIMESTAMP WHERE openid = ?';
            await db.query(updateSql, [nickname || null, avatar || null, openid]);
        } catch (err) {
            if (err.code === 'ER_BAD_FIELD_ERROR') {
                // 兼容简化表结构：username + avatar，无 updated_at
                const altSql = 'UPDATE users SET username = COALESCE(?, username), avatar = COALESCE(?, avatar) WHERE openid = ?';
                await db.query(altSql, [nickname || null, avatar || null, openid]);
            } else {
                throw err;
            }
        }

        // 读取最新用户信息（兼容不同表字段）
        const [rows] = await db.query('SELECT * FROM users WHERE openid = ?', [openid]);
        if (!rows || rows.length === 0) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        const user = rows[0];

        // 字段兼容：优先 nickname，否则使用 username；头像优先 avatar
        const result = {
            id: user.id,
            openid: desensitization(user.openid),
            unionid: user.unionid ? desensitization(user.unionid) : null,
            nickname: user.nickname || user.username || '',
            avatar: user.avatar || '',
            created_at: user.created_at || user.createdAt || null,
            last_login_time: user.last_login_time || null
        };

        return res.json({ success: true, message: '资料更新成功', data: result });
    } catch (error) {
        console.error('更新用户资料失败:', error);
        return res.status(500).json({ success: false, message: '更新失败: ' + error.message });
    }
});

/**
 * API 接口: /api/auth/check
 * 功能: 检查用户登录状态
 */
router.post('/check', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({
            success: false,
            message: '缺少token参数'
        });
    }

    try {
        const sessionData = userSessions.get(token);

        if (!sessionData) {
            return res.json({
                success: false,
                message: 'token无效或已过期'
            });
        }

        // 检查token是否过期（24小时）
        const now = Date.now();
        const tokenAge = now - sessionData.loginTime;
        const maxAge = 24 * 60 * 60 * 1000; // 24小时

        if (tokenAge > maxAge) {
            userSessions.delete(token);
            return res.json({
                success: false,
                message: 'token已过期'
            });
        }

        res.json({
            success: true,
            message: 'token有效',
            data: {
                openid: desensitization(sessionData.openid),
                unionid: sessionData.unionid ? desensitization(sessionData.unionid) : null
            }
        });

    } catch (error) {
        console.error('检查登录状态失败:', error);
        res.status(500).json({
            success: false,
            message: '检查登录状态失败'
        });
    }
});

/**
 * API 接口: /api/auth/userinfo
 * 功能: 获取用户详细信息
 */
router.get('/userinfo', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({
            success: false,
            message: '缺少认证token'
        });
    }

    try {
        const sessionData = userSessions.get(token);

        if (!sessionData) {
            return res.status(401).json({
                success: false,
                message: 'token无效或已过期'
            });
        }

        // 从数据库获取用户详细信息
        const sql = 'SELECT * FROM users WHERE openid = ?';
        const [users] = await db.query(sql, [sessionData.openid]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: '用户不存在'
            });
        }

        const user = users[0];

        res.json({
            success: true,
            message: '获取用户信息成功',
            data: {
                id: user.id,
                openid: desensitization(user.openid),
                unionid: user.unionid ? desensitization(user.unionid) : null,
                nickname: user.nickname || user.username || '',
                avatar: user.avatar || '',
                created_at: user.created_at,
                last_login_time: user.last_login_time
            }
        });

    } catch (error) {
        console.error('获取用户信息失败:', error);
        res.status(500).json({
            success: false,
            message: '获取用户信息失败'
        });
    }
});

module.exports = router;