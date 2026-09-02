# Frontend Foundation Implementation Plan (Plan 2 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the frontend foundation in `web/` — type-safe API client (zod-validated against backend NavBundle), self-implemented i18n (~150 lines, no library), modern-minimal design tokens with light/dark themes, and 10 UI primitives (Button / IconButton / Input / Dialog / Toast / Menu / Chip / Switch / Card / Skeleton). After this plan, a `/_demo` route shows every primitive in light/dark mode and verifies the toolchain end-to-end. **No nav data is rendered yet** — Plan 3 wires stores + Header/Footer/NavGrid on top of this foundation.

**Architecture:** Three orthogonal layers stacked under `src/lib/`:
1. **Types + API**: `types/nav.ts` defines zod schemas (single source of truth, `z.infer` for TS types); `api/client.ts` exports `apiClient<T>(method, path, body, schema)` that always validates responses.
2. **i18n**: `i18n/{en,zh}.json` flat key map + `i18n/store.ts` (locale `Writable` persisted to localStorage + `t()` derived). Keys follow `domain.module.purpose`.
3. **Design system**: `design/tokens.scss` (CSS custom properties for color/space/radius/type/shadow/motion in `:root` and `[data-theme="dark"]`); `design/theme.ts` (theme `Writable` + applies `data-theme` to `<html>`); UI primitives consume only tokens, never raw colors.

The 10 primitives live under `src/lib/components/ui/` and follow consistent contract: `<script lang="ts">` with `$props()`, slots/snippets via `{@render children()}`, all interactive elements are `<button>` (a11y-ready), all colors come from CSS variables.

**Tech Stack (already provisioned by Plan 1.5):** Svelte 5.1 · SvelteKit 2.8 · Vite 5.4 · TypeScript 5.6 · ESLint 9 flat · Prettier 3 · pnpm 10 · zod 3.23.

**Spec reference:** `docs/superpowers/specs/2026-05-19-rust-navigation-platform-design.md` § 4 (frontend state layout), § 7 (design system), § 8 (i18n + a11y + types + errors).

**Predecessors:**
- Plan 1 (Rust backend) — provides `/api/nav` etc.
- Plan 1.5 (Svelte 5 toolchain) — provides modern stack + zod dep.

**Successors:**
- Plan 3: stores + Header/Footer/NavGrid (consumes this plan's API client + i18n + tokens + primitives).
- Plan 4: edit mode (LoginDialog uses `Dialog`/`Input`/`Button`; ItemEditDialog same).
- Plan 5: scripts/dump-bootstrap, Dockerfile, Playwright e2e.

---

## Conventions

- **Working directory:** every `pnpm` command runs in `web/`.
- **Sub-branch:** `plan-2/frontend-foundation`, branched from `feat/rust-platform`.
- **Commits:** Conventional Commits, no `Co-Authored-By` trailer. Each task → one commit.
- **Verification gate:** every task ends with `pnpm check` (svelte-check) green or an explicit cargo-style smoke test.
- **TDD-lite:** tests exist for non-trivial logic (zod parsing, i18n `t()` interpolation, theme toggle persistence). Pure presentational components don't get unit tests in this plan — the demo route is their integration check.
- **a11y baseline:** every interactive primitive uses `<button>`, has visible focus ring, supports keyboard activation (Enter/Space).
- **Style isolation:** all component styles are scoped Svelte (`<style>` blocks, no `:global(...)` except in `tokens.scss`). Components reference CSS variables only.

---

## Color & Typography Tokens (locked in this plan)

These are the locked values used by all UI primitives. Subsequent plans (3/4) consume them as-is; design refinements are version-bumped via a new tokens commit, never inlined.

### Light theme (`:root`)

| Token | Value | Usage |
|---|---|---|
| `--c-bg` | `#fafaf9` | Page background |
| `--c-surface` | `#ffffff` | Cards, dialogs |
| `--c-surface-2` | `#f4f4f3` | Inset / elevated surface variant |
| `--c-border` | `#e5e5e3` | Hairlines, dividers |
| `--c-text` | `#1a1a18` | Primary text |
| `--c-text-2` | `#5a5a55` | Secondary / labels |
| `--c-text-3` | `#8a8a85` | Tertiary / placeholders |
| `--c-accent` | `#4f46e5` | Primary actions, focus ring |
| `--c-accent-hover` | `#4338ca` | Hover state for accent |
| `--c-accent-bg` | `#eef2ff` | Subtle accent surface |
| `--c-success` | `#047857` | Success toasts, confirmation |
| `--c-warn` | `#b45309` | Warnings |
| `--c-danger` | `#b91c1c` | Errors, destructive actions |
| `--c-danger-bg` | `#fef2f2` | Error surface |

### Dark theme (`[data-theme="dark"]`)

| Token | Value |
|---|---|
| `--c-bg` | `#0e0e0d` |
| `--c-surface` | `#18181a` |
| `--c-surface-2` | `#232326` |
| `--c-border` | `#2c2c30` |
| `--c-text` | `#f5f5f3` |
| `--c-text-2` | `#b5b5b0` |
| `--c-text-3` | `#767672` |
| `--c-accent` | `#818cf8` |
| `--c-accent-hover` | `#a5b4fc` |
| `--c-accent-bg` | `#1e1b4b` |
| `--c-success` | `#10b981` |
| `--c-warn` | `#f59e0b` |
| `--c-danger` | `#f87171` |
| `--c-danger-bg` | `#3f1d1d` |

### Spacing / Radius / Type / Shadow / Motion

| Group | Tokens |
|---|---|
| Spacing (4px base) | `--sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 24px; --sp-6: 32px; --sp-7: 48px; --sp-8: 64px;` |
| Radius | `--rd-sm: 6px; --rd-md: 10px; --rd-lg: 14px; --rd-pill: 999px;` |
| Font family | `--ft-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;` `--ft-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;` |
| Font sizes | `--fs-xs: 12px; --fs-sm: 13px; --fs-md: 15px; --fs-lg: 18px; --fs-xl: 24px;` |
| Weights | `--fw-regular: 400; --fw-medium: 500; --fw-semibold: 600;` |
| Line heights | `--lh-tight: 1.2; --lh-base: 1.5; --lh-loose: 1.7;` |
| Shadows light | `--sh-sm: 0 1px 2px rgba(0,0,0,0.04);` `--sh-md: 0 4px 12px rgba(0,0,0,0.06);` `--sh-lg: 0 12px 32px rgba(0,0,0,0.08);` |
| Shadows dark | overrides with rgba(0,0,0,0.4 / 0.45 / 0.5) |
| Motion | `--tr-fast: 120ms ease-out; --tr-base: 180ms ease-out; --tr-slow: 260ms ease-out;` |
| Reduced motion | `@media (prefers-reduced-motion: reduce) { :root { --tr-fast: 0ms; --tr-base: 0ms; --tr-slow: 0ms; } }` |

---

## Phase 0: Types + API Client (Tasks 1–3)

Goal: type-safe contract with the Plan 1 backend. zod schemas mirror NavBundle exactly; apiClient validates every response.

### Task 1: Zod schemas + TS types

**Files:**
- Create: `web/src/lib/types/nav.ts`

- [ ] **Step 1: Write the schemas**

Create `web/src/lib/types/nav.ts`:

```ts
import { z } from 'zod';

// Discriminator for icon source
export const IconKindSchema = z.enum(['asset', 'url', 'auto-favicon']);
export type IconKind = z.infer<typeof IconKindSchema>;

// Optional i18n map: { en?: string, ... }; preserved as raw JSON since locale set is open.
const I18nMap = z.record(z.string(), z.string()).nullable().optional();

export const SiteSchema = z.object({
  id: z.number().int(),
  value: z.string(),
  name: z.string(),
  nameI18n: I18nMap,
  sortOrder: z.number().int(),
  isDefault: z.boolean()
});
export type Site = z.infer<typeof SiteSchema>;

export const GroupSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  name: z.string(),
  nameI18n: I18nMap,
  sortOrder: z.number().int(),
  collapsedDefault: z.boolean()
});
export type Group = z.infer<typeof GroupSchema>;

export const TagSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  name: z.string(),
  nameI18n: I18nMap
});
export type Tag = z.infer<typeof TagSchema>;

export const ItemSchema = z.object({
  id: z.number().int(),
  groupId: z.number().int().nullable(),
  name: z.string(),
  nameI18n: I18nMap,
  description: z.string().nullable().optional(),
  descriptionI18n: I18nMap,
  iconKind: IconKindSchema,
  iconValue: z.string(),
  sortOrder: z.number().int(),
  links: z.record(z.string(), z.string()),
  tagSlugs: z.array(z.string()),
  createdAt: z.number().int(),
  updatedAt: z.number().int()
});
export type Item = z.infer<typeof ItemSchema>;

export const LinkSchema = z.object({
  text: z.string(),
  url: z.string().url()
});
export type Link = z.infer<typeof LinkSchema>;

export const MetaSchema = z.object({
  siteName: z.string(),
  siteAvatarPath: z.string().nullable().optional(),
  siteCopyright: z.string(),
  siteIcp: LinkSchema.nullable(),
  sitePolice: LinkSchema.nullable(),
  defaultTheme: z.enum(['system', 'light', 'dark'])
});
export type Meta = z.infer<typeof MetaSchema>;

export const NavBundleSchema = z.object({
  schemaVersion: z.literal(1),
  meta: MetaSchema,
  sites: z.array(SiteSchema),
  groups: z.array(GroupSchema),
  items: z.array(ItemSchema),
  tags: z.array(TagSchema)
});
export type NavBundle = z.infer<typeof NavBundleSchema>;

// Auth response
export const AuthMeSchema = z.object({ authenticated: z.boolean() });
export type AuthMe = z.infer<typeof AuthMeSchema>;

// Generic error envelope from backend (see server/src/error.rs)
export const ApiErrorBodySchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  fields: z.record(z.string(), z.string()).optional()
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
```

- [ ] **Step 2: Run svelte-check**

```bash
cd web
pnpm check 2>&1 | tail -10
cd ..
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/types/nav.ts
git commit -m "feat(web): zod schemas + TS types for NavBundle (camelCase, mirrors backend)"
```

### Task 2: `apiClient` with zod parse

**Files:**
- Create: `web/src/lib/api/client.ts`

- [ ] **Step 1: Write the client**

Create `web/src/lib/api/client.ts`:

```ts
import type { ZodSchema } from 'zod';
import { ApiErrorBodySchema, type ApiErrorBody } from '$lib/types/nav';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message ?? body.error);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error;
    this.fields = body.fields;
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface ApiCallOptions<TRes> {
  method: Method;
  path: string;
  body?: unknown;
  responseSchema?: ZodSchema<TRes>;
  signal?: AbortSignal;
}

export async function apiClient<TRes = void>(opts: ApiCallOptions<TRes>): Promise<TRes> {
  const { method, path, body, responseSchema, signal } = opts;
  const headers: Record<string, string> = {};
  let serializedBody: BodyInit | undefined;

  if (body !== undefined) {
    if (body instanceof FormData) {
      serializedBody = body; // multipart upload
    } else {
      headers['Content-Type'] = 'application/json';
      serializedBody = JSON.stringify(body);
    }
  }

  const res = await fetch(path, {
    method,
    headers,
    body: serializedBody,
    credentials: 'same-origin',
    signal
  });

  if (!res.ok) {
    let errBody: ApiErrorBody = { error: 'unknown', message: res.statusText };
    try {
      const json = await res.json();
      const parsed = ApiErrorBodySchema.safeParse(json);
      if (parsed.success) errBody = parsed.data;
    } catch {
      // body wasn't JSON — keep statusText fallback
    }
    throw new ApiError(res.status, errBody);
  }

  // 204 No Content
  if (res.status === 204) {
    return undefined as TRes;
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const json: unknown = await res.json();
    if (responseSchema) {
      const parsed = responseSchema.safeParse(json);
      if (!parsed.success) {
        throw new ApiError(res.status, {
          error: 'schema_mismatch',
          message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        });
      }
      return parsed.data;
    }
    return json as TRes;
  }

  // Non-JSON success (e.g. /api/favicon returning image/*) — return raw response is the caller's job
  return res as unknown as TRes;
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd web
pnpm check 2>&1 | tail -5
cd ..
```

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/api/client.ts
git commit -m "feat(web): apiClient with zod response validation + ApiError"
```

### Task 3: API client smoke test

**Files:**
- Create: `web/src/lib/api/client.test.ts`
- Modify: `web/package.json` (add vitest)

- [ ] **Step 1: Add Vitest to dev dependencies**

```bash
cd web
pnpm add -D vitest@^2.1.0 @vitest/ui@^2.1.0
cd ..
```

- [ ] **Step 2: Update `package.json` scripts**

Read current scripts; add a `test:unit` line:

```json
"scripts": {
  "dev": "vite dev",
  "build": "vite build",
  "preview": "vite preview",
  "test": "playwright test",
  "test:unit": "vitest run",
  "test:unit:watch": "vitest",
  "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
  "check:watch": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
  "lint": "prettier --check . && eslint .",
  "format": "prettier --write ."
}
```

- [ ] **Step 3: Write the test**

Create `web/src/lib/api/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { apiClient, ApiError } from './client';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

const SampleSchema = z.object({ ok: z.literal(true), n: z.number() });

describe('apiClient', () => {
  it('parses JSON success against schema', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, n: 42 }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    const out = await apiClient({
      method: 'GET',
      path: '/api/sample',
      responseSchema: SampleSchema
    });
    expect(out).toEqual({ ok: true, n: 42 });
  });

  it('throws ApiError on schema mismatch', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    await expect(
      apiClient({ method: 'GET', path: '/api/sample', responseSchema: SampleSchema })
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiError on non-2xx with backend error envelope', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'unauthenticated' }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      })
    );
    await expect(
      apiClient({ method: 'GET', path: '/api/sample' })
    ).rejects.toMatchObject({ status: 401, code: 'unauthenticated' });
  });

  it('returns undefined on 204', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const out = await apiClient({ method: 'POST', path: '/api/logout' });
    expect(out).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run**

```bash
cd web
pnpm test:unit 2>&1 | tail -20
cd ..
```

Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/pnpm-lock.yaml web/src/lib/api/client.test.ts
git commit -m "test(web): apiClient unit tests (vitest); 4 tests pass"
```

---

## Phase 1: i18n (Tasks 4–6)

Goal: minimal i18n with no library dep. Locale persisted to localStorage; `t()` interpolates `{{name}}` placeholders.

### Task 4: Locale dictionaries

**Files:**
- Create: `web/src/lib/i18n/zh.json`
- Create: `web/src/lib/i18n/en.json`

- [ ] **Step 1: Write the Chinese dictionary**

Create `web/src/lib/i18n/zh.json`:

```json
{
  "common.save": "保存",
  "common.cancel": "取消",
  "common.delete": "删除",
  "common.edit": "编辑",
  "common.close": "关闭",
  "common.confirm": "确认",
  "common.loading": "加载中…",

  "header.search.placeholder": "搜索…（按 / 聚焦）",
  "header.theme.toggle": "切换主题",
  "header.locale.toggle": "切换语言",
  "header.login": "登录",
  "header.logout": "登出",
  "header.editMode.enter": "编辑",
  "header.editMode.exit": "退出编辑",

  "auth.login.title": "登录",
  "auth.login.password": "管理员密码",
  "auth.login.submit": "登录",
  "auth.login.error.bad_password": "密码错误",
  "auth.login.error.rate_limited": "尝试过于频繁，稍后再试",

  "editor.item.deleteConfirm": "确认删除「{{name}}」？",
  "editor.item.new": "新建导航项",

  "error.network.offline": "无法连接服务",
  "error.network.retry": "重试",
  "error.unknown": "发生未知错误"
}
```

- [ ] **Step 2: Write the English dictionary**

Create `web/src/lib/i18n/en.json`:

```json
{
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.close": "Close",
  "common.confirm": "Confirm",
  "common.loading": "Loading…",

  "header.search.placeholder": "Search… (press / to focus)",
  "header.theme.toggle": "Toggle theme",
  "header.locale.toggle": "Toggle language",
  "header.login": "Log in",
  "header.logout": "Log out",
  "header.editMode.enter": "Edit",
  "header.editMode.exit": "Exit edit",

  "auth.login.title": "Sign in",
  "auth.login.password": "Admin password",
  "auth.login.submit": "Sign in",
  "auth.login.error.bad_password": "Wrong password",
  "auth.login.error.rate_limited": "Too many attempts, try again later",

  "editor.item.deleteConfirm": "Delete \"{{name}}\"?",
  "editor.item.new": "New nav item",

  "error.network.offline": "Cannot reach server",
  "error.network.retry": "Retry",
  "error.unknown": "Unknown error"
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/i18n/zh.json web/src/lib/i18n/en.json
git commit -m "feat(web): i18n dictionaries (zh + en) with flat domain.module.purpose keys"
```

### Task 5: Locale store + `t()`

**Files:**
- Create: `web/src/lib/i18n/store.ts`

- [ ] **Step 1: Write the store + `t()` derivation**

Create `web/src/lib/i18n/store.ts`:

```ts
import { writable, derived, get, type Readable } from 'svelte/store';
import { browser } from '$app/environment';
import zh from './zh.json';
import en from './en.json';

export type Locale = 'zh' | 'en';

const DICTIONARIES: Record<Locale, Record<string, string>> = { zh, en };

const LS_KEY = 'navsite.locale';

function detectInitial(): Locale {
  if (!browser) return 'zh';
  const stored = localStorage.getItem(LS_KEY);
  if (stored === 'zh' || stored === 'en') return stored;
  const navLang = navigator.language?.toLowerCase() ?? '';
  return navLang.startsWith('zh') ? 'zh' : 'en';
}

export const localeStore = writable<Locale>(detectInitial());

if (browser) {
  localeStore.subscribe((v) => {
    try { localStorage.setItem(LS_KEY, v); } catch { /* private mode etc. */ }
  });
}

/**
 * Reactive translator.
 *
 * Usage in Svelte:
 *   <script>import { t } from '$lib/i18n/store'; </script>
 *   <button>{$t('common.save')}</button>
 *   <p>{$t('editor.item.deleteConfirm', { name: 'RouterOS' })}</p>
 *
 * Falls back to the key itself if missing in the active locale.
 */
export const t: Readable<(key: string, params?: Record<string, string | number>) => string> =
  derived(localeStore, ($loc) => {
    const dict = DICTIONARIES[$loc];
    return (key: string, params?: Record<string, string | number>) => {
      const raw = dict[key] ?? key;
      if (!params) return raw;
      return raw.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) =>
        String(params[name] ?? `{{${name}}}`)
      );
    };
  });

/** Imperative form for non-Svelte contexts. */
export function tNow(key: string, params?: Record<string, string | number>): string {
  return get(t)(key, params);
}

export function setLocale(loc: Locale) {
  localeStore.set(loc);
}

export function toggleLocale() {
  localeStore.update((v) => (v === 'zh' ? 'en' : 'zh'));
}
```

- [ ] **Step 2: Verify**

```bash
cd web
pnpm check 2>&1 | tail -5
cd ..
```

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/i18n/store.ts
git commit -m "feat(web): i18n store with t() reactive translator (~80 lines, no library)"
```

### Task 6: i18n unit tests

**Files:**
- Create: `web/src/lib/i18n/store.test.ts`

- [ ] **Step 1: Write tests**

```ts
// web/src/lib/i18n/store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { localeStore, t, setLocale, toggleLocale, tNow } from './store';

describe('i18n', () => {
  beforeEach(() => {
    setLocale('zh');
  });

  it('translates a known key', () => {
    expect(get(t)('common.save')).toBe('保存');
  });

  it('falls back to the key when missing', () => {
    expect(get(t)('does.not.exist')).toBe('does.not.exist');
  });

  it('switches locale', () => {
    setLocale('en');
    expect(get(t)('common.save')).toBe('Save');
  });

  it('toggles between zh and en', () => {
    expect(get(localeStore)).toBe('zh');
    toggleLocale();
    expect(get(localeStore)).toBe('en');
    toggleLocale();
    expect(get(localeStore)).toBe('zh');
  });

  it('interpolates {{name}} placeholders', () => {
    setLocale('en');
    expect(get(t)('editor.item.deleteConfirm', { name: 'RouterOS' })).toBe('Delete "RouterOS"?');
  });

  it('leaves unknown placeholders intact', () => {
    setLocale('en');
    const out = get(t)('editor.item.deleteConfirm', {} as Record<string, string>);
    expect(out).toContain('{{name}}');
  });

  it('tNow imperative form works', () => {
    expect(tNow('common.save')).toBe('保存');
  });
});
```

- [ ] **Step 2: Run**

```bash
cd web
pnpm test:unit 2>&1 | tail -20
cd ..
```

Expected: 4 (apiClient) + 7 (i18n) = 11 PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/i18n/store.test.ts
git commit -m "test(web): i18n store unit tests (7 tests pass)"
```

---

## Phase 2: Design Tokens + Theme (Tasks 7–9)

### Task 7: `tokens.scss`

**Files:**
- Create: `web/src/lib/design/tokens.scss`
- Modify: `web/src/app.scss` (import tokens)

- [ ] **Step 1: Write tokens.scss with full token set from spec § 7.2 (locked values from this plan's "Color & Typography Tokens" section)**

```scss
// web/src/lib/design/tokens.scss

/* Modern minimal tokens — Linear / Raycast inspired.
 * Light is :root default; data-theme="dark" overrides.
 * Dark mode auto-applies via prefers-color-scheme unless user toggle set.
 */

:root {
  /* Spacing — 4px base */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 24px;
  --sp-6: 32px;
  --sp-7: 48px;
  --sp-8: 64px;

  /* Radius */
  --rd-sm: 6px;
  --rd-md: 10px;
  --rd-lg: 14px;
  --rd-pill: 999px;

  /* Type */
  --ft-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  --ft-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
  --fs-xs: 12px;
  --fs-sm: 13px;
  --fs-md: 15px;
  --fs-lg: 18px;
  --fs-xl: 24px;
  --fw-regular: 400;
  --fw-medium: 500;
  --fw-semibold: 600;
  --lh-tight: 1.2;
  --lh-base: 1.5;
  --lh-loose: 1.7;

  /* Color (light) */
  --c-bg: #fafaf9;
  --c-surface: #ffffff;
  --c-surface-2: #f4f4f3;
  --c-border: #e5e5e3;
  --c-text: #1a1a18;
  --c-text-2: #5a5a55;
  --c-text-3: #8a8a85;
  --c-accent: #4f46e5;
  --c-accent-hover: #4338ca;
  --c-accent-bg: #eef2ff;
  --c-success: #047857;
  --c-warn: #b45309;
  --c-danger: #b91c1c;
  --c-danger-bg: #fef2f2;

  /* Shadow (light) */
  --sh-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
  --sh-md: 0 4px 12px rgba(0, 0, 0, 0.06);
  --sh-lg: 0 12px 32px rgba(0, 0, 0, 0.08);

  /* Motion */
  --tr-fast: 120ms ease-out;
  --tr-base: 180ms ease-out;
  --tr-slow: 260ms ease-out;
}

[data-theme='dark'] {
  --c-bg: #0e0e0d;
  --c-surface: #18181a;
  --c-surface-2: #232326;
  --c-border: #2c2c30;
  --c-text: #f5f5f3;
  --c-text-2: #b5b5b0;
  --c-text-3: #767672;
  --c-accent: #818cf8;
  --c-accent-hover: #a5b4fc;
  --c-accent-bg: #1e1b4b;
  --c-success: #10b981;
  --c-warn: #f59e0b;
  --c-danger: #f87171;
  --c-danger-bg: #3f1d1d;

  --sh-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --sh-md: 0 4px 12px rgba(0, 0, 0, 0.45);
  --sh-lg: 0 12px 32px rgba(0, 0, 0, 0.5);
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --tr-fast: 0ms;
    --tr-base: 0ms;
    --tr-slow: 0ms;
  }
}

/* App-level resets that depend on tokens */
html,
body {
  background: var(--c-bg);
  color: var(--c-text);
  font-family: var(--ft-sans);
  font-size: var(--fs-md);
  line-height: var(--lh-base);
}

*:focus-visible {
  outline: 2px solid var(--c-accent);
  outline-offset: 2px;
  border-radius: var(--rd-sm);
}
```

- [ ] **Step 2: Update `web/src/app.scss` to import tokens at the top**

Read current app.scss first. Then prepend:

```scss
@use '$lib/design/tokens.scss';

/* (existing app.scss contents preserved below) */
```

If `app.scss` already imports something like the old gradient-based palette, **leave the old file blocks intact** (they style the legacy components which Plan 3 will replace). The token import goes first so token vars are available globally.

- [ ] **Step 3: svelte-check + dev smoke**

```bash
cd web
pnpm check 2>&1 | tail -5
pnpm dev --host 127.0.0.1 --port 5173 > /tmp/web-tokens.log 2>&1 &
DEV_PID=$!
sleep 8
curl -sf http://127.0.0.1:5173/ -o /dev/null && echo "dev OK"
kill $DEV_PID 2>/dev/null
cd ..
```

Expected: check 0 errors, dev OK.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/design/tokens.scss web/src/app.scss
git commit -m "feat(web): design tokens (light + dark + reduced-motion) imported globally"
```

### Task 8: Theme store

**Files:**
- Create: `web/src/lib/design/theme.ts`

- [ ] **Step 1: Write store**

```ts
// web/src/lib/design/theme.ts
import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

export type ThemeMode = 'system' | 'light' | 'dark';

const LS_KEY = 'navsite.theme';

function detectStored(): ThemeMode {
  if (!browser) return 'system';
  const v = localStorage.getItem(LS_KEY);
  if (v === 'light' || v === 'dark' || v === 'system') return v;
  return 'system';
}

function resolveActual(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  if (browser && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

function applyToDOM(actual: 'light' | 'dark') {
  if (!browser) return;
  document.documentElement.setAttribute('data-theme', actual);
}

export const themeStore = writable<ThemeMode>(detectStored());

if (browser) {
  // Apply on subscribe + persist
  themeStore.subscribe((mode) => {
    applyToDOM(resolveActual(mode));
    try { localStorage.setItem(LS_KEY, mode); } catch { /* private mode */ }
  });

  // React to system changes when in 'system' mode
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemChange = () => {
    if (get(themeStore) === 'system') applyToDOM(resolveActual('system'));
  };
  mql.addEventListener('change', onSystemChange);
}

export function setTheme(m: ThemeMode) {
  themeStore.set(m);
}

/**
 * Cycle: system → light → dark → system.
 * Useful for a single ThemeToggle button.
 */
export function cycleTheme() {
  themeStore.update((v) => (v === 'system' ? 'light' : v === 'light' ? 'dark' : 'system'));
}
```

- [ ] **Step 2: Verify**

```bash
cd web
pnpm check 2>&1 | tail -5
cd ..
```

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/design/theme.ts
git commit -m "feat(web): theme store (system/light/dark) with localStorage + matchMedia"
```

### Task 9: Wire theme into +layout.svelte

**Files:**
- Modify: `web/src/routes/+layout.svelte`

- [ ] **Step 1: Import the theme store so it gets initialized once on app boot**

Read current `+layout.svelte`. Add `import '$lib/design/theme';` to the script imports — this is enough; the module's top-level code subscribes to itself and applies `data-theme` to `<html>`.

The full `<script lang="ts">` should look like:

```svelte
<script lang="ts">
  import Header from '$lib/components/Header.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import '$lib/design/theme'; // Initializes data-theme on <html>
  import '../app.scss';

  let { children } = $props();
</script>
```

(`<main>{@render children()}</main>` etc. unchanged.)

- [ ] **Step 2: Smoke test theme toggling manually via DevTools console**

```bash
cd web
pnpm dev --host 127.0.0.1 --port 5173 > /tmp/web-theme.log 2>&1 &
DEV_PID=$!
sleep 8
curl -sf http://127.0.0.1:5173/ | grep -oE 'data-theme="[^"]*"' | head -1 || echo "(data-theme attr not in initial HTML; that's expected — it's set client-side after JS runs)"
kill $DEV_PID 2>/dev/null
cd ..
```

The smoke test only verifies the page boots. Theme is applied client-side after JS hydration; checking the attr server-side won't show it. Phase 4's demo route exercises the toggle properly.

- [ ] **Step 3: Commit**

```bash
git add web/src/routes/+layout.svelte
git commit -m "feat(web): initialize theme store from +layout.svelte (sets data-theme on <html>)"
```

---

## Phase 3: UI Primitives (Tasks 10–19)

Goal: 10 reusable primitives. Each is one file under `web/src/lib/components/ui/`. All consume tokens; none hardcode colors. All interactive primitives are `<button>`-based or `<input>`-based with proper aria.

### Task 10: Button.svelte

**Files:**
- Create: `web/src/lib/components/ui/Button.svelte`

- [ ] **Step 1: Write component**

```svelte
<!-- web/src/lib/components/ui/Button.svelte -->
<script lang="ts">
  type Intent = 'primary' | 'secondary' | 'ghost' | 'danger';
  type Size = 'sm' | 'md' | 'lg';

  interface Props {
    intent?: Intent;
    size?: Size;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    loading?: boolean;
    fullWidth?: boolean;
    onclick?: (e: MouseEvent) => void;
    children?: import('svelte').Snippet;
  }

  let {
    intent = 'primary',
    size = 'md',
    type = 'button',
    disabled = false,
    loading = false,
    fullWidth = false,
    onclick,
    children
  }: Props = $props();
</script>

<button
  {type}
  class="btn intent-{intent} size-{size}"
  class:full-width={fullWidth}
  class:loading
  disabled={disabled || loading}
  {onclick}
>
  {#if children}{@render children()}{/if}
</button>

<style lang="scss">
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    padding: 0 var(--sp-4);
    border: 1px solid transparent;
    border-radius: var(--rd-md);
    font-family: var(--ft-sans);
    font-weight: var(--fw-medium);
    line-height: 1;
    cursor: pointer;
    transition: background var(--tr-fast), border-color var(--tr-fast), color var(--tr-fast),
      box-shadow var(--tr-fast);
    user-select: none;

    &:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    &.full-width {
      width: 100%;
    }

    &.loading {
      cursor: progress;
    }
  }

  .size-sm {
    height: 28px;
    font-size: var(--fs-sm);
    padding: 0 var(--sp-3);
  }

  .size-md {
    height: 36px;
    font-size: var(--fs-md);
  }

  .size-lg {
    height: 44px;
    font-size: var(--fs-md);
    padding: 0 var(--sp-5);
  }

  .intent-primary {
    background: var(--c-accent);
    color: white;

    &:hover:not(:disabled) {
      background: var(--c-accent-hover);
    }
  }

  .intent-secondary {
    background: var(--c-surface);
    color: var(--c-text);
    border-color: var(--c-border);

    &:hover:not(:disabled) {
      background: var(--c-surface-2);
    }
  }

  .intent-ghost {
    background: transparent;
    color: var(--c-text);

    &:hover:not(:disabled) {
      background: var(--c-surface-2);
    }
  }

  .intent-danger {
    background: var(--c-danger);
    color: white;

    &:hover:not(:disabled) {
      filter: brightness(1.05);
    }
  }
</style>
```

- [ ] **Step 2: Verify** with svelte-check; no test (visual is demo route).

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/components/ui/Button.svelte
git commit -m "feat(web): Button primitive (4 intents x 3 sizes, token-driven)"
```

### Task 11: IconButton.svelte

**Files:**
- Create: `web/src/lib/components/ui/IconButton.svelte`

```svelte
<!-- web/src/lib/components/ui/IconButton.svelte -->
<script lang="ts">
  interface Props {
    label: string; // aria-label, required (icon-only button)
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    size?: 'sm' | 'md' | 'lg';
    intent?: 'ghost' | 'subtle';
    onclick?: (e: MouseEvent) => void;
    children?: import('svelte').Snippet;
  }

  let {
    label,
    type = 'button',
    disabled = false,
    size = 'md',
    intent = 'ghost',
    onclick,
    children
  }: Props = $props();
</script>

<button
  {type}
  aria-label={label}
  title={label}
  class="icon-btn size-{size} intent-{intent}"
  {disabled}
  {onclick}
>
  {#if children}{@render children()}{/if}
</button>

<style lang="scss">
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: var(--rd-md);
    cursor: pointer;
    color: var(--c-text-2);
    transition: background var(--tr-fast), color var(--tr-fast);

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &:hover:not(:disabled) {
      color: var(--c-text);
    }
  }

  .size-sm {
    width: 28px;
    height: 28px;
  }

  .size-md {
    width: 36px;
    height: 36px;
  }

  .size-lg {
    width: 44px;
    height: 44px;
  }

  .intent-ghost {
    background: transparent;

    &:hover:not(:disabled) {
      background: var(--c-surface-2);
    }
  }

  .intent-subtle {
    background: var(--c-surface-2);

    &:hover:not(:disabled) {
      background: var(--c-border);
    }
  }
</style>
```

Commit: `feat(web): IconButton primitive (icon-only, aria-label required)`

### Task 12: Input.svelte

**Files:**
- Create: `web/src/lib/components/ui/Input.svelte`

```svelte
<!-- web/src/lib/components/ui/Input.svelte -->
<script lang="ts">
  interface Props {
    value?: string;
    type?: 'text' | 'password' | 'email' | 'search' | 'url';
    placeholder?: string;
    disabled?: boolean;
    invalid?: boolean;
    helpText?: string;
    errorText?: string;
    label?: string;
    id?: string;
    name?: string;
    autocomplete?: string;
    fullWidth?: boolean;
    leadingIcon?: import('svelte').Snippet;
    oninput?: (e: Event) => void;
    onchange?: (e: Event) => void;
  }

  let {
    value = $bindable(''),
    type = 'text',
    placeholder,
    disabled = false,
    invalid = false,
    helpText,
    errorText,
    label,
    id,
    name,
    autocomplete,
    fullWidth = true,
    leadingIcon,
    oninput,
    onchange
  }: Props = $props();

  const inputId = $derived(id ?? `inp-${Math.random().toString(36).slice(2, 9)}`);
  const showError = $derived(invalid && !!errorText);
</script>

<div class="field" class:full-width={fullWidth}>
  {#if label}<label class="label" for={inputId}>{label}</label>{/if}
  <div class="control" class:invalid={invalid}>
    {#if leadingIcon}
      <span class="leading">{@render leadingIcon()}</span>
    {/if}
    <input
      id={inputId}
      {type}
      {placeholder}
      {disabled}
      {name}
      {autocomplete}
      bind:value
      {oninput}
      {onchange}
      aria-invalid={invalid}
      aria-describedby={showError ? `${inputId}-err` : helpText ? `${inputId}-help` : undefined}
    />
  </div>
  {#if showError}
    <p id="{inputId}-err" class="error">{errorText}</p>
  {:else if helpText}
    <p id="{inputId}-help" class="help">{helpText}</p>
  {/if}
</div>

<style lang="scss">
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);

    &.full-width {
      width: 100%;
    }
  }

  .label {
    font-size: var(--fs-sm);
    font-weight: var(--fw-medium);
    color: var(--c-text-2);
  }

  .control {
    display: flex;
    align-items: center;
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--rd-md);
    transition: border-color var(--tr-fast), box-shadow var(--tr-fast);

    &:focus-within {
      border-color: var(--c-accent);
      box-shadow: 0 0 0 3px var(--c-accent-bg);
    }

    &.invalid {
      border-color: var(--c-danger);

      &:focus-within {
        box-shadow: 0 0 0 3px var(--c-danger-bg);
      }
    }
  }

  .leading {
    display: inline-flex;
    align-items: center;
    padding: 0 var(--sp-2) 0 var(--sp-3);
    color: var(--c-text-3);
  }

  input {
    flex: 1;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--c-text);
    padding: 0 var(--sp-3);
    height: 36px;
    font-size: var(--fs-md);
    font-family: inherit;

    &::placeholder {
      color: var(--c-text-3);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  .help {
    font-size: var(--fs-xs);
    color: var(--c-text-3);
    margin: 0;
  }

  .error {
    font-size: var(--fs-xs);
    color: var(--c-danger);
    margin: 0;
  }
</style>
```

Commit: `feat(web): Input primitive ($bindable value, label/help/error/icon)`

### Task 13: Dialog.svelte

**Files:**
- Create: `web/src/lib/components/ui/Dialog.svelte`

```svelte
<!-- web/src/lib/components/ui/Dialog.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    open: boolean;
    title?: string;
    description?: string;
    width?: 'sm' | 'md' | 'lg';
    onClose?: () => void;
    children?: import('svelte').Snippet;
    footer?: import('svelte').Snippet;
  }

  let { open = $bindable(false), title, description, width = 'md', onClose, children, footer }: Props = $props();

  let dialogEl: HTMLDivElement | undefined = $state();

  function close() {
    open = false;
    onClose?.();
  }

  function onBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function onKey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  }

  $effect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Initial focus on first focusable child
    requestAnimationFrame(() => {
      const target = dialogEl?.querySelector<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
      );
      target?.focus();
    });
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  });
</script>

<svelte:window onkeydown={onKey} />

{#if open}
  <div
    class="backdrop"
    role="presentation"
    onclick={onBackdropClick}
    onkeydown={() => {}}
    aria-hidden="false"
  >
    <div
      bind:this={dialogEl}
      class="dialog width-{width}"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'dialog-title' : undefined}
      aria-describedby={description ? 'dialog-desc' : undefined}
    >
      {#if title}
        <header class="header">
          <h2 id="dialog-title" class="title">{title}</h2>
          {#if description}<p id="dialog-desc" class="desc">{description}</p>{/if}
        </header>
      {/if}
      <div class="body">
        {#if children}{@render children()}{/if}
      </div>
      {#if footer}
        <footer class="footer">{@render footer()}</footer>
      {/if}
    </div>
  </div>
{/if}

<style lang="scss">
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--sp-4);
  }

  .dialog {
    background: var(--c-surface);
    color: var(--c-text);
    border: 1px solid var(--c-border);
    border-radius: var(--rd-lg);
    box-shadow: var(--sh-lg);
    width: 100%;
    max-height: calc(100vh - var(--sp-8));
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .width-sm {
    max-width: 360px;
  }
  .width-md {
    max-width: 520px;
  }
  .width-lg {
    max-width: 720px;
  }

  .header {
    padding: var(--sp-5) var(--sp-5) var(--sp-3);
    border-bottom: 1px solid var(--c-border);
  }

  .title {
    margin: 0;
    font-size: var(--fs-lg);
    font-weight: var(--fw-semibold);
  }

  .desc {
    margin: var(--sp-1) 0 0;
    color: var(--c-text-2);
    font-size: var(--fs-sm);
  }

  .body {
    padding: var(--sp-5);
    overflow-y: auto;
  }

  .footer {
    padding: var(--sp-3) var(--sp-5);
    border-top: 1px solid var(--c-border);
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-2);
    background: var(--c-surface-2);
  }
</style>
```

Commit: `feat(web): Dialog primitive (modal, focus trap-init, Escape, body scroll-lock)`

### Task 14: Toast.svelte + ToastViewport + toastStore

**Files:**
- Create: `web/src/lib/components/ui/toast.ts` (store)
- Create: `web/src/lib/components/ui/Toast.svelte`
- Create: `web/src/lib/components/ui/ToastViewport.svelte`

- [ ] **Step 1: Toast store**

```ts
// web/src/lib/components/ui/toast.ts
import { writable } from 'svelte/store';

export type ToastIntent = 'info' | 'success' | 'warn' | 'error';

export interface ToastEntry {
  id: number;
  intent: ToastIntent;
  message: string;
  durationMs: number;
}

let nextId = 1;
const _toasts = writable<ToastEntry[]>([]);

export const toasts = { subscribe: _toasts.subscribe };

function push(intent: ToastIntent, message: string, durationMs = 4000): number {
  const id = nextId++;
  _toasts.update((list) => [...list, { id, intent, message, durationMs }]);
  if (durationMs > 0) setTimeout(() => dismiss(id), durationMs);
  return id;
}

export function dismiss(id: number) {
  _toasts.update((list) => list.filter((t) => t.id !== id));
}

export const toast = {
  info: (msg: string, ms?: number) => push('info', msg, ms),
  success: (msg: string, ms?: number) => push('success', msg, ms),
  warn: (msg: string, ms?: number) => push('warn', msg, ms),
  error: (msg: string, ms?: number) => push('error', msg, ms ?? 6000)
};
```

- [ ] **Step 2: Toast.svelte (single toast item)**

```svelte
<!-- web/src/lib/components/ui/Toast.svelte -->
<script lang="ts">
  import { dismiss, type ToastIntent } from './toast';

  interface Props {
    id: number;
    intent: ToastIntent;
    message: string;
  }

  let { id, intent, message }: Props = $props();
</script>

<div class="toast intent-{intent}" role="status">
  <span class="msg">{message}</span>
  <button class="x" aria-label="Close" onclick={() => dismiss(id)}>×</button>
</div>

<style lang="scss">
  .toast {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-4);
    background: var(--c-surface);
    color: var(--c-text);
    border: 1px solid var(--c-border);
    border-radius: var(--rd-md);
    box-shadow: var(--sh-md);
    min-width: 280px;
    max-width: 420px;
  }

  .intent-success {
    border-left: 3px solid var(--c-success);
  }
  .intent-info {
    border-left: 3px solid var(--c-accent);
  }
  .intent-warn {
    border-left: 3px solid var(--c-warn);
  }
  .intent-error {
    border-left: 3px solid var(--c-danger);
  }

  .msg {
    flex: 1;
    font-size: var(--fs-sm);
    line-height: var(--lh-base);
  }

  .x {
    width: 24px;
    height: 24px;
    border: 0;
    background: transparent;
    color: var(--c-text-3);
    font-size: var(--fs-lg);
    line-height: 1;
    cursor: pointer;
    border-radius: var(--rd-sm);

    &:hover {
      background: var(--c-surface-2);
      color: var(--c-text);
    }
  }
</style>
```

- [ ] **Step 3: ToastViewport.svelte (mounts at app root)**

```svelte
<!-- web/src/lib/components/ui/ToastViewport.svelte -->
<script lang="ts">
  import { toasts } from './toast';
  import Toast from './Toast.svelte';
</script>

<aside class="viewport" aria-live="polite" aria-relevant="additions">
  {#each $toasts as t (t.id)}
    <Toast id={t.id} intent={t.intent} message={t.message} />
  {/each}
</aside>

<style lang="scss">
  .viewport {
    position: fixed;
    top: var(--sp-4);
    right: var(--sp-4);
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    z-index: 1100;
    pointer-events: none;

    > :global(*) {
      pointer-events: auto;
    }
  }
</style>
```

Commit: `feat(web): Toast primitive (4 intents, aria-live polite, dismissible)`

### Task 15: Menu.svelte (context menu)

**Files:**
- Create: `web/src/lib/components/ui/Menu.svelte`

```svelte
<!-- web/src/lib/components/ui/Menu.svelte -->
<script lang="ts">
  interface MenuItem {
    label: string;
    onSelect: () => void;
    disabled?: boolean;
    intent?: 'default' | 'danger';
  }

  interface Props {
    open: boolean;
    x: number; // viewport coords
    y: number;
    items: MenuItem[];
    onClose?: () => void;
  }

  let { open = $bindable(false), x, y, items, onClose }: Props = $props();

  let menuEl: HTMLDivElement | undefined = $state();
  let focusedIdx = $state(0);

  function close() {
    open = false;
    onClose?.();
  }

  function onSelect(i: number) {
    const it = items[i];
    if (!it || it.disabled) return;
    it.onSelect();
    close();
  }

  function onKey(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedIdx = Math.min(focusedIdx + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedIdx = Math.max(focusedIdx - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onSelect(focusedIdx);
    }
  }

  $effect(() => {
    if (!open) return;
    focusedIdx = 0;
    requestAnimationFrame(() => menuEl?.focus());
  });

  function onWindowClick(e: MouseEvent) {
    if (!open || !menuEl) return;
    if (!menuEl.contains(e.target as Node)) close();
  }
</script>

<svelte:window onkeydown={onKey} onclick={onWindowClick} />

{#if open}
  <div
    bind:this={menuEl}
    class="menu"
    role="menu"
    tabindex="-1"
    style="left: {x}px; top: {y}px"
  >
    {#each items as it, i (it.label)}
      <button
        class="item intent-{it.intent ?? 'default'}"
        class:focused={i === focusedIdx}
        role="menuitem"
        disabled={it.disabled}
        onclick={() => onSelect(i)}
        onmouseenter={() => (focusedIdx = i)}
      >{it.label}</button>
    {/each}
  </div>
{/if}

<style lang="scss">
  .menu {
    position: fixed;
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--rd-md);
    box-shadow: var(--sh-md);
    padding: var(--sp-1);
    min-width: 180px;
    z-index: 1200;
    outline: none;
  }

  .item {
    display: block;
    width: 100%;
    text-align: left;
    padding: var(--sp-2) var(--sp-3);
    border: 0;
    border-radius: var(--rd-sm);
    background: transparent;
    color: var(--c-text);
    font-size: var(--fs-sm);
    cursor: pointer;

    &:disabled {
      color: var(--c-text-3);
      cursor: not-allowed;
    }

    &.focused:not(:disabled) {
      background: var(--c-accent-bg);
      color: var(--c-accent);
    }

    &.intent-danger:not(:disabled).focused {
      background: var(--c-danger-bg);
      color: var(--c-danger);
    }
  }
</style>
```

Commit: `feat(web): Menu primitive (keyboard nav, click-outside dismiss, danger intent)`

### Task 16: Chip.svelte

**Files:**
- Create: `web/src/lib/components/ui/Chip.svelte`

```svelte
<!-- web/src/lib/components/ui/Chip.svelte -->
<script lang="ts">
  interface Props {
    label: string;
    active?: boolean;
    removable?: boolean;
    onSelect?: () => void;
    onRemove?: () => void;
  }

  let { label, active = false, removable = false, onSelect, onRemove }: Props = $props();
</script>

<button
  type="button"
  class="chip"
  class:active
  aria-pressed={active}
  onclick={onSelect}
>
  <span class="label">{label}</span>
  {#if removable}
    <span
      class="x"
      role="button"
      aria-label="Remove"
      tabindex="0"
      onclick={(e) => {
        e.stopPropagation();
        onRemove?.();
      }}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onRemove?.();
        }
      }}
    >×</span>
  {/if}
</button>

<style lang="scss">
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    height: 26px;
    padding: 0 var(--sp-3);
    border: 1px solid var(--c-border);
    border-radius: var(--rd-pill);
    background: var(--c-surface);
    color: var(--c-text-2);
    font-size: var(--fs-xs);
    font-weight: var(--fw-medium);
    cursor: pointer;
    transition: background var(--tr-fast), color var(--tr-fast), border-color var(--tr-fast);

    &:hover {
      color: var(--c-text);
      border-color: var(--c-text-3);
    }

    &.active {
      background: var(--c-accent-bg);
      color: var(--c-accent);
      border-color: transparent;
    }
  }

  .x {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    margin-left: var(--sp-1);
    border-radius: var(--rd-pill);
    color: inherit;
    cursor: pointer;

    &:hover {
      background: rgba(0, 0, 0, 0.08);
    }
  }
</style>
```

Commit: `feat(web): Chip primitive (toggle + removable variants, aria-pressed)`

### Task 17: Switch.svelte

**Files:**
- Create: `web/src/lib/components/ui/Switch.svelte`

```svelte
<!-- web/src/lib/components/ui/Switch.svelte -->
<script lang="ts">
  interface Props {
    checked?: boolean;
    label?: string;
    disabled?: boolean;
    onchange?: (checked: boolean) => void;
  }

  let { checked = $bindable(false), label, disabled = false, onchange }: Props = $props();

  function toggle() {
    if (disabled) return;
    checked = !checked;
    onchange?.(checked);
  }
</script>

<label class="row" class:disabled>
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    class="track"
    class:on={checked}
    {disabled}
    onclick={toggle}
  >
    <span class="thumb"></span>
  </button>
  {#if label}<span class="label">{label}</span>{/if}
</label>

<style lang="scss">
  .row {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    cursor: pointer;
    user-select: none;

    &.disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
  }

  .track {
    position: relative;
    width: 36px;
    height: 20px;
    border: 0;
    border-radius: var(--rd-pill);
    background: var(--c-border);
    transition: background var(--tr-fast);
    cursor: inherit;
    padding: 0;

    &.on {
      background: var(--c-accent);
    }
  }

  .thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: var(--c-surface);
    border-radius: 50%;
    box-shadow: var(--sh-sm);
    transition: transform var(--tr-fast);
  }

  .track.on .thumb {
    transform: translateX(16px);
  }

  .label {
    font-size: var(--fs-sm);
    color: var(--c-text);
  }
</style>
```

Commit: `feat(web): Switch primitive (role=switch, $bindable checked)`

### Task 18: Card.svelte

**Files:**
- Create: `web/src/lib/components/ui/Card.svelte`

```svelte
<!-- web/src/lib/components/ui/Card.svelte -->
<script lang="ts">
  interface Props {
    elevation?: 'flat' | 'sm' | 'md';
    padding?: 'none' | 'sm' | 'md' | 'lg';
    children?: import('svelte').Snippet;
  }

  let { elevation = 'sm', padding = 'md', children }: Props = $props();
</script>

<div class="card elevation-{elevation} padding-{padding}">
  {#if children}{@render children()}{/if}
</div>

<style lang="scss">
  .card {
    background: var(--c-surface);
    color: var(--c-text);
    border: 1px solid var(--c-border);
    border-radius: var(--rd-lg);
  }

  .elevation-flat {
    box-shadow: none;
  }
  .elevation-sm {
    box-shadow: var(--sh-sm);
  }
  .elevation-md {
    box-shadow: var(--sh-md);
  }

  .padding-none {
    padding: 0;
  }
  .padding-sm {
    padding: var(--sp-3);
  }
  .padding-md {
    padding: var(--sp-4);
  }
  .padding-lg {
    padding: var(--sp-5);
  }
</style>
```

Commit: `feat(web): Card primitive (elevation x padding variants)`

### Task 19: Skeleton.svelte

**Files:**
- Create: `web/src/lib/components/ui/Skeleton.svelte`

```svelte
<!-- web/src/lib/components/ui/Skeleton.svelte -->
<script lang="ts">
  interface Props {
    width?: string;
    height?: string;
    rounded?: 'sm' | 'md' | 'pill';
  }

  let { width = '100%', height = '14px', rounded = 'sm' }: Props = $props();
</script>

<span class="skeleton rd-{rounded}" style="width: {width}; height: {height}" aria-hidden="true"></span>

<style lang="scss">
  @keyframes shimmer {
    0% {
      background-position: -200px 0;
    }
    100% {
      background-position: calc(200px + 100%) 0;
    }
  }

  .skeleton {
    display: inline-block;
    background: linear-gradient(
      90deg,
      var(--c-surface-2) 0px,
      var(--c-border) 80px,
      var(--c-surface-2) 160px
    );
    background-size: 200px 100%;
    background-repeat: no-repeat;
    animation: shimmer 1.4s ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton {
      animation: none;
    }
  }

  .rd-sm {
    border-radius: var(--rd-sm);
  }
  .rd-md {
    border-radius: var(--rd-md);
  }
  .rd-pill {
    border-radius: var(--rd-pill);
  }
</style>
```

Commit: `feat(web): Skeleton primitive (shimmer placeholder, reduced-motion aware)`

---

## Phase 4: Demo + Verification (Tasks 20–21)

### Task 20: Demo route

**Files:**
- Create: `web/src/routes/_demo/+page.svelte`

This is a page that uses every primitive in light/dark mode. Run via `pnpm dev` then visit `/_demo`.

```svelte
<!-- web/src/routes/_demo/+page.svelte -->
<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Toast from '$lib/components/ui/Toast.svelte';
  import ToastViewport from '$lib/components/ui/ToastViewport.svelte';
  import { toast } from '$lib/components/ui/toast';
  import Menu from '$lib/components/ui/Menu.svelte';
  import Chip from '$lib/components/ui/Chip.svelte';
  import Switch from '$lib/components/ui/Switch.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import { localeStore, t, toggleLocale } from '$lib/i18n/store';
  import { themeStore, cycleTheme } from '$lib/design/theme';

  let inputValue = $state('');
  let inputInvalid = $state(false);
  let switchOn = $state(false);
  let dialogOpen = $state(false);
  let menuOpen = $state(false);
  let chips = $state(['fav', 'media', 'tools']);
  let activeChip = $state('fav');
</script>

<ToastViewport />

<section class="demo">
  <header>
    <h1>UI Primitives Demo</h1>
    <div class="controls">
      <Button intent="ghost" size="sm" onclick={cycleTheme}>
        Theme: {$themeStore}
      </Button>
      <Button intent="ghost" size="sm" onclick={toggleLocale}>
        Locale: {$localeStore}
      </Button>
    </div>
  </header>

  <h2>Buttons</h2>
  <div class="row">
    <Button>Primary</Button>
    <Button intent="secondary">Secondary</Button>
    <Button intent="ghost">Ghost</Button>
    <Button intent="danger">Danger</Button>
    <Button disabled>Disabled</Button>
    <Button loading>Loading</Button>
  </div>
  <div class="row">
    <Button size="sm">Small</Button>
    <Button size="md">Medium</Button>
    <Button size="lg">Large</Button>
  </div>

  <h2>Icon buttons</h2>
  <div class="row">
    <IconButton label="Settings"><span aria-hidden="true">⚙</span></IconButton>
    <IconButton label="Edit" intent="subtle"><span aria-hidden="true">✎</span></IconButton>
    <IconButton label="Delete" disabled><span aria-hidden="true">🗑</span></IconButton>
  </div>

  <h2>Inputs</h2>
  <div class="col">
    <Input label="Name" placeholder="enter your name" bind:value={inputValue} />
    <Input
      label="Password"
      type="password"
      placeholder="••••••••"
      helpText="At least 8 characters"
    />
    <Input
      label="Email"
      type="email"
      invalid={inputInvalid}
      errorText="Email format invalid"
      bind:value={inputValue}
    />
    <Switch label="Toggle invalid state" bind:checked={inputInvalid} />
  </div>

  <h2>Cards</h2>
  <div class="row">
    <Card elevation="flat">flat</Card>
    <Card elevation="sm">sm shadow</Card>
    <Card elevation="md">md shadow</Card>
  </div>

  <h2>Chips</h2>
  <div class="row">
    {#each chips as slug (slug)}
      <Chip
        label={slug}
        active={activeChip === slug}
        removable
        onSelect={() => (activeChip = slug)}
        onRemove={() => (chips = chips.filter((s) => s !== slug))}
      />
    {/each}
  </div>

  <h2>Switch</h2>
  <Switch label="Enable feature X" bind:checked={switchOn} />
  <p>State: {switchOn ? 'on' : 'off'}</p>

  <h2>Dialog</h2>
  <Button onclick={() => (dialogOpen = true)}>Open dialog</Button>
  <Dialog
    bind:open={dialogOpen}
    title="Confirm action"
    description="This will permanently change the configuration."
  >
    <p>Body text. Press Esc or click outside to close.</p>
    {#snippet footer()}
      <Button intent="ghost" onclick={() => (dialogOpen = false)}>{$t('common.cancel')}</Button>
      <Button intent="primary" onclick={() => (dialogOpen = false)}>{$t('common.confirm')}</Button>
    {/snippet}
  </Dialog>

  <h2>Toasts</h2>
  <div class="row">
    <Button onclick={() => toast.info('Info toast')}>info</Button>
    <Button intent="secondary" onclick={() => toast.success('Saved!')}>success</Button>
    <Button intent="ghost" onclick={() => toast.warn('Be careful')}>warn</Button>
    <Button intent="danger" onclick={() => toast.error('Something broke')}>error</Button>
  </div>

  <h2>Menu</h2>
  <Button onclick={() => (menuOpen = true)}>Open context menu</Button>
  <Menu
    bind:open={menuOpen}
    x={120}
    y={120}
    items={[
      { label: 'Edit', onSelect: () => toast.info('Edit') },
      { label: 'Duplicate', onSelect: () => toast.info('Duplicated') },
      { label: 'Delete', intent: 'danger', onSelect: () => toast.error('Deleted') }
    ]}
  />

  <h2>Skeleton</h2>
  <div class="col">
    <Skeleton height="20px" width="240px" />
    <Skeleton height="14px" width="180px" />
    <Skeleton height="14px" width="220px" />
  </div>

  <h2>i18n</h2>
  <p>{$t('common.save')} / {$t('header.search.placeholder')}</p>
</section>

<style lang="scss">
  .demo {
    max-width: 720px;
    margin: var(--sp-6) auto;
    padding: 0 var(--sp-4);
    color: var(--c-text);
    font-family: var(--ft-sans);

    h1 {
      font-size: var(--fs-xl);
      font-weight: var(--fw-semibold);
      margin: 0 0 var(--sp-4);
    }

    h2 {
      margin: var(--sp-6) 0 var(--sp-3);
      font-size: var(--fs-lg);
      font-weight: var(--fw-semibold);
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--sp-3);
      flex-wrap: wrap;
    }
  }

  .row {
    display: flex;
    gap: var(--sp-2);
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: var(--sp-2);
  }

  .col {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    max-width: 360px;
  }

  .controls {
    display: flex;
    gap: var(--sp-2);
  }
</style>
```

- [ ] **Step 1: Smoke test the demo route**

```bash
cd web
pnpm dev --host 127.0.0.1 --port 5173 > /tmp/web-demo.log 2>&1 &
DEV_PID=$!
sleep 8
echo "=== / ==="
curl -sf http://127.0.0.1:5173/ -o /dev/null && echo OK || echo FAIL
echo "=== /_demo ==="
curl -sf http://127.0.0.1:5173/_demo -o /tmp/demo.html && grep -oE 'UI Primitives Demo' /tmp/demo.html
kill $DEV_PID 2>/dev/null
sleep 1
cd ..
```

Expected: both `/` and `/_demo` boot OK; demo page contains `UI Primitives Demo` heading.

- [ ] **Step 2: Commit**

```bash
git add web/src/routes/_demo
git commit -m "feat(web): /_demo route showcasing all UI primitives + theme/locale toggle"
```

### Task 21: Final pipeline green

**Files:**
- No code changes; verification only

- [ ] **Step 1: Run full pipeline**

```bash
cd web
echo "=== build ==="
pnpm build 2>&1 | tail -5
echo "=== check ==="
pnpm check 2>&1 | tail -10
echo "=== unit tests ==="
pnpm test:unit 2>&1 | tail -10
echo "=== lint ==="
pnpm lint 2>&1 | tail -10
cd ..
```

Expected:
- `build`: succeeds, `web/build/index.html` + `_demo/index.html` produced
- `check`: 0 errors
- `test:unit`: 11+ tests pass (4 apiClient + 7 i18n)
- `lint`: 0 errors

If anything fails with errors, debug + fix in this task. Don't commit failures.

- [ ] **Step 2: If everything green, no commit needed for this task**

If you fixed something (e.g., a stray svelte-check warning from a primitive), commit those fixes:

```bash
git add -u web/src
git commit -m "chore(web): clean up Plan 2 primitive lints / type warnings"
```

Otherwise no commit; this task is verification only.

---

## Self-Review (filled by writer)

**Spec coverage**

| Spec section | Where covered |
|---|---|
| § 4.3 type safety (zod single-source) | Task 1 (types/nav.ts) + Task 2 (apiClient) |
| § 7.2 design tokens | Task 7 (tokens.scss with locked values from this plan §) |
| § 7.3 component primitives (10 items) | Tasks 10–19 |
| § 8.1 i18n (no library) | Tasks 4–6 |
| § 8.2 a11y baseline | Every primitive uses `<button>` + aria + focus-visible (via tokens) |
| § 8.3 type strictness (zod-driven) | Task 1 |
| § 8.4 error handling toast | Task 14 (toastStore + ToastViewport) |

**Type / signature consistency**

- All primitives use `$props()` with `interface Props` (Svelte 5 idiom).
- Bindable props use `$bindable` (Input value, Switch checked, Dialog/Menu open).
- All snippets passed via `children?: Snippet` typed import.
- `apiClient<TRes>(opts: ApiCallOptions<TRes>)` signature consistent across the plan.
- `t()` and `tNow()` accept the same `(key, params?)` signature.

**Placeholder scan**

- No "TBD" / "TODO" markers. Every code block is full and ready to paste.
- Tasks that produce no commit (e.g., when verification was the only purpose) explicitly say so.

**Scope discipline**

- Plan 2 builds primitives but NOT pages — Header/Footer/NavGrid replacements live in Plan 3.
- Plan 2 does NOT remove the legacy `web/src/lib/components/{Header,Footer,Nav,SiteSelect,Avatar}.svelte` — Plan 3 deletes them when their replacements ship.
- Plan 2 does NOT call backend endpoints (apiClient is built but unused) — Plan 3 wires real fetches.
- No Tailwind / DaisyUI / shadcn introduced (per spec hard constraint).

**Verification gates**

- Phase 0 ends with apiClient unit tests + svelte-check.
- Phase 1 ends with i18n unit tests.
- Phase 2 ends with dev smoke (theme applied to `<html>`).
- Phase 3 has no per-task automated tests (visual primitives) — Task 20's demo page is the integration check.
- Phase 4 ends with full `pnpm build && check && test:unit && lint` green.

**Deferred to other plans**

- Header / Footer / NavGrid replacements (Plan 3).
- Login / edit dialogs (Plan 4) — they consume `Dialog`, `Input`, `Button` from this plan.
- Playwright e2e (Plan 5).
- Removing legacy `<div onclick>` workarounds in `Nav.svelte` / `SiteSelect.svelte` (Plan 3 replaces these files).
