// 后端配置文件
require('dotenv').config();

module.exports = {
  // 服务器端口
  PORT: process.env.PORT || 3000,
  
  // 数据库配置
  DB: {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hipong_db',
    port: process.env.DB_PORT || 3306
  },
  
  // API密钥配置
  API_KEYS: {
    DEEPSEEK: process.env.DEEPSEEK_API_KEY || '',
    AMAP: process.env.AMAP_API_KEY || '',
    DOUYIN: {
      APPID: process.env.DOUYIN_APPID || 'tt4ff0394dd0ff264101',
      SECRET: process.env.DOUYIN_SECRET || 'de00326672642cd5cb49ef29a6259fd3308dfcfe',
      SANDBOX: process.env.DOUYIN_SANDBOX === 'true' || true
    }
  },
  
  // CORS配置
  CORS: {
    origin: '*', // 生产环境建议设置具体的域名
    credentials: true
  }
};