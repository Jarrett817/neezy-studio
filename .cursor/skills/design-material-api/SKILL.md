---
name: design-material-api
description: "Use when adding HTTP APIs under app/lib/api (per-module folders), shared apiGetJsonEnvelope / SSO redirect on 40001, material module hooks (useMaterialCategoriesQuery etc.), or fission catalog wiring. Covers /api base vs /videoflow app base and Hikvision OA login URLs."
---

# Videoflow：`app/lib/api` 架构

## 目录约定

- **`app/lib/api/http.ts`**：**axios** `getApiClient()`（`baseURL` = `getApiBaseUrl()`、`withCredentials`）、**响应拦截器**：JSON `code === 40001` → `redirectToHikvisionSso`；`apiGetJsonEnvelope` 用 `client.get` + Zod + `20000`；`ApiBusinessError`。
- **`app/lib/api/sso.ts`**：`redirectToHikvisionSso()` — `service` = `encodeURIComponent(window.location.href)`；登录基址优先 **`window.__VIDEOFLOW_CONFIG__.ssoLoginBase`**（`/config.js`），再 **`VITE_SSO_LOGIN`**（由 `.env.development` / `.env.production` 区分）。
- **`app/lib/api/public-config.ts`**：解析 **`window.__VIDEOFLOW_CONFIG__`**；`root.tsx` 用 **`import.meta.env.BASE_URL + "config.js"`** 加载，**脚本由部署提供**，仓库不内置 `public/config.js`（本地可自建且 gitignore）。
- **`app/lib/api/query-client.ts`**：全局 `queryClient`（TanStack Query 默认策略）。
- **`app/lib/api/index.ts`**：共享层 re-export。
- **按业务分子目录**，例如 **`app/lib/api/material/`**：`schema.ts`、`requests.ts`、`query-keys.ts`、`hooks.ts`、`index.ts`、（可选）`map-*.ts`。

新模块可复制 `material` 目录结构，在 `requests` 里只拼相对 `/app/...` 路径，由 `http` 统一加前缀。

## 部署路径

- 前端 **`base` / `basename`** 写死 **`/videoflow/`**。开发：hosts 同 hostname 时 **`.env.development` 里 `VITE_API_ORIGIN` 留空**，接口同源 **`/api`**，**`vite.config` `server.proxy`** 转网关 IP；生产用 **`VITE_API_ORIGIN`**（`.env.production`）。**不要**把 API 拼成 `/videoflow/api`。

## 未登录

响应 JSON `code === 40001` 时，`apiGetJsonEnvelope` 会先 **`redirectToHikvisionSso()`** 再抛 `ApiBusinessError`。SSO 基址：**`/config.js` → `VITE_SSO_LOGIN`（分环境 env 文件）→ 内置默认**。

## React Query

- 全局 **`queryClient`**：`app/lib/api/query-client.ts`（`QueryProvider` 使用同一实例）；`invalidateQueries` / `prefetchQuery` 等可 `import { queryClient } from "~/lib/api/query-client"` 或 `~/lib/api`。
1. 在 **`query-keys.ts`** 用 `createQueryKeyStore` 定义 `queryKey` + `queryFn`（`queryFn` 只调 `requests`）。
2. 在 **`hooks.ts`** 用 **`useQuery({ ...materialQueries.material.xxx(), enabled, staleTime })`** 封装，业务组件**优先调 hooks**，避免到处手写 `useQuery`。
3. 不要在 factory 里写死依赖运行时的 `enabled`（与 storyboard `query-keys` 一致）。

## 素材模块入口

- `import { useDesignMaterialsByTypeQuery, materialQueries } from "~/lib/api/material"`。
- 列表：`GET .../design/materials?type=`，`type` = 分类接口里该项的 **`id`**。裂变弹窗：`useFissionCatalogMaps` 内用 **`useDesignMaterialsByTypeQuery`** + `FISSION_DIMENSION_MATERIAL_TYPE`；失败或无数据时回退 `FISSION_MOCK_CATALOG`。

## 新增模块 checklist

1. `app/lib/api/<module>/schema.ts`（Zod）
2. `requests.ts` → 仅 `apiGetJsonEnvelope` + 路径
3. `query-keys.ts` → `createQueryKeyStore`
4. `hooks.ts` → `useQuery` 包装
5. `index.ts` 聚合导出
6. 更新 `doc/<module>.md` 与本 SKILL
