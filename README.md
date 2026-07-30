# Cloudrop

Cloudrop 是一个无账户的临时实时共享站点。每个已验证页面都会获得一个 8 位配对 Key 和二维码；两个页面完成独占配对后，可以实时发送文本、链接和文件。

## 已实现的行为

- 每个页面同一时间只能配对一个对端，已配对 Key 会立即失效。
- 扫描二维码或手动输入 Key 均可发起配对。
- 文本与 HTTP(S) 链接通过 WebSocket 实时转发，只保存在当前页面内存中。
- 文件通过 WebRTC DataChannel 以 16 KB 分块实时发送，不先上传 Django。
- WebRTC 优先直连，失败时使用 Coturn 中继；TURN 也不保存文件。
- 任意一方关闭、刷新或主动断开后，原配对立即失效，存活页面生成新 Key。
- 访问密码通过环境变量注入，授权 Cookie 为 HttpOnly 浏览器会话 Cookie。
- 北京时间同一天累计 10 次密码错误，或同一 IP 连续 5 次错误，会持久化锁定整台服务器。
- 锁定后已有 WebSocket 会被关闭；普通重启不能解锁。修改部署密码并重启后自动解锁并清空失败计数。

## 架构

- `cloudrop/`、`transfer/`：Django 5.2、Channels、认证安全状态、配对事务与 WebRTC 信令。
- `client/`：React 19、Ant Design 6、Vite、TypeScript。
- PostgreSQL：持久化安全状态和短生命周期配对记录。
- Redis：Django Channels 跨进程消息通道，使用独立逻辑数据库和 `cloudrop` 键前缀。
- Caddy：HTTPS、静态前端、`/api` 与 `/ws` 反向代理。
- Coturn：无法建立浏览器直连时实时中继 WebRTC 流量。

## 正式部署

部署目标是 Linux Docker 主机。PostgreSQL 和 Redis 使用现有实例，本项目的 Compose 不会创建或替换它们。

### 1. 准备 PostgreSQL

在现有 PostgreSQL 中创建 Cloudrop 专用角色和数据库。角色只需要 Cloudrop 数据库的权限，不要授予其他项目数据库权限。

```sql
CREATE ROLE cloudrop LOGIN PASSWORD '使用独立强密码';
CREATE DATABASE cloudrop OWNER cloudrop;
```

### 2. 准备 Redis

选择一个未被其他项目使用的逻辑数据库编号，例如 `/5`。如果现有 Redis 是 Cluster 模式，只能使用数据库 0，此时仍保留 `CLOUDROP_REDIS_PREFIX=cloudrop` 隔离键名。

### 3. 配置环境

```bash
cp .env.example .env
```

至少替换以下内容：

- `CLOUDROP_DOMAIN`、`DJANGO_ALLOWED_HOSTS`、`DJANGO_CSRF_TRUSTED_ORIGINS`
- `DJANGO_SECRET_KEY`、`CLOUDROP_ACCESS_PASSWORD`
- `DATABASE_URL`、`REDIS_URL`
- `CLOUDROP_TURN_SECRET`、`CLOUDROP_TURN_REALM`、`CLOUDROP_TURN_EXTERNAL_IP`
- `CLOUDROP_TURN_URLS`

URL 中的数据库或 Redis 密码如果包含 `@`、`:`、`/` 等字符，必须进行百分号编码。

### 4. DNS 和防火墙

- 将 `CLOUDROP_DOMAIN` 解析到服务器公网 IP。
- 开放 TCP `80`、`443`、`3478`。
- 开放 UDP `443`、`3478`、`49160-49200`。
- 如果服务器位于 NAT 后，`CLOUDROP_TURN_EXTERNAL_IP` 填公网 IP，并把上述 TURN 端口转发到服务器。

### 5. 启动

```bash
docker compose up -d --build
```

应用容器启动时会自动执行数据库迁移和过期配对记录清理。健康检查地址为 `/api/health`。

如果 PostgreSQL 或 Redis 只在另一个 Docker 网络中暴露、没有宿主机端口，请通过 Compose override 将 `app` 加入该外部网络，并把连接地址改为对应服务名。

## 锁定与运维解锁

锁定状态在 PostgreSQL 中持久化。解除锁定的唯一正常流程：

1. 修改 `.env` 中的 `CLOUDROP_ACCESS_PASSWORD`。
2. 重建或重启 `app` 与 `gateway`：`docker compose up -d --force-recreate app gateway`。
3. 服务端检测密码指纹变化后，原子地解除锁定、增加安全代次并清空失败计数。

只重启但不修改密码不会解除锁定。数据库中只保存基于 Django 密钥生成的密码指纹，不保存明文访问密码。

## 本地开发

后端默认使用 SQLite；实时连接仍需要 Redis，也可以用测试模式的进程内通道进行单进程开发。

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
$env:DJANGO_DEBUG='true'
$env:CLOUDROP_ACCESS_PASSWORD='local-password'
$env:CLOUDROP_TESTING='true'
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe -m uvicorn cloudrop.asgi:application --port 8000
```

另一个终端：

```powershell
Set-Location client
npm install
npm run dev
```

打开 `http://127.0.0.1:5173`。若要测试两个页面，请使用两个独立浏览器会话或普通窗口与隐私窗口。

## 验证

```powershell
$env:CLOUDROP_TESTING='true'
.\.venv\Scripts\python.exe -m pytest -q
Set-Location client
npm run build
```

### 浏览器注意事项

- 支持 Origin Private File System 的浏览器会先流式写入浏览器私有文件系统，接收完成后显示“保存文件”按钮，不会把 1 GB 文件聚合到 JavaScript 内存。
- 极少数不支持 OPFS、但支持 File System Access API 的桌面浏览器会在接收前让用户选择保存位置。
- 点击“保存文件”后，OPFS 临时副本会延迟一分钟删除；异常遗留的 Cloudrop 临时文件会在后续打开页面时清理，最长保留 24 小时。
- 1 GB 是协议上限；iOS 是否能完成接收还取决于设备剩余空间和浏览器对当前站点的存储配额。
- 双方必须同时在线；发送方离线后无法重新下载文件。
