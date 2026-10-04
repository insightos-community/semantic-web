# semantic-web

Semantic Web 是 Semantic Studio 的 Vue 3 + Vite 前端，也是系统唯一 Web 入口。

当前 v0.5 功能分支建立在已合入 develop 的 v0.4 仿真工作台上。前端始终只连接
Semantic Server，不直接连接 Pilot、AbilityFramework、Robot SDK 或仿真 Runtime。

## v0.5.0 设备中心

- `/devices` 展示一个 Server 管理的多个 Pilot、Robot 和 AbilityFramework。
- Project Studio 展示 Robot Execution、Stage、Action、Feedback 和 Observation。
- Skill 安装、Ability 调试和 Robot 安全停止都通过 Server 下发。
- Web 必须等待 Server 上报停止证据，不能根据按钮响应乐观显示 stopped。

场景可以查看不代表 Robot 已可执行；设备页分别展示 Robot Runtime 状态，并在

真实产品联调由 Framework 的 `make test-v050-real-gate` 统一编排。它先构建本仓库
生产制品，再用 `npm run test:framework:v050` 连接真实 Server，核对双 Robot、
七个 Ability、三个已启用 Robot Skill，以及 Execution 的 Stage、Action、Feedback、
Observation、Artifact 和刷新恢复。该命令不启用 Fixture，也不直连 Pilot 或
AbilityFramework。
Robot 未 ready 时锁定执行和 Ability 调试入口。

## v0.4.0 仿真功能

- Project 保存可移植的 Runtime Profile；真正启动场景时选择兼容的 Runtime Installation，并记住本机偏好。
- Project Explorer 管理公共场景引用，以及从 native 公共模板派生的多个 Project Layout。
- Simulation 活动栏只显示当前 Runtime、Scene Instance、Robot、Sensor 和运行记录。
- Physics Viewer 加载 Runtime 导出的 GLB，并通过 pose-stream 在 Three.js 中更新实时位姿；Scene Editor 与 Semantic Map 复用同一视觉内容。
- Sensor Viewer 显示 RGB、Depth、Contact、Holding 和 Robot State。
- Runtime 由 Framework 按 Project 租约启动和停止，浏览器不执行安装命令。
- Scene start、reset、Layout 切换和稳定检查点驱动确定性的 Semantic Map 同步。

## v0.2.0 功能

- Project Hub、单活动 Project 和 Project 内统一 Studio 路由。
- 可拖拽、分栏、浮动、关闭并按 Project 恢复的 Dockview 工作区。
- Conversation 历史、自动命名、归档和 Project 级 WebSocket 恢复。
- 图片粘贴、拖入、上传门禁和预览。
- Agent、模型服务、Skill 与 Tool 配置。
- Server Run 状态、Tool Call、SubAgent、Artifact、Interaction 和精确 Trace 展示。
- 一份由用户明确编辑的 Project Markdown Memory。
- Project Snapshot、增量事件、断线对账与损坏布局回退。

## 快速开始

```bash
npm ci
npm run dev
npm run test
npm run test:e2e
npm run test:release
npm run lint
npm run build
```

前端只访问 semantic-server。HTTP 与 WebSocket 地址分别由 VITE_SERVER_HTTP 和 VITE_SERVER_WS 配置。

前端独立演示可临时使用 `VITE_STUDIO_FIXTURES=true npm run dev`。界面会持续显示 FIXTURE 标记，生产环境不得开启。跨仓联调直接连接正常启动的 Semantic Framework，不依赖独立的 Fixture Server。

### 正式 Runtime Pack 联调

先安装 Semantic 和一个由 Plugin 固定 Tag 构建的 Runtime Pack。安装命令负责校验
制品、创建隔离 uv 环境、登记资产并运行最小场景 smoke；它不安装 Server，也不要求
检出 `plugin-mujoco` 源码：

```bash
semantic init
semantic runtime install native-mujoco@0.4.0 \
  --asset-root /data/semantic/mujoco-assets
semantic runtime doctor --all --smoke
SEMANTIC_ADMIN_PASSWORD=test-admin-pass semantic-server
```

最后启动 Web。Project 打开后由 Framework Ensure Runtime，不需要用户手工运行
Plugin 或再次导出资产路径：

```bash
cd /path/to/semantic-web
npm ci
VITE_SERVER_HTTP=http://127.0.0.1:8080 \
VITE_SERVER_WS=ws://127.0.0.1:8081 \
npm run dev
```

访问 `http://127.0.0.1:3000`，使用 `admin` 和 `SEMANTIC_ADMIN_PASSWORD` 登录。创建 Project 时选择 `Native MuJoCo`，再从 Project Explorer 的“仿真场景”添加场景并选择 Layout 启动。运行画面、传感器和 SDK 调试分别从 Simulation 活动栏打开独立面板。

### 源码开发模式

只有修改 Plugin 本身时才使用源码安装；它会标记为 `development`，不能用于 RC：

```bash
semantic runtime install \
  --dev-source /work/plugin-mujoco --profile native-mujoco \
  --asset-root /work/mujoco_asset \
  --scene-catalog /work/plugin-mujoco/runtime-packs/native-mujoco/catalog
semantic runtime doctor --id dev-native-mujoco --smoke
```

## CI 分层

流水线拆成 `ci/verify.yml`、`ci/release.yml`。监督按开发节奏分层：
先在当前功能分支做 PR 验收，通过后再 MR 进 `develop`。对照来源与 Framework 相同。

| 层 | 何时跑 | 监督什么 |
|---|---|---|
| 开发 PR | 功能分支每次 `git push`（尚未开合入 MR） | lint、Vitest、`test:release`、gitleaks、生产构建 |
| 合入 MR | 目标为 `develop`（或默认分支）的 Merge Request | 同一套快路径，相对目标分支看 diff。已开 MR 后不再重复跑分支 push |
| 主干 | 合入后的 `develop` push | 同一套快路径 |
| 发布 | 规范 SemVer 标签 | 快路径 + 打包 `dist/` 上传 |

Playwright E2E 不进 CI。本机 Fixture 用 `npm run test:e2e`，连真实 Server 用
`npm run test:framework:v050`，不要和 Fixture 混用。跨仓联调仍是先 Framework
Fake Gate，再设 `V050_FRAMEWORK_HTTP` 与 `V050_FRAMEWORK_WS`。

快路径默认走国内源：Docker 用华为云 SWR 镜像（`CI_IMAGE_NODE` /
`CI_IMAGE_ALPINE`）、npm 用 npmmirror、GitHub 发布包走 `GITHUB_PROXY`。
可在 GitLab 项目变量覆盖。

## 文档

跨 Framework、Web 与 Pilot 的系统架构、实现设计、用户手册、开发规范和版本计划统一维护在独立 [semantic-docs](https://github.com/insightos-community/semantic-docs) 仓库。

本仓库只保留与前端代码紧密相关的组件契约、生成文档和测试说明。

## 开发

- 开发分支从 develop 创建，测试和用户确认完成前保持 Draft MR。
- Commit 使用 type(scope): 中文结果。
- 新增组件、关键交互、恢复逻辑和测试必须使用完整中文注释。
- 当前分支的详细变更写入 changelog/v0.4.0/。
