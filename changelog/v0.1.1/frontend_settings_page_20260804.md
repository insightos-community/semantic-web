# R3 前端设置页 v1（系统设置：模型服务 / API 密钥 / 通用）

日期：2026-08-04 · 里程碑：R3（v0.1.1 设置系统）· 范围：semantic-web（联调 semantic-server :8080，settings REST 经 vite 代理 :3000）

## 为什么

R1-R2 已交付后端设置能力（.env/校验/热重载白名单/settings REST/key 托管），但前端导航栏
"系统"项仍是灰色禁用态，用户改默认模型、托管 API key 只能手改配置文件。R3 把设置能力
落到 UI：配置树只读可见（掩码）、默认模型一键切换（乐观锁 PATCH + 热应用提示）、
托管密钥 CRUD（明文不落前端）。全部契约以代码为准
（`internal/server/http/handlers/settings.go`、`internal/bootstrap/wire_settings.go`、
`pkg/config/doc.go`）。

## 内容

- **设置 API（`src/api/settings.js`）**：`getSettings()` / `patchSettings(baseHash, patch)`
  / `listKeys()` / `putKey(name, keyValue)` / `deleteKey(name)`，另导出
  `isSettingsConflict(err)` 判定 409 `SETTINGS_CONFLICT`（乐观锁冲突）。
- **settings store（`src/stores/settings.js`）**：
  - state：`config`（服务端已掩码的生效配置树）、`baseHash`（PATCH 乐观锁凭据）、
    `keys[]`（掩码密钥清单）、`loading`/`saving`、`reloadedHint`（热应用/需重启提示）。
  - `save(patch)`：以当前 baseHash 提交 merge patch，成功更新快照与 hash，并按返回的
    `changed` 叶子路径对照热重载白名单（llm.* / log.level / agents.profiles_dir，
    见 pkg/config doc.go）生成 `reloadedHint`——全白名单"已热应用，无需重启"、
    非白名单"需重启后生效：…"、混合两段并列。
  - **409 特判**：`SETTINGS_CONFLICT` 时自动重取最新快照（下次保存即可重试），
    抛友好文案"配置已被他人修改，请刷新"；其他错误（如 400 校验失败）原样抛出，
    不触发重取。
  - patch 构造辅助 `setDefaultProvider(name)` → `{llm:{default:name}}`；
    keys CRUD：`saveKey`（PUT 后重拉掩码清单，明文仅透传请求体不落 store）、
    `removeKey`（DELETE 成功后本地移除）。
- **设置页（`src/views/SettingsView.vue` + `src/components/settings/`，均 ≤300 行）**：
  - 布局：左侧分组菜单（模型服务 / API 密钥 / 通用），右侧内容区；顶部
    `reloadedHint` el-alert（可关闭）。
  - **模型服务**：`ProviderCard` 卡片栅格（名称/模型/base_url/驱动/capabilities
    徽标；当前 default 品牌色描边 + "默认"标签）；"设为默认"按钮（当前默认禁用、
    提交中 loading），成功后 toast + 热应用提示条。
  - **API 密钥**：`KeyTable` 表格（名称/掩码值 mono 字体/更新时间本地化/操作）；
    `KeyEditDialog` 新建/轮换对话框——新建时名称用下拉限定为已存在的 LLM 端点
    （后端 PUT 校验 `registry.Get(name)`），轮换时名称锁定；密钥为密码输入框
    （show-password），前端校验与后端一致（非空且 ≥8，settings.go
    `minManagedKeyLength`）；删除经 ElMessageBox 二次确认。
  - **通用**：server/log/store 段只读卡片（掩码后的配置树片段，JSON 格式化展示）。
- **导航与路由**：AppShell "系统"菜单项由禁用态启用为 `/settings`；路由注册
  `settings`（AppShell 子路由，非 public——守卫自动要求登录），标题"系统设置"。

## 安全纪律

- 配置树与密钥清单一律来自服务端掩码响应（`MaskTree`/`MaskSecret`）；前端不持有、
  不打印任何明文，密钥明文仅存在于 PUT 请求体一次。
- 单测含"明文不落 store"断言：`saveKey` 后 `JSON.stringify(keys)` 不含原文。

## 影响面

- 纯前端变更，未要求后端改动；消费既有契约：settings 四端点 + keys 三端点（均受保护）。
- AppShell 仅改导航数组一项（`/system` 禁用 → `/settings` 启用）；路由注释同步更新。
- 观察到的后端行为（非本 MR 引入）：`MaskTree` 对键名含 token 的字段一律掩码，
  `llm.providers.*.options.max_tokens` 因此显示为 `"***"`（数值型敏感名整体掩码，
  系 settings.go 既定策略）；`base_hash` 是配置树内容哈希——PATCH 改回相同内容后
  旧 hash 重新有效（乐观锁语义按内容而非版本）。

## 测试

- `npm run test`：11 文件 76 用例全过（新增 `tests/unit/settings-store.test.js`
  13 例：load 掩码呈现/getters、save 后 hash 更新与热应用提示、非白名单需重启提示、
  409 自动刷新+友好文案、400 不重取、keys 加载/保存重拉/删除移除/404 原样抛出、
  reloadHint 全白名单/非白名单/混合/空）。
- `npm run lint`：eslint 0 error + prettier --check 全过。
- `npm run build`：vite production 构建成功（SettingsView 独立 chunk 10.95 kB；
  主 chunk 体积警告同 F1 既有 TODO）。
- 联调实测（`make build` + `SEMANTIC_LLM_DEFAULT=mock semantic-server serve` +
  `npm run dev`，全程经 vite 代理 :3000，admin/admin123 登录取 token）：
  - GET /settings 200：三个 provider（deepseek-chat/deepseek-reasoner/mock）齐全，
    default=mock（env 覆盖生效），base_hash 返回；
  - PUT /settings/keys/deepseek-chat `{key_value:"sk-test12345678"}` → `{ok:true}`
    （server 日志"托管密钥已写入"）；
  - GET /settings/keys → `key_value:"sk-tes***"`（掩码符合预期），响应全文 grep
    明文 0 命中（页面无原文的数据源保证）；
  - PATCH `{llm:{default:"deepseek-chat"}}` → 200 `changed:["llm.default"]`，
    server 日志"配置 PATCH 已生效"+"LLM 注册表已热更新 default=deepseek-chat"；
    再 PATCH 回 mock 同样热更新（终态 mock 为默认）；
  - 过期 base_hash 重放 PATCH → 409 `SETTINGS_CONFLICT`（"配置快照已被并发修改…"），
    与 store 409 特判链路吻合；
  - DELETE /settings/keys/deepseek-chat → 204（server 日志"托管密钥已删除"），
    再 GET keys 为空；
  - 未带 token GET /settings → 401（受保护路由佐证）；
  - vite dev 编译 SettingsView/ProviderCard 模块均 200；
  - 实测完毕 dev 与 server 进程均已停止；PATCH 重写的
    `configs/semantic-server.yaml` 已恢复（backend 仓 git status 干净）。

## TODO（留后续版本）

- 本次联调走 API 级验证（环境无 headless 浏览器），未做真实浏览器点击遍历；
  页面交互细节（对话框校验态、确认框）建议在后续验收中补一轮手测。
- 通用段为只读展示；log.level 等白名单字段的在线编辑留待设置页 v2。
- `max_tokens` 被后端掩码（见影响面）：providers 卡暂不展示 options；若后续需要
  展示数值型 options，需后端掩码策略细化（如仅字符串值掩码）。
- 密钥生效优先级（环境变量 > 托管密钥库）仅在页面文案说明，未做逐端点来源标识。
