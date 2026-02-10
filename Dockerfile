# 使用Node.js官方镜像
FROM node:24.13.0-alpine

# 设置工作目录
WORKDIR /app

# 复制package文件
COPY backend/package*.json ./

# 安装依赖
RUN npm install

# 复制应用代码
COPY backend/ ./

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["npm", "start"]