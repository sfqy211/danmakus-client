# danmakus-client（自建中心定制版）

本项目 fork 自 [danmakus-client](https://github.com/81f9db2ec2/danmakus-client)，
改造为 **danmu_vue 中心的专用弹幕采集端**：只负责采集与上报，不再依赖上游
`ukamnads.icu` / `api.danmakus.com` 服务。

## 与上游的差异

| 项 | 上游 | 本分支 |
| --- | --- | --- |
| 后端 API 地址 | 写死 `ukamnads.icu` 等三处 | 读 `DANMAKUS_API_ORIGINS` / `VITE_API_BASE`，默认 `https://api.ovodm.top` |
| 账号体系 | 上游账号中心（OAuth 登录） | 中心后台「采集节点」签发的 Token |
| 房间来源 | 上游账号的录制列表 | 中心 `/api/v2/account/recording` + WS 房间分配 |
| 登录入口 | `danmakus.com/account` | 中心后台 `/#/admin` |
| 反代向导 | 固定指向 ukamnads.icu | 按当前生效节点动态生成 |

## 快速开始

### 1. 拿 Token

在中心后台 →「采集节点」→ 创建节点 → 复制 Token（**只显示一次**）。

### 2. 跑采集内核

```bash
cd danmakus-core
bun install
bun run build
bun run start -- --token "<节点 Token>" --capacity-override 5
```

默认就连 `https://api.ovodm.top`，无需再填地址。要连其它中心：

```bash
DANMAKUS_API_ORIGINS=http://localhost:3001 bun run start -- --token "<Token>"
```

### 3. 桌面端

```bash
bun install
bun run dev          # 前端
bun run tauri dev    # 带 Tauri 壳
```

首次打开会要求填 Token，填完自动从中心拉取"该录哪些房间"。

## 目录说明

- `src/`: Vue 3 前端界面与业务逻辑
- `src/services/apiNodes.ts`: 后端节点切换 / 测速 / 反代向导
- `danmakus-core/`: 采集核心，可独立作为库 / CLI / Docker 镜像
- `danmakus-core/src/core/BackendApiFallback.ts`: **后端地址解析入口**
- `src-tauri/`: Tauri 2 壳层

## 采集流程

```
中心下发 extractionRules（字段提取规则）
   ↓
客户端连 B 站直播间，按规则提取字段
   ↓
msgpack + zstd 压缩，走 /api/v2/core-runtime/ws 上报
   ↓
中心按 (主播uid, 开播时间) 归并场次，按 message_id 去重
```

字段提取规则由服务端控制，所以**采集端不需要跟着解析逻辑改**。
详见 `../danmu_vue/docs/分布式采集接入说明.md`。

## 环境变量

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `DANMAKUS_API_ORIGINS` | 后端地址，逗号分隔可配多个 | `https://api.ovodm.top` |
| `VITE_API_BASE` | 前端构建期注入的后端地址 | 同上 |
| `DANMAKUS_TOKEN` | 采集节点 Token | - |
| `DANMAKUS_CLIENT_ID` | 固定设备标识 | 自动生成并持久化 |
| `DANMAKUS_DATA_DIR` | SQLite 队列目录父路径 | `.danmakus` |
| `DANMAKUS_COOKIECLOUD_*` | CookieCloud 配置（可选） | - |

## 开发命令

```bash
bun install
bun run dev        # 前端开发
bun run build      # 生产构建（含类型检查）
bun run tauri dev  # Tauri 开发
```
