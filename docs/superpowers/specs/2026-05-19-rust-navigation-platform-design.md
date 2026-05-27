# Navigation Platform — Architecture Redesign (Rust + SvelteKit)

**Date:** 2026-05-19
**Status:** Draft for review
**Supersedes:** existing static-only nav site (SvelteKit + adapter-static, hard-coded `nav.ts`)

---

## 1. Overview

### 1.1 Goal

将当前纯静态、数据硬编码、单一视觉风格的导航站重构为：**数据驱动 + 在线编辑 + 鉴权 + 全新 design system + i18n + a11y** 的可演进平台。前端继续 SvelteKit（`adapter-static`），后端新增 Rust（Axum + SQLite）单进程统一 serve 静态产物与 API。

### 1.2 Why

| 现状痛点 | 影响 |
|---|---|
| 导航项 / 区域 / 站点信息硬编码在 TypeScript 常量 | 改一项需改源码 + 重构建 + 重部署 |
| 无搜索 / 分组 / 标签 / 收藏 / 主题 | 项目数 ↑ 后体验下降 |
| 文案中英混排在常量里 | 违反 i18n 原则、不可切换 |
| `<div on:click>` 充当 button | a11y 不达 WCAG AA |
| `Record<string, IUrl>` 类型松散 | 新增 site 不会触发编译期错误 |
| 视觉风格固定（紫蓝渐变 + 圆角 + 抖动 hover） | 个性化能力差 |

### 1.3 Non-Goals (out of scope)

- 多用户 / OAuth / SSO（保持单管理员）
- 操作日志 / 审计
- 实时多端同步（SSE / WebSocket）
- PWA / 离线
- 健康检查 ping 链接
- 远端备份（git / S3）—— 用户自行 `rsync /app/data`
- 邮件密码重置 —— 用 CLI 子命令替代
- 多产物 build（同一份代码出多个独立站）
- SSR —— 前端继续 SPA `adapter-static`

### 1.4 Hard Constraints

- 单 Docker 镜像、单进程、单端口（默认 8080）
- 数据卷 `/app/data` 含 SQLite + 上传图标 + admin hash；删容器不丢数据
- 不引入 Tailwind / 任何 UI 库 / 任何 i18n 库 —— 自建 design system 与 i18n
- 不破坏现有 Docker bind mount 用户的 `/app/data`（首次上线一次性迁移）
- 所有用户可见文案走 i18n
- 所有交互元素 `<button>`，键盘可达，焦点可见
- TypeScript 全严格、零 `any`，Rust 全 `#[deny(warnings)]` 编译

---

## 2. Architecture

### 2.1 Topology

```
┌──────────────────────────────────────────────────────────────┐
│  Docker container (single process, port 8080)                │
│                                                              │
│   ┌──────────────────────────┐    ┌──────────────────────┐   │
│   │  Axum (Rust)             │    │  SQLite (file)       │   │
│   │  /            → static   │    │  /app/data/data.db   │   │
│   │  /assets/*    → static   │◄───┤  ├─ sites           │   │
│   │  /icons/*     → static   │    │  ├─ groups          │   │
│   │  /api/nav     read       │    │  ├─ items           │   │
│   │  /api/items/* CRUD       │    │  ├─ item_links      │   │
│   │  /api/groups/* CRUD      │    │  ├─ tags            │   │
│   │  /api/sites/* CRUD       │    │  ├─ item_tags       │   │
│   │  /api/tags/* CRUD        │    │  ├─ config (kv)     │   │
│   │  /api/config CRUD        │    │  └─ sessions        │   │
│   │  /api/auth/{login,...}   │    └──────────────────────┘   │
│   │  /api/favicon            │                               │
│   │                          │    /app/data/icons/_cache/    │
│   │  middleware:             │       (favicon cache blobs)   │
│   │   ─ tower-sessions       │                               │
│   │   ─ tower-governor       │                               │
│   │   ─ tower-http compress  │                               │
│   │   ─ tracing              │                               │
│   └──────────────────────────┘                               │
│                                                              │
│   /app/static     ← frontend build artifacts (read-only)     │
│   /app/data       ← writable volume                          │
└──────────────────────────────────────────────────────────────┘
```

- **TLS**：容器内 HTTP only。生产部署前置 caddy / traefik / nginx；提供 `docker-compose.yml` sample with caddy
- **Reverse proxy not required** for basic deploy（容器自己 serve 全部 + http 即可）
- **No SSR**: SvelteKit `adapter-static` 出 SPA；Axum 用 `tower_http::services::ServeDir` + fallback to `/index.html` 兜底前端路由

### 2.2 Rust crate 模块边界

| 模块 | 职责 | 公共接口 |
|---|---|---|
| `app::config` | env / .env 加载（`figment`） | `Settings::load()` |
| `app::error` | 统一错误 + `IntoResponse` | `AppError`, `Result<T>` |
| `app::auth` | 密码 / session / 中间件 | `RequireAuth` extractor、`hash_password`, `verify_password` |
| `app::repo` | 仓储模式 DB 访问 | `NavRepo`, `ConfigRepo`（trait + sqlx 实现） |
| `app::services` | favicon 抓取 / 迁移 / 密码 | `FaviconService`, `MigrationService` |
| `app::routes` | HTTP handler，仅做参数解析 + 调 services / repo | `pub fn router(state: AppState) -> Router` |
| `app::cli` | `reset-password`、`bootstrap-admin` 子命令 | clap-derive subcommand |
| `app::main` | 入口；启动迁移；构建 router；监听 | `fn main()` |

**关键约束**：
- handler 不直接写 SQL；所有 DB 通过 `*Repo` trait
- service 只接 trait（不接具体 struct），便于测试用 mock
- `AppState { repo: Arc<dyn NavRepo>, config_repo: Arc<dyn ConfigRepo>, favicon: Arc<FaviconService>, settings: Arc<Settings> }`

### 2.3 Frontend / Backend 协议

- 前端开发：vite dev server (port 5173) + proxy `/api/*` → `localhost:8080`
- 前端生产：build 产出 `/build`，被 Rust binary 嵌入式 serve（`ServeDir("./static")`）
- 数据契约：所有 API 返回 `application/json`；schema 由 zod (前端) ↔ serde + validator (Rust) 手维护一致；`schemaVersion: 1` 字段贯穿
- 错误：4xx/5xx 全部 `{ error: string, message?: string, fields?: Record<string,string> }`

---

## 3. Data Model + API Contract

### 3.1 SQLite schema (3NF)

```sql
-- migrations/0001_init.sql

CREATE TABLE sites (
  id          INTEGER PRIMARY KEY,
  value       TEXT    NOT NULL UNIQUE,           -- 'shangHai' (stable id used in URL/store)
  name        TEXT    NOT NULL,                  -- '上海' (default locale)
  name_i18n   TEXT,                              -- JSON e.g. {"en":"Shanghai"}
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_default  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE groups (
  id          INTEGER PRIMARY KEY,
  slug        TEXT    NOT NULL UNIQUE,           -- 'network'
  name        TEXT    NOT NULL,
  name_i18n   TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  collapsed_default INTEGER NOT NULL DEFAULT 0   -- 默认是否折叠（前端可被 uiPrefs 覆盖）
);

CREATE TABLE items (
  id          INTEGER PRIMARY KEY,
  group_id    INTEGER REFERENCES groups(id) ON DELETE SET NULL,
  name        TEXT    NOT NULL,
  name_i18n   TEXT,
  description TEXT,                              -- 可选；hover tooltip / search 命中
  description_i18n TEXT,
  icon_kind   TEXT    NOT NULL CHECK (icon_kind IN ('asset','url','auto-favicon')),
  icon_value  TEXT    NOT NULL,                  -- asset 文件名 | https URL | hostname
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE item_links (                        -- item × site → URL
  item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  site_id     INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  url         TEXT    NOT NULL,
  PRIMARY KEY (item_id, site_id)
);

CREATE TABLE tags (
  id          INTEGER PRIMARY KEY,
  slug        TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  name_i18n   TEXT
);

CREATE TABLE item_tags (
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);

CREATE TABLE config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- bootstrap keys:
-- site_name, site_copyright, site_icp_text, site_icp_url,
-- site_police_text, site_police_url, site_avatar_path,
-- admin_password_hash, admin_password_updated_at,
-- default_theme ('system'|'light'|'dark'), schema_version

CREATE TABLE sessions (                          -- tower-sessions sqlx-store
  id         TEXT PRIMARY KEY,
  data       BLOB NOT NULL,
  expiry_date INTEGER NOT NULL
);

-- indexes
CREATE INDEX idx_items_group_sort ON items(group_id, sort_order);
CREATE INDEX idx_item_links_site  ON item_links(site_id);
CREATE INDEX idx_item_tags_tag    ON item_tags(tag_id);
```

**Schema 演进**：sqlx `migrations/NNNN_*.sql`，启动时 `sqlx::migrate!()` 自动跑；版本号写到 `config.schema_version`。

**SQLite 运行模式**：连接 pragma `journal_mode=WAL` + `synchronous=NORMAL` + `foreign_keys=ON` + `busy_timeout=5000`；写并发安全 + 读不阻塞。

### 3.2 API endpoints

| Method | Path | Auth | Body / Query | Response |
|---|---|---|---|---|
| `GET`    | `/api/nav` | – | – | `NavBundle`（整包，见 3.3）|
| `GET`    | `/api/auth/me` | – | – | `{ authenticated: boolean }` |
| `POST`   | `/api/auth/login` | – | `{ password }` | `204` + `Set-Cookie: __Host-sid=...` |
| `POST`   | `/api/auth/logout` | session | – | `204` |
| `POST`   | `/api/items` | session | `ItemPayload` | `201 Item` |
| `PATCH`  | `/api/items/:id` | session | `Partial<ItemPayload>` | `200 Item` |
| `DELETE` | `/api/items/:id` | session | – | `204` |
| `POST`   | `/api/items/reorder` | session | `[{id, sort_order, group_id?}]` | `204` |
| `POST`   | `/api/groups` | session | `GroupPayload` | `201 Group` |
| `PATCH`  | `/api/groups/:id` | session | `Partial<GroupPayload>` | `200 Group` |
| `DELETE` | `/api/groups/:id` | session | – | `204` |
| `POST`   | `/api/groups/reorder` | session | `[{id, sort_order}]` | `204` |
| `POST`   | `/api/sites` | session | `SitePayload` | `201 Site` |
| `PATCH`  | `/api/sites/:id` | session | `Partial<SitePayload>` | `200 Site` |
| `DELETE` | `/api/sites/:id` | session | – | `204` |
| `POST`   | `/api/sites/reorder` | session | `[{id, sort_order}]` | `204` |
| `POST`   | `/api/tags` | session | `TagPayload` | `201 Tag` |
| `PATCH`  | `/api/tags/:id` | session | `Partial<TagPayload>` | `200 Tag` |
| `DELETE` | `/api/tags/:id` | session | – | `204` |
| `PATCH`  | `/api/config` | session | `[{ key, value }]` | `204` |
| `POST`   | `/api/config/password` | session | `{ current, next }` | `204` |
| `POST`   | `/api/icons/upload` | session | `multipart/form-data` | `201 { path }` |
| `GET`    | `/api/favicon` | – | `?host=…` | `image/*` (cached) |

### 3.3 NavBundle TypeScript / Rust 契约（手维护一致）

```ts
// src/lib/types/nav.ts
import { z } from 'zod';

export const NavBundleSchema = z.object({
  schemaVersion: z.literal(1),
  meta: z.object({
    siteName: z.string(),
    siteAvatarPath: z.string().optional(),
    siteCopyright: z.string(),
    siteIcp: z.object({ text: z.string(), url: z.string().url() }).nullable(),
    sitePolice: z.object({ text: z.string(), url: z.string().url() }).nullable(),
    defaultTheme: z.enum(['system','light','dark']),
  }),
  sites:  z.array(SiteSchema),
  groups: z.array(GroupSchema),
  items:  z.array(ItemSchema),  // 含 links: Record<siteValue, url> + tagSlugs: string[]
  tags:   z.array(TagSchema),
});
export type NavBundle = z.infer<typeof NavBundleSchema>;
```

**为什么整包返回**：导航站数据量极小（百级），整包 1 RTT 简化前端缓存语义；写操作走细粒度 endpoint，写完只 patch 本地 store，不重 fetch（除冲突）。

---

## 4. Frontend State + Components

### 4.1 Store layering

```
              ┌──────────────────────┐
              │ navDataStore         │   ← async, GET /api/nav, zod-validated
              │ NavBundle            │
              └──────────┬───────────┘
                         │
       ┌─────────────────┼─────────────────┐
       ▼                 ▼                 ▼
 ┌──────────────┐ ┌──────────────┐  ┌──────────────┐
 │ uiPrefs (LS) │ │ session      │  │ editMode     │
 │ ─ siteValue  │ │ ─ authed     │  │ ─ on/off     │
 │ ─ theme      │ │              │  │ ─ dirty: Set │
 │ ─ favorites  │ │              │  │              │
 │ ─ locale     │ │              │  │              │
 │ ─ groupOpen  │ │              │  │              │
 └──────────────┘ └──────────────┘  └──────────────┘

       ┌────────── derived (pure) ──────────┐
       ▼                                    ▼
   visibleSectionsStore              searchHitsStore
   (current site × searchTerm        (字符串模糊匹配命中)
    × activeTagSlugs filter,
    grouped + favorites first)
```

- `navDataStore`: 远端真理；接口：`load()`, `refetch()`, `applyPatch(itemId, patch)`, `applyReorder(...)`, `applyDelete(id)`...
- `uiPrefs`: 启动时从 LS hydrate；订阅自动写回；schema 版本号字段允许未来兼容迁移
- `session`: 启动调一次 `/api/auth/me`；登录后置 true；401 自动置 false
- `editMode`: 仅 `session.authed === true` 时可置 on
- 所有 derived 是**纯函数**，不订阅任何 LS / API；测试零 I/O

### 4.2 Component tree

```
+layout.svelte
├─ <AppShell>                           (新；toast + dialog portal + theme provider)
├─ <Header>
│   ├─ <Brand>                          (logo + site name)
│   ├─ <SearchBar>                      ("/" 聚焦, fuzzy, esc clear)
│   ├─ <TagFilterChips>
│   ├─ <SiteSelect>                     (refactor 现有)
│   ├─ <ThemeToggle>                    (新)
│   ├─ <LocaleToggle>                   (新)
│   └─ <AuthControls>
│        ├─ <LoginButton>               (未登录)
│        └─ <EditToggle> + <UserMenu>   (已登录)
├─ <main>
│   └─ +page.svelte
│        ├─ <FavoritesSection>          (only if favorites.length > 0)
│        ├─ <GroupSection>              ✕ N
│        │    ├─ <GroupHeader>          (折叠 / 重命名 / 排序)
│        │    └─ <NavGrid>
│        │         └─ <NavItem>         ✕ M
│        │              ├─ <NavIcon>    (asset | url | auto-favicon)
│        │              ├─ <NavLabel>   (双击编辑 in editMode)
│        │              ├─ <FavoriteStar>
│        │              └─ <ItemContextMenu>  (editMode only)
│        ├─ <UngroupedSection>          (group_id IS NULL)
│        ├─ <NewItemAffordance>         (editMode only; "＋" 卡片)
│        └─ <SearchEmptyState> | <DataEmptyState>
├─ <Footer>                             (重做)
├─ <ToastViewport>                      (aria-live)
├─ <DialogPortal>
│    ├─ <LoginDialog>
│    ├─ <ItemEditDialog>
│    ├─ <GroupEditDialog>
│    ├─ <SiteEditDialog>
│    ├─ <TagEditDialog>
│    └─ <SiteSettingsDialog>            (站名 / 备案 / avatar / 主题默认)
```

### 4.3 类型严格

- 所有 props `export let x: T`，禁 `any`
- store 用 `Writable<T>` / `Readable<T>` 显式泛型
- `apiClient<TReq, TRes>(method, path, body, resSchema): Promise<TRes>` 强制响应经 zod parse
- API 返回类型与 Rust serde struct **手维护一致**（小仓库；不引入 ts-rs / openapi）

---

## 5. Edit Mode UX

### 5.1 进入 / 退出

- 未登录 → Header 显示 `<LoginButton>` → 点击 → `<LoginDialog>` → 成功 → `session.authed = true` → 出现 `<EditToggle>` + `<UserMenu>`
- `<EditToggle>` 按下 → `editMode.on = true` → 整个 nav 区域加 `outline: 2px dashed var(--accent-500)` + 顶部 banner "编辑中"
- 退出：`<EditToggle>` 再按 / `<UserMenu>` → 退出登录 / Esc / 30 分钟无操作 toggle 自动关（不踢登录态）

### 5.2 操作矩阵

| 操作 | 触发 | 即时反馈 | 后端调用 | 失败处理 |
|---|---|---|---|---|
| 重排 nav 项 | 拖拽 ≡ 手柄（`svelte-dnd-action`）| 本地 reorder 立即生效 | `POST /api/items/reorder` (debounce 300ms) | 回滚 + toast.error |
| 跨分组拖动 | 拖到另一 group container | 同上 | 同上（含 `group_id`） | 同上 |
| 重命名 item | 双击 `<NavLabel>` → contenteditable | onBlur / Enter 提交 | `PATCH /api/items/:id` | 回滚 + 保留焦点 |
| 详细编辑 item | 右键菜单 / 长按（移动）→ `<ItemEditDialog>` | 表单完整字段 | `PATCH /api/items/:id` | 表单 inline error |
| 删除 item | 右键 → "删除" → `<ConfirmToast>`（3s 撤销窗口） | optimistic 隐藏 | `DELETE /api/items/:id` after 3s | 撤销 / toast.error |
| 新增 item | grid 末尾 `＋` 占位 | 弹 `<ItemEditDialog>` | `POST /api/items` | 表单 inline error |
| 重命名 group | header `✎` | inline editable | `PATCH /api/groups/:id` | 回滚 |
| 重排 group | 拖 group header | 本地 reorder | `POST /api/groups/reorder` | 同上 |
| 新增 group | "+ 新建分组" 按钮 | inline 创建 + 立刻可输入 | `POST /api/groups` | 表单 inline error |
| 删除 group | header 菜单 → 删除 | 项目落到"未分组" | `DELETE /api/groups/:id` (cascade `SET NULL`) | toast.error |
| 管理 sites | `<SiteSelect>` 末尾 "管理…" | `<SiteEditDialog>` | site CRUD endpoints | 表单 inline error |
| 管理 tags | Header tag chip 末尾 "管理…" | `<TagEditDialog>` | tag CRUD endpoints | 表单 inline error |
| 站点元信息 | `<UserMenu>` → "站点设置" | `<SiteSettingsDialog>`（站名 / 备案 / avatar 上传 / 默认主题） | `PATCH /api/config` + `POST /api/icons/upload` | 表单 inline error |
| 改密码 | `<UserMenu>` → "修改密码" | dialog | `POST /api/config/password` | 表单 inline error |

### 5.3 一致性 / 失败 / 离线

- 所有写：optimistic update + 失败回滚 + toast；连续 2 次失败自动 `navDataStore.refetch()`
- 写操作发出前对比 `updated_at`（item / config）做乐观锁，409 冲突时拉新值 + diff 提示
- `editMode.on` + 任意 dialog 有未保存改动 → `beforeunload` 提示
- 网络断开：写入队列暂存；恢复后批量 retry；UI 显示 offline banner

---

## 6. Auth + Security + Password Recovery

### 6.1 Bootstrap（safe-by-default）

首次启动按以下优先级解析管理员初始密码（业界做法，参考 GitLab Omnibus / Jenkins / Postgres 镜像）：

1. **env `BOOTSTRAP_ADMIN_PASSWORD` 已设** → bcrypt(cost=12) → 写 `config.admin_password_hash` + `admin_password_updated_at`
2. **env 未设** → 生成 24 字符 URL-safe 随机密码 → bcrypt 同上 → **同时**：
   - 在启动日志打印一次（`⚠ INITIAL ADMIN PASSWORD: <pw>`）
   - 写到 `/app/data/INITIAL_PASSWORD.txt`（mode 0600）
3. 启动日志统一强提示：`Please change the admin password via UI immediately and then delete /app/data/INITIAL_PASSWORD.txt`
4. 用户首次通过 UI 修改密码后，后端检测到 `admin_password_updated_at` 变化 → 自动删除 `INITIAL_PASSWORD.txt`
5. 之后启动 env 与文件均被忽略（hash 已存且已被用户修改过）；密码丢失走 §6.3 CLI 重置

### 6.2 登录流

- `POST /api/auth/login { password }` → `tower-governor` 限 5 次 / 15min / IP → bcrypt verify → 成功签发 session
- Session: `tower-sessions` + `tower-sessions-sqlx-store`（SQLite 存）
- Cookie: `__Host-sid`、`HttpOnly`、`Secure`（生产）、`SameSite=Lax`、`Path=/`、TTL 30 天，每次写延期
- `POST /api/auth/logout` 销毁 session；前端清 `session.authed = false`

### 6.3 密码恢复（CLI 重置）

- 二进制提供子命令：`lens reset-password [--password=<new>]`（不传交互式 prompt）
- 流程：
  - 用户 `docker exec -it nav-container lens reset-password`
  - 子命令打开同一 SQLite，写入新 bcrypt hash + 更新 `admin_password_updated_at`
  - 立即吊销所有现有 session（`DELETE FROM sessions`）
- 文档：README 加"忘记密码"段落
- 没有 UI 入口；登录页只有 `Forgot password? See README.` 提示

### 6.4 输入校验 / 防护

- Rust：`serde` + `validator`：name ≤ 80 char、url 必须 `http(s)://`、reject `javascript:` / `data:`
- 前端：表单同等校验 + 提交前 zod parse；后端是真值
- XSS：Svelte 默认 escape；`<NavIcon>` `src` 限 `/icons/...` 同源 + `https://` 同源校验通过的图源
- CSRF：SameSite=Lax + 同源 → 不需要显式 token
- 速率限制：login 5 / 15min；写接口 60 / min / session
- 安全 header（tower-http）：`X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`

---

## 7. Design System (new)

> **Note**: 本节定义**原则 + tokens 框架 + 起点风格**。具体视觉决策（确切色值、字号阶梯、最终 mockup）在 implement 阶段由 frontend-design / ui-ux-pro-max skill 深化；本节锁定的是**词汇与边界**，不是像素。

### 7.1 风格方向（已锁定）

**现代极简（modern minimal）** — 业界对"工具属性产品 + 高频使用"场景的默认选择（Linear / Raycast / Vercel / Stripe Dashboard）：

- 克制中性色（warm neutral 偏向）+ 单一 accent（待 implement 阶段从可选 indigo / violet / teal 中选定）
- 强信息层级：通过 weight + size + 间距分层，**不**靠装饰
- 微圆角：6/10/14px 三档；不用 24px 大圆角
- Subtle shadow：1px border + 极弱 shadow，hover 时 shadow 升级 + 轻微 translateY(-2px)
- 排版：2-axis scale（size + weight），≤ 5 个字号档位
- 动效：仅 transition（150–250ms ease-out）；不用 spring / 抖动 / 旋转
- 暗 / 亮主题双调；`prefers-color-scheme` 自动 + 用户 toggle 覆盖
- 尊重 `prefers-reduced-motion`

### 7.2 Design tokens（结构）

```scss
// src/lib/design/tokens.scss
:root {
  /* Spacing — 4px base, exponential */
  --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px;  --sp-4: 16px;
  --sp-5: 24px; --sp-6: 32px; --sp-7: 48px;  --sp-8: 64px;

  /* Radius */
  --rd-sm: 6px; --rd-md: 10px; --rd-lg: 14px; --rd-pill: 999px;

  /* Type */
  --ft-sans: -apple-system, BlinkMacSystemFont, ...;
  --ft-mono: ui-monospace, SFMono-Regular, ...;
  --fs-xs: 12px; --fs-sm: 13px; --fs-md: 15px; --fs-lg: 18px; --fs-xl: 24px;
  --fw-regular: 400; --fw-medium: 500; --fw-semibold: 600;
  --lh-tight: 1.2; --lh-base: 1.5; --lh-loose: 1.7;

  /* Color (light) */
  --c-bg:        #fafaf9;
  --c-surface:   #ffffff;
  --c-surface-2: #f4f4f3;
  --c-border:    #e5e5e3;
  --c-text:      #1a1a18;
  --c-text-2:    #5a5a55;
  --c-text-3:    #8a8a85;
  --c-accent:    #4f46e5;        /* 单 accent，待最终实现敲定 */
  --c-accent-bg: #eef2ff;
  --c-success:   #047857;
  --c-warn:      #b45309;
  --c-danger:    #b91c1c;

  /* Shadow */
  --sh-sm: 0 1px 2px rgba(0,0,0,0.04);
  --sh-md: 0 4px 12px rgba(0,0,0,0.06);
  --sh-lg: 0 12px 32px rgba(0,0,0,0.08);

  /* Motion */
  --tr-fast: 120ms ease-out;
  --tr-base: 180ms ease-out;
  --tr-slow: 260ms ease-out;
}

[data-theme="dark"] {
  --c-bg:        #0e0e0d;
  --c-surface:   #18181a;
  --c-surface-2: #232326;
  --c-border:    #2c2c30;
  --c-text:      #f5f5f3;
  --c-text-2:    #b5b5b0;
  --c-text-3:    #767672;
  --c-accent:    #818cf8;
  --c-accent-bg: #1e1b4b;
  --sh-sm: 0 1px 2px rgba(0,0,0,0.4);
  --sh-md: 0 4px 12px rgba(0,0,0,0.45);
  --sh-lg: 0 12px 32px rgba(0,0,0,0.5);
}

@media (prefers-reduced-motion: reduce) {
  :root { --tr-fast: 0ms; --tr-base: 0ms; --tr-slow: 0ms; }
}
```

### 7.3 Component primitives

新建 `src/lib/components/ui/`：
- `Button.svelte` — 三种 intent (primary / secondary / ghost) × 三种 size (sm / md / lg) + icon-only variant
- `Input.svelte` / `Textarea.svelte` — 含 leading icon、错误态、help text
- `Dialog.svelte` — focus trap + escape + body scroll lock + portal
- `Toast.svelte` + `ToastViewport.svelte` — 4 intents、aria-live polite
- `Menu.svelte` (context menu) — 键盘 navigable
- `Chip.svelte` — tag filter / status
- `Switch.svelte` — toggle 切换
- `Card.svelte` — surface + radius + shadow
- `IconButton.svelte`
- `Skeleton.svelte`
- 全部受 design tokens 驱动

### 7.4 Footer 重做

- 现状：`copyright | ICP 备案 | 公安备案`，三段 grid，断点切列
- 新设计原则：
  - 主行：`版权` + 一段 inline 的 ICP / 公安链接（不再要 `divider` 装饰条）
  - 次行（可选）：`Built with ❤︎ — Source on GitHub` 之类（用户自定义）
  - 移动端：自动堆叠
  - 全部内容来自 `config` 表，不再硬编码
  - i18n：英文 locale 下隐藏中国大陆备案信息，或显示对应英文翻译（用户在 site settings 填）

### 7.5 现有视觉资产处置

- 紫蓝渐变背景 → 保留作为 hero / 头像光晕的可选 accent，不做主背景
- shark-bounce 动画 → 移除（不符合"现代极简"，且违反 reduced-motion）
- 圆角 24px 大圆角 → 缩小到 14px (`--rd-lg`)，`box-shadow` 用 `--sh-md`
- nav-item 重投影 → 替换为 1px border + subtle shadow + accent ring on focus / hover
- 抖动 hover → 替换为 `transform: translateY(-2px)` + shadow upgrade

---

## 8. i18n + a11y + Type Safety + Errors

### 8.1 i18n（前端，自实现 ~150 行）

- 文件：`src/lib/i18n/{en.json, zh.json}`，flat key
- store：`localeStore: Writable<'zh' | 'en'>`，LS 持久化
- API：`t(key: string, params?: Record<string, string | number>): string`（Svelte derived，自动响应 locale 变化）
- Key 命名：`<domain>.<module>.<purpose>`
  - `header.search.placeholder`
  - `editor.item.deleteConfirm`
  - `auth.login.title`
  - `error.network.offline`
- 数据层 i18n：`name`、`name_i18n: { en?: string }` 字段；显示时 `record.name_i18n?.[locale] ?? record.name`
- 切换 UI：Header `<LocaleToggle>`，icon: `语 / EN`
- **不引入** `svelte-i18n` / `i18next`

### 8.2 a11y（WCAG 2.1 AA）

- 所有交互元素 `<button type="button">`（清除现有 `<div on:click>`）
- Tab 顺序合理；可跳过 nav 区的 `Skip to content` 链接（visually hidden until focus）
- 键盘：Enter / Space 激活；Esc 关 dialog；Tab trap 在 dialog 内；`/` 聚焦搜索；`g` 进入 group quick switch（路线图）
- ARIA：search `role="searchbox"`、toggle `aria-pressed`、dialog `role="dialog" aria-modal="true" aria-labelledby`、toast `aria-live="polite" / assertive`
- 焦点环：`outline: 2px solid var(--c-accent); outline-offset: 2px;`，所有可聚焦元素可见
- 颜色对比：light + dark 主题分别确保 ≥ 4.5:1（normal text）/ 3:1（large text）
- `prefers-reduced-motion`：tokens 已处理（动效降为 0ms）

### 8.3 类型严格（双端）

- TypeScript：`strict: true`、`noUncheckedIndexedAccess: true`、零 `any`（用 `unknown` + 类型 narrowing）
- zod schema 单一源 → `z.infer` 出 TS 类型 → 后端 serde struct 手维护一致
- Rust：`#[deny(warnings)]`、clippy `-W clippy::pedantic`（合理放宽）
- API client：`apiClient<TRes>(method, path, body, resSchema): Promise<TRes>` —— **禁止裸 fetch**

### 8.4 错误处理边界

- 仅在 fetch / 表单 / 文件上传三处加显式错误处理
- 内部纯函数不写 try/catch；Rust handler 错误一律 `?` 返 `AppError`
- toast 系统：`info` / `success` / `warn` / `error`，aria-live polite/assertive
- 网络失败：retry button；连续 3 次失败 banner "无法连接服务"
- 401：自动弹 LoginDialog；登录后重试原请求

---

## 9. Migration + Docker + Dev Workflow

### 9.1 一次性数据迁移

- 前端 build stage 跑 `scripts/dump-bootstrap.mjs`（dynamic-import 当前 `src/lib/constants/{nav,siteInfo}.ts` 后 `JSON.stringify` 输出 `build/bootstrap.json`）
- Rust `build.rs` 把 stage 间拷贝过来的 `bootstrap.json` 通过 `include_str!("../bootstrap.json")` 编译期嵌入 binary
- `MigrationService::seed_if_empty()`：启动后检查 `sites + items` 为空 → 反序列化嵌入字符串 → 写入 SQLite
- 备案 / 站名 / avatar 路径进 `config` 表
- 默认 group（按用途预分；用户登录后可任意调整 / 合并 / 重命名）：
  - **网络 / Network** (`network`)：RouterOS / OpenWRT / K2P / qBittorrent / Jackett
  - **媒体 / Media** (`media`)：Jellyfin / Surveillance / 相册
  - **NAS / Storage** (`nas`)：Synology / 文件夹 / Nas Tools
  - **工具 / Tools** (`tools`)：Esxi / Home Assistant / 思源笔记 / 博客 / Portainer / 青龙
- 幂等：再次启动检测非空跳过；本 seed 一次性，重置数据需用户清空 volume

### 9.2 Docker（multi-stage）

```dockerfile
# ──── Stage 1: build frontend ────
FROM node:20-alpine AS web-build
WORKDIR /web
RUN corepack enable
COPY web/pnpm-lock.yaml web/package.json ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
COPY scripts/dump-bootstrap.mjs /scripts/dump-bootstrap.mjs
RUN pnpm build && \
    node /scripts/dump-bootstrap.mjs > build/bootstrap.json
# /web/build 含 SPA 资产 + bootstrap.json

# ──── Stage 2: build server ────
FROM rust:1.79-slim AS server-build
WORKDIR /server
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
# 缓存依赖层
COPY server/Cargo.toml server/Cargo.lock ./
RUN mkdir src && echo 'fn main(){}' > src/main.rs && \
    cargo build --release && \
    rm -rf src target/release/deps/lens* target/release/lens*
COPY server/ ./
COPY --from=web-build /web/build/bootstrap.json ./bootstrap.json
RUN cargo build --release

# ──── Stage 3: runtime ────
FROM gcr.io/distroless/cc-debian12
COPY --from=server-build /server/target/release/lens /usr/local/bin/lens
COPY --from=web-build    /web/build                   /app/static
ENV PORT=8080 DATA_DIR=/app/data STATIC_DIR=/app/static
VOLUME /app/data
EXPOSE 8080
USER nonroot
CMD ["lens"]
```

提供 `docker-compose.yml` sample：
- service `nav`（本镜像，端口 8080，volume `./data:/app/data`，env `BOOTSTRAP_ADMIN_PASSWORD`）
- service `caddy`（前置 TLS，反代 nav:8080）

### 9.3 目录结构（重构后）

> 仓库采用 **web/ + server/ 双子项目**：前端、后端各自自包含，根目录只放跨子项目资源（Dockerfile / docker-compose / docs / scripts / e2e tests / README）。**不**引入 pnpm/cargo workspace（YAGNI）。

```
lens/
├─ web/                                # SvelteKit 子项目（自包含）
│  ├─ package.json
│  ├─ pnpm-lock.yaml
│  ├─ svelte.config.js                 # adapter-static
│  ├─ vite.config.ts                   # dev proxy /api → :8080
│  ├─ tsconfig.json
│  ├─ static/                          # avatar.png / navIcons/*
│  └─ src/
│     ├─ app.html, app.scss, app.d.ts
│     ├─ routes/
│     │   ├─ +layout.svelte
│     │   ├─ +page.svelte
│     │   └─ +error.svelte
│     └─ lib/
│        ├─ api/client.ts              # apiClient + zod parse
│        ├─ design/tokens.scss
│        ├─ i18n/{store,en,zh}.ts
│        ├─ stores/{nav,uiPrefs,session,editMode,toast}.ts
│        ├─ types/nav.ts               # zod schemas + TS types
│        ├─ components/
│        │   ├─ ui/                    # design system primitives
│        │   ├─ Header/
│        │   ├─ Nav/
│        │   ├─ Edit/
│        │   └─ Footer.svelte
│        └─ utils/{isURL,fuzzy,debounce}
│
├─ server/                             # Rust crate（自包含）
│  ├─ Cargo.toml
│  ├─ Cargo.lock
│  ├─ build.rs
│  ├─ migrations/
│  │   └─ 0001_init.sql
│  └─ src/
│     ├─ main.rs
│     ├─ config.rs, error.rs
│     ├─ auth/{mod,middleware,password,session}.rs
│     ├─ cli.rs                        # reset-password / bootstrap-admin 子命令
│     ├─ routes/{mod,nav,items,groups,sites,tags,config,auth,favicon,health}.rs
│     ├─ repo/{mod,nav,config}.rs
│     └─ services/{mod,favicon,migration,bootstrap}.rs
│
├─ scripts/
│  └─ dump-bootstrap.mjs               # 把 web/ 旧常量转 bootstrap.json
├─ docs/superpowers/{specs,plans}/     # 设计 + 实施计划
├─ tests/                              # Playwright e2e（跨前后端）
│  └─ playwright.config.ts
│
├─ Dockerfile                          # multi-stage：web + server → distroless
├─ docker-compose.yml                  # sample（含 caddy 前置 TLS）
├─ .editorconfig
├─ .gitignore
├─ .dockerignore
└─ README.md
```

**职责边界**：
- `web/` 内一切命令以 `web/` 为 cwd（`pnpm i && pnpm dev/build/test`）
- `server/` 内一切命令以 `server/` 为 cwd（`cargo run / cargo test`）
- 根目录命令仅 `docker build` / `docker compose up` / `playwright test`
- 旧 repo 根的 `src/` `static/` `package.json` `pnpm-lock.yaml` `svelte.config.js` `vite.config.ts` `tsconfig.json` `playwright.config.js` `.eslintrc.cjs` `.eslintignore` `.prettierrc` `.prettierignore` 全部 `git mv` 进 `web/`（playwright 移到根 `tests/`）

### 9.4 Dev workflow

```bash
# Terminal A: 后端
cd server
cargo run                     # listens :8080, auto-migrates SQLite at ./dev-data/data.db

# Terminal B: 前端
cd web
pnpm dev                      # listens :5173, vite proxies /api → localhost:8080
```

### 9.5 部署运维

- `docker run -d --name nav -p 8080:8080 -v ./data:/app/data -e BOOTSTRAP_ADMIN_PASSWORD=changeme lens:latest`
- 改密码：UI 自助 / `docker exec -it nav lens reset-password`
- 备份：`rsync ./data /backup/nav/$(date +%F)/`
- 升级：`docker pull` + 重启容器；schema 自动迁移

---

## 10. Roadmap & Scope Discipline

### 10.1 路线图（**本期不做**）

| 项 | 推迟原因 |
|---|---|
| 多用户 / OAuth / SSO | 单管理员场景够用 |
| 操作日志 / 审计 | YAGNI |
| 实时多端同步（SSE / WS） | 个人站访问不大 |
| PWA / 离线 | 同上 |
| 健康检查（ping 链接） | 可后续 cron 跑 |
| 远端备份（git / S3） | 用户 cron rsync |
| 邮件密码重置 | CLI 替代 |
| 多产物 build | 用户已确认仅"区域切换" |
| `g` quick switch / cmd-K palette | 路线图候选 |

### 10.2 范围纪律（**不顺手做**）

- 不引入 Tailwind / DaisyUI / shadcn / 任何 UI 库
- 不引入 svelte-i18n / svelte-i18next
- 不引入 ORM 之外（仅 sqlx）
- 不写"防御性"`if (!x) return` 满天飞 —— TypeScript 严格 + Rust 类型已保证
- 不为假想未来需求加扩展点（如可插拔 DataProvider，已被实际架构吸收）
- 不重构未在本 spec 第 9 节登记的文件

### 10.3 已验收的核心决策（用户确认）

- [x] 后端：Rust + Axum + SQLite + tower-sessions
- [x] 部署：单 Docker 镜像、单进程、Rust 直接 serve 静态前端
- [x] 编辑形态：同页"编辑模式"（inline 拖拽 + 双击 + 右键菜单 + dialog）
- [x] 鉴权：单管理员密码 + bcrypt + signed cookie
- [x] 密码恢复：CLI 子命令 `lens reset-password`
- [x] UI：重建 design system 全新风格（不用 Tailwind）
- [x] Footer 重做
- [x] 数据范式：3NF（item × site 多对多 link 表，不用 JSON 列）
- [x] 多站点语义：增强现有"区域切换"（不做多用户 / 多产物）
- [x] 数据加载：runtime fetch（不打 build-time 注入）
- [x] i18n：自实现，前端 + 数据层双轨
- [x] 设计风格：**现代极简（Linear / Raycast 风格）**
- [x] Footer：主行 inline 备案 + 次行 Built-with + 英文 locale 隐藏中国大陆备案
- [x] Session TTL：**30 天 sliding**
- [x] Bootstrap 密码：env 优先；未设时生成随机密码写日志 + `INITIAL_PASSWORD.txt`，改密码后自动删
- [x] 默认分组：**网络 / 媒体 / NAS / 工具** 四组按用途预分

### 10.4 待 implement 阶段细化（不在本 spec 范围）

- 最终配色（accent 色值 / 中性色阶完整曲线）
- 字号 / 行高的精确阶梯
- 完整 keyboard shortcut 表
- favicon 缓存策略 TTL
- session SQLite 表清理 cron
- error code 体系
- Playwright 端到端测试覆盖矩阵

---

## 11. Open Questions（已全部按业界最佳实践拍板）

| # | 问题 | 决策 | 依据 |
|---|---|---|---|
| 1 | Design system 起点风格 | 现代极简（Linear / Raycast 风） | 工具属性 + 高频使用场景默认；信息密度友好；暗 / 亮主题易做 |
| 2 | Footer 设计 | 主行 inline 备案 + 次行 Built-with + 英文 locale 隐藏大陆备案 | ICP / 公安备案是大陆法规要求，对非中文用户无意义；分行减视觉噪声 |
| 3 | Session TTL | 30 天 sliding | GitHub 14d / Linear 90d 之间的工业默认；个人单管理员场景平衡摩擦与风险 |
| 4 | Bootstrap 密码 | env 优先；未设生成随机密码写日志 + 文件，修改后自动删除 | 参考 GitLab Omnibus / Postgres 镜像；safe-by-default 但不挡新手 |
| 5 | 默认分组 | 按用途预分 4 组（网络 / 媒体 / NAS / 工具） | 良好初始体验；结构是可改的，预设结构 ≫ 一锅烩 |

详见 §6.1 / §7.1 / §7.4 / §10.3 各节落定。
