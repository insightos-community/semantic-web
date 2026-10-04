# v0.4.0 仿真资源、场景编辑与本地 Physics Viewer

## 结果

- Studio 以 Project 为边界管理 RuntimeInstallation、公共场景引用、Project Layout 和活动场景实例。
- 拆除嵌套的 Simulation Workbench；Runtime、Scene、Robot 和 Sensor 进入统一侧栏、Dock、Inspector、Logs 与 Problems。
- Scene Editor 支持从公共 native MuJoCo Layout 派生项目草稿，并提供保存、校验、构建、发布、退出和未保存关闭保护。
- Physics Viewer 改为加载 Runtime 导出的 GLB，并通过 pose-stream 更新动态节点；相机旋转、平移和缩放完全在浏览器本地执行。
- Physics Viewer、Scene Editor 与 Semantic Map 复用同一视觉内容、坐标转换和 SpatialSelectionStore，支持仿真对象与地图 Entity 双向选择。
- Sensor Viewer 独立显示 RGB、Depth、Contact、Holding 和 Robot State，不再与 Physics Viewer 共用 JPEG 主画面链路。
- Runtime 安装设置页只展示、诊断和管理 Framework 已登记的 Runtime；浏览器不执行依赖安装或任意 Shell。
- Studio 标签页支持未保存标识、统一关闭保护，以及关闭当前、其他、右侧、已保存和全部页面。

## 版本与依赖

- Web 源码版本为 `0.4.0-dev`。
- 真实仿真联调依赖 Semantic Framework v0.4、对应 Runtime Pack 和兼容的场景/资产目录。
- 正式合并前应由 GitLab Pipeline 执行单元测试、浏览器测试、生产构建和真实组合门禁。

## 本轮检查边界

- 本次仓库整理仅检查 Git 差异、提交边界和不应跟踪的文件。
- 按要求没有在整理阶段重新运行 Vitest、Playwright、构建或交付门禁。
