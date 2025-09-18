# Web3 套利者日程控制台

一个专为个人套利/做市工作流设计的日常规划与复盘面板：

- ✅ 今日、明日、未来任务一站式管理，可快速标记完成、顺延或转化为策略灵感
- ✅ 灵感池 / 快速收件箱，用于临时想法、风险提示和协作事项的收集
- ✅ 每日利润记录与 7 天、30 天滚动收益统计，便于复盘策略表现
- ✅ 每日复盘模块，梳理亮点、经验与阻碍，打造自己的套利 playbook
- ✅ 所有数据保存在本地 `data/store.json` 中，可选 AES-256-GCM 加密，保护隐私

> **技术栈**：Node.js 原生 HTTP 服务（无三方依赖） + 原生 HTML/CSS/JS 单页应用。

## 快速开始

```bash
# 1. 安装依赖（本项目无第三方依赖，可跳过）
# 2. 根据 .env.example 创建环境变量文件
cp .env.example .env
# 编辑 .env，至少修改 APP_SECRET 为强密码

# 3. 启动服务
npm start
# 默认监听 http://localhost:3000
```

启动后访问 `http://localhost:3000` 即可开始记录。所有数据默认保存在本地 `data/store.json` 中，建议在 `.env`
中配置强随机的 `APP_SECRET` 以启用 AES-256-GCM 加密。

## 环境变量说明

| 变量 | 作用 | 默认 |
| --- | --- | --- |
| `PORT` | 服务监听端口 | `3000` |
| `APP_SECRET` | 加密本地数据文件的主密码，建议务必设置 | *无* |
| `DATA_FILE` | 自定义数据文件名称（可选） | `store.json` |

## 功能概览

### 任务规划
- 按今日 / 明日 / 逾期 / 未来分栏显示
- 支持优先级、分类、标签、预估时长、备注
- 一键完成、标记推进、顺延到明日或删除
- 可快速转化为策略灵感条目

### 策略灵感库
- 记录策略标题、标签、影响力、信心度和细节
- 一键转化为任务或归档
- 按更新时间排序，方便定期梳理

### 利润追踪
- 保存日期、金额、币种、策略名称、链/交易所、交易哈希和备注
- 自动统计今日、近 7 日、近 30 日收益
- 支持随时删除记录

### 快速收件箱
- 捕捉即时想法或待办，稍后再分类
- 可直接转化为任务/想法或删除

### 每日复盘
- 记录亮点、经验、阻碍、情绪状态
- 保留最近 14 天记录，帮助持续优化节奏

## 隐私与安全

- 本地数据保存于 `data/store.json`
- 设置 `APP_SECRET` 时，数据将使用 AES-256-GCM 加密
- 无第三方追踪或外部请求，可直接部署在离线/内网环境

## API 摘要

所有接口均可直接在本地调用：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/dashboard` | 获取仪表盘数据 |
| `GET/POST/PATCH/DELETE` | `/api/tasks` | 任务 CRUD |
| `GET/POST/PATCH/DELETE` | `/api/ideas` | 灵感 CRUD |
| `GET/POST/PATCH/DELETE` | `/api/profits` | 收益 CRUD |
| `GET/POST/DELETE` | `/api/inbox` | 快速收件箱 |
| `GET/POST` | `/api/reviews` | 每日复盘 |

## 开发脚本

```bash
npm start   # 启动服务
npm run dev # 开发模式（Node --watch）
npm test    # 输出占位信息
```

## 目录结构

```
├── data/                # 本地数据目录（默认包含 .gitkeep）
├── public/              # 前端静态资源
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── src/
│   ├── config.js        # 环境变量解析
│   ├── env.js           # 简易 .env 解析器
│   ├── httpUtils.js     # HTTP 工具函数
│   ├── server.js        # 主服务逻辑与路由
│   └── storage.js       # 数据存储与 AES-256-GCM 加密
├── .env.example
├── package.json
└── README.md
```

## 常见问题

- **如何备份/迁移？** 只需拷贝 `data/store.json`（如有加密需同时保存 `APP_SECRET`）。
- **如何清空数据？** 停止服务，删除 `data/store.json` 即可重新开始（若已加密需知晓 `APP_SECRET`）。
- **能否多账户？** 当前定位为单人本地使用，如需多人协作可自行扩展鉴权与权限逻辑。

欢迎根据个人流程继续扩展，例如加入链上 API 抓取、自动风控清单或日历提醒等功能。
