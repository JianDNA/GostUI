# Gost 管理系统部署指南

## 📋 系统要求

### 基础环境
- **Node.js**: 16.x 或更高版本
- **操作系统**: Windows 10+, Ubuntu 18.04+, Debian 10+, CentOS 7+
- **内存**: 最低 2GB，推荐 4GB+
- **存储**: 最低 10GB 可用空间

### 可选组件
- **Redis**: 用于用户状态缓存 (推荐)
- **InfluxDB**: 用于流量统计和监控 (推荐)
- **Nginx**: 用于反向代理 (可选)

## 🚀 快速部署

### 1. 克隆项目
```bash
git clone <repository-url>
cd gost-manager
```

### 2. 安装依赖
```bash
# 后端依赖
cd backend
npm install

# 前端依赖
cd ../frontend
npm install
```

### 3. 配置环境
```bash
# 复制环境配置文件
cd backend
cp .env.example .env

# 编辑配置文件
nano .env
```

### 4. 初始化数据库
```bash
# 运行数据库迁移
npm run migrate-traffic

# 检查环境
npm run check-env
```

### 5. 安装 Gost 二进制文件
```bash
# 自动安装适合当前平台的 Gost
npm run install-gost
```

### 6. 启动服务
```bash
# 启动后端
npm start

# 启动前端 (新终端)
cd ../frontend
npm run serve
```

## 🔧 详细配置

### 环境变量配置

#### 必需配置
```bash
# 基础配置
PORT=3000
NODE_ENV=production
JWT_SECRET=your-super-secret-jwt-key

# 数据库
DATABASE_PATH=./database/gost-manager.db
```

#### Redis 配置 (推荐)
```bash
# Redis 用于用户状态缓存，提高性能
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
```

#### InfluxDB 配置 (推荐)
```bash
# InfluxDB 用于流量统计和监控
INFLUX_URL=http://localhost:8086
INFLUX_TOKEN=your-influx-token
INFLUX_ORG=gost-manager
INFLUX_BUCKET=traffic-stats
```

### 数据库迁移

#### 添加流量管理字段
```bash
# 为现有用户表添加流量相关字段
npm run migrate-traffic
```

#### 回滚迁移 (如果需要)
```bash
# 回滚流量字段迁移
npm run rollback-traffic
```

## 🐳 Docker 部署

### 使用 Docker Compose (推荐)
```yaml
# docker-compose.yml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  influxdb:
    image: influxdb:2.7
    ports:
      - "8086:8086"
    environment:
      - DOCKER_INFLUXDB_INIT_MODE=setup
      - DOCKER_INFLUXDB_INIT_USERNAME=admin
      - DOCKER_INFLUXDB_INIT_PASSWORD=password123
      - DOCKER_INFLUXDB_INIT_ORG=gost-manager
      - DOCKER_INFLUXDB_INIT_BUCKET=traffic-stats
    volumes:
      - influx_data:/var/lib/influxdb2

  gost-manager:
    build: .
    ports:
      - "3000:3000"
    environment:
      - REDIS_HOST=redis
      - INFLUX_URL=http://influxdb:8086
      - INFLUX_TOKEN=your-influx-token
      - INFLUX_ORG=gost-manager
      - INFLUX_BUCKET=traffic-stats
    depends_on:
      - redis
      - influxdb
    volumes:
      - ./config:/app/config
      - ./database:/app/database

volumes:
  redis_data:
  influx_data:
```

### 启动 Docker 服务
```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f gost-manager
```

## 🔒 生产环境配置

### 安全配置
```bash
# 生产环境必须配置
NODE_ENV=production
JWT_SECRET=your-very-strong-jwt-secret-key

# 启用安全功能
ENABLE_RATE_LIMITING=true
RATE_LIMIT_REQUESTS_PER_MINUTE=60

# IP 白名单 (可选)
ENABLE_IP_WHITELIST=true
IP_WHITELIST=192.168.1.0/24,10.0.0.0/8
```

### Nginx 反向代理
```nginx
# /etc/nginx/sites-available/gost-manager
server {
    listen 80;
    server_name your-domain.com;

    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 配置
    ssl_certificate /path/to/your/cert.pem;
    ssl_certificate_key /path/to/your/key.pem;

    # 后端 API
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # 前端静态文件
    location / {
        root /path/to/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

### 系统服务配置
```ini
# /etc/systemd/system/gost-manager.service
[Unit]
Description=Gost Manager Service
After=network.target

[Service]
Type=simple
User=gost-manager
WorkingDirectory=/opt/gost-manager/backend
ExecStart=/usr/bin/node app.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### 启用系统服务
```bash
# 重新加载 systemd
sudo systemctl daemon-reload

# 启用服务
sudo systemctl enable gost-manager

# 启动服务
sudo systemctl start gost-manager

# 查看状态
sudo systemctl status gost-manager
```

## 📊 监控和维护

### 日志管理
```bash
# 查看应用日志
tail -f logs/app.log

# 查看系统服务日志
sudo journalctl -u gost-manager -f

# 日志轮转配置
sudo nano /etc/logrotate.d/gost-manager
```

### 性能监控
```bash
# 检查服务状态
curl http://localhost:3000/api/health

# 查看 GOST 插件状态
curl http://localhost:3000/api/gost/status

# 监控系统资源
htop
```

### 数据备份
```bash
# 备份数据库
cp database/gost-manager.db backups/gost-manager-$(date +%Y%m%d).db

# 备份配置文件
tar -czf backups/config-$(date +%Y%m%d).tar.gz config/

# 自动备份脚本
echo "0 2 * * * /opt/gost-manager/scripts/backup.sh" | crontab -
```

## 🔧 故障排除

### 常见问题

#### 1. Redis 连接失败
```bash
# 检查 Redis 服务状态
sudo systemctl status redis

# 测试 Redis 连接
redis-cli ping

# 检查配置
grep REDIS_ .env
```

#### 2. InfluxDB 连接失败
```bash
# 检查 InfluxDB 服务状态
sudo systemctl status influxdb

# 测试 InfluxDB 连接
curl http://localhost:8086/health

# 检查令牌配置
influx auth list
```

#### 3. Gost 二进制文件问题
```bash
# 重新安装 Gost
npm run install-gost

# 检查文件权限
ls -la bin/gost*

# 手动设置权限
chmod +x bin/gost
```

#### 4. 端口冲突
```bash
# 检查端口占用
netstat -tulpn | grep :3000

# 修改端口配置
echo "PORT=3001" >> .env
```

### 调试模式
```bash
# 启用调试日志
NODE_ENV=development npm start

# 启用详细日志
LOG_LEVEL=debug npm start

# 检查环境配置
npm run check-env
```

## 📈 性能优化

### 生产环境优化
```bash
# 启用集群模式
ENABLE_CLUSTER=true
WORKER_PROCESSES=0  # 自动检测 CPU 核心数

# 优化数据库
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=10000;

# 启用缓存
CACHE_SYNC_INTERVAL=300000  # 5分钟同步一次
```

### 监控指标
- CPU 使用率
- 内存使用率
- 磁盘 I/O
- 网络流量
- 数据库连接数
- Redis 连接数
- InfluxDB 写入速率

## 🆙 升级指南

### 版本升级步骤
1. 备份数据库和配置文件
2. 停止服务
3. 更新代码
4. 安装新依赖
5. 运行数据库迁移
6. 重启服务
7. 验证功能

```bash
# 升级脚本示例
#!/bin/bash
echo "开始升级 Gost 管理系统..."

# 备份
cp database/gost-manager.db backups/
tar -czf backups/config-backup.tar.gz config/

# 停止服务
sudo systemctl stop gost-manager

# 更新代码
git pull origin main

# 安装依赖
npm install

# 运行迁移
npm run migrate-traffic

# 重启服务
sudo systemctl start gost-manager

echo "升级完成！"
```

## 📞 技术支持

如果遇到问题，请检查：
1. 系统日志
2. 应用日志
3. 环境配置
4. 网络连接
5. 服务状态

更多帮助请参考项目文档或提交 Issue。
