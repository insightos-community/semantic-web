# F1 前端骨架工程（W1.1）

日期：2026-08-03 · 里程碑：F1 · 范围：semantic-web 全仓

## 为什么

前端从零重建（旧仓存在 god-store、双后端代理、游离大文件等病）。F1 先把工程底座立起来：
统一设计令牌、请求/实时通道基础库、按域拆分的 store 模型、路由与主框架，
使后续里程碑（F2 登录鉴权、F3 对话流、F4 任务/Trace）只往里填业务，不再动底座。

## 内容

- **工程化**：依赖按 17-web-ui-design §2 技术栈补齐（element-plus / icons-vue / sass-embedded /
  markdown-it / highlight.js / dompurify / echarts / vue3-toastify / pinia-plugin-persistedstate）；
  vite 增加 `@` 别名与 vitest 配置；eslint 9 flat config（vue/recommended，版式规则让位 prettier）
  + prettier（semi:false / singleQuote / trailingComma:none）。
- **目录结构**：与 17 文档 §2 对齐——`src/{api,ws,stores,views,components/{base,chat,task,agent,
  device,map,studio,trace,artifact},router,utils,styles}`；旧 `src/store` 与
  `components/{monitoring,project,workflow}` 空目录已迁移/移除。
- **设计令牌** `styles/tokens.scss`：暗色主主题（--sf-bg-*、--sf-brand、角色色 --sf-role-*、
  频道色 --sf-channel-*、状态色、4px 基网间距/字号/圆角阶梯）+ Element Plus 暗色 css vars 覆盖
  （html.dark，index.html 声明）。
- **基础库**：
  - `api/request.js`：axios 实例（baseURL=/api/v1、Bearer 注入）、401 单飞刷新队列
    （/auth/refresh，失败清登录态跳 /login）、统一错误格式解析 {error:{code,message}} → Error；
  - `ws/client.js`：WS 状态机（offline→connecting→online⇄reconnecting）、30s 应用层 ping /
    90s 判死、指数退避重连（1s→30s 封顶）、sync(last_event_id) 续传 + 按 id 幂等去重、
    on(channel,fn) 监听注册表；
  - `ws/dispatcher.js`：envelope → store action 的 channel 路由表，未注册 channel 安全忽略。
- **stores**：`session`（token/user/Team 占位，persistedstate 持久化）、`ui`（主题/侧栏/全局通知）、
  `chat`（sessions/currentSessionId/messages/connectionStatus + dispatcher 入口最小落地，为 F3 铺路）。
- **路由与主框架**：`/login` + `/`（AppShell，默认重定向 /chat）+ 未登录守卫；
  AppShell 左侧图标导航（未实现模块禁用态）+ 顶部状态栏（Team 占位/组件健康占位/用户菜单）；
  LoginView 表单结构占位（逻辑 F2）；ChatView 三栏骨架（会话列表/消息区"敬请期待"/协作侧栏）。
- **测试**：vitest + 2 个真实单测（request 错误解析 4 例、dispatcher 路由 5 例）。

## 影响面

- 纯新增，无对外 API 变更；后端契约按 14-frontend-api 消费，未要求后端改动。
- `.gitlab-ci.yml` 三个阶段（lint/test/build）与本地脚本一致，未改动；gitleaks 阶段保留。
- 依赖变更：新增 pinia 3（pinia-plugin-persistedstate 4.7 的 peer 要求 pinia>=3）；
  markdown-it/highlight.js/dompurify/echarts 已装未用（F3/F4 消费，属技术栈清单内）。

## 测试

- `npm run test`：2 文件 9 用例全过（vitest，node 环境）。
- `npm run lint`：eslint 0 error + prettier --check 全过。
- `npm run build`：vite production 构建成功（主 chunk ~1.0MB，element-plus 全量引入所致，见 TODO）。
- `npm run dev` 冒烟：`/`、`/login`、`/chat` 均 200，scss 令牌正常编译。

## TODO

- F2：/auth/login 真实登录、Team 切换、组件健康接 /system/health；dispatcher 接 progress 频道（task store）。
- F3：消息流渲染（markdown-it + DOMPurify）、message.delta 流式缓冲、interaction 待应答队列、虚拟滚动。
- F4：trace 频道与 Trace 视图；echarts 接入系统指标页。
- 工程：element-plus 改按需引入或 manualChunks 分包，消除 >500kB chunk 告警；e2e（playwright）接入。
- ws/client.js 增加 FakeWebSocket 单测（重连退避与 sync 续传时序）。
