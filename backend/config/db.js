// 定义数据库并导出
const mysql = require("mysql2");

// 尝试创建数据库连接池，如果失败则使用虚拟数据库
let db;
try {
  db = mysql
    .createPool({
      host: process.env.DB_HOST || "127.0.0.1",
      user: process.env.DB_USER || "root",
      port: process.env.DB_PORT || "3306",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "hipong_db",
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 5000, // 5秒连接超时
    })
    .promise();

  // 测试数据库连接
  db.getConnection()
    .then((conn) => {
      conn.release();
      console.log("✅ 数据库连接成功");
    })
    .catch((err) => {
      console.log("❌ 数据库连接失败，将使用内存模式:", err.message);
      db = null;
    });
} catch (error) {
  console.log("❌ 数据库初始化失败，将使用内存模式:", error.message);
  db = null;
}

// 内存数据库模拟
const inMemoryDb = {
  // 模拟查询函数
  query: async (sql, params) => {
    console.log(`[内存数据库模拟] 执行SQL: ${sql}`);

    // 模拟一些基本的查询
    if (sql.includes("SELECT") && sql.includes("users")) {
      // 模拟返回空用户数据
      return [[], []];
    } else if (sql.includes("INSERT") && sql.includes("users")) {
      // 模拟插入操作
      return [{ insertId: Date.now() }, []];
    } else if (sql.includes("UPDATE") && sql.includes("users")) {
      // 模拟更新操作
      return [{ affectedRows: 1 }, []];
    } else if (sql.includes("SELECT") && sql.includes("personality_analysis")) {
      // 模拟返回空的个性分析数据
      return [[], []];
    } else if (sql.includes("INSERT") && sql.includes("personality_analysis")) {
      // 模拟插入个性分析数据
      return [{ insertId: Date.now() }, []];
    } else if (sql.includes("favorites") || sql.includes("favorite_places")) {
      // 模拟收藏相关的操作
      return sql.includes("INSERT") || sql.includes("UPDATE")
        ? [{ affectedRows: 1 }, []]
        : [[], []];
    }

    // 默认返回空结果
    return [[], []];
  },
};

// 导出数据库实例（优先使用真实数据库，否则使用内存模拟）
module.exports = db || inMemoryDb;
