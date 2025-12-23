## Quick guide for AI coding agents (v0-t-shirt-design-editor)

Be concise and make minimal, well-tested changes. Focus on correctness, safety (no secrets), and repository conventions.

1) Big picture (use these files to learn the flow)
  - Frontend: `frontend/` — Next.js 14 (App Router). Key files: `app/design/*` (three-step flow), `components/design-tools/ai-generator.tsx`, `lib/api-client.ts`, `lib/simple-comfyui-client.ts`.
  - Backend: `backend/` — Express + TypeScript. Entry: `backend/src/app.ts` (calls `createRoutes(pool)`). Routes: `backend/src/routes/index.ts`. Auth middleware: `backend/src/middleware/auth.ts`. Models: `backend/src/models/index.ts`.
  - Shared: `shared/src` — cross-cutting types, constants and utilities used by both sides.

2) Common developer workflows (explicit commands)
  - Install dependencies (monorepo): `npm run install:all`
  - Start both services locally: `npm run dev` (runs `dev:frontend` + `dev:backend`).
  - Start frontend only: `npm run dev:frontend` (runs `cd frontend && npm run dev`).
  - Start backend only: `npm run dev:backend` (runs `cd backend && npm run dev`).
  - Build: `npm run build` (uses `build:frontend` + `build:backend`).

3) Environment & runtime notes
  - Backend default port: 8189 (see `backend/src/app.ts`). Frontend default: 3000.
  - Env samples: `frontend/.env.local.example` and `backend/.env.example`. `NEXT_PUBLIC_API_URL` points frontend → backend.
  - ComfyUI: default `COMFYUI_URL` is `http://127.0.0.1:8188`. Components that use it: `frontend/lib/simple-comfyui-client.ts` and `components/comfyui-status-card.tsx`.

4) Project-specific conventions & gotchas
  - Monorepo uses npm workspaces (`package.json` root). Use root scripts for combined actions (install, dev, build).
  - Backend will run in degraded mode if DB is unreachable (it still starts). See `backend/src/app.ts` — code creates tables automatically when DB is available.
  - Orders stored as JSONB (`orders.items`, `orders.design` etc.) — changes to order shape must consider DB migration / backward compatibility. There is an `ALTER TABLE ... ADD COLUMN IF NOT EXISTS design JSONB` example in `app.ts`.
  - CORS origins come from `FRONTEND_URL` (comma-separated) in `backend/src/app.ts`. Allow missing origin for curl/mobile requests.
  - Large design payloads: server JSON body limit is controlled by `EXPRESS_JSON_LIMIT` (default ~5mb) in `backend/src/app.ts`.

5) Integration points to watch when editing
  - Frontend ↔ Backend REST: `lib/api-client.ts` builds requests against `NEXT_PUBLIC_API_URL`. Tests and local debug should ensure that URL and ports match.
  - Auth flow: token stored in frontend `localStorage` (`AuthContext`) and sent as `Bearer` token. Backend authenticates via `backend/src/middleware/auth.ts` which sets `req.userId`.
  - ComfyUI image generation: front triggers `/api/generate-image` then polls `history` via the simple comfy client. Handle retries and partial failures gracefully.

6) Where to make changes for common tasks (examples)
  - Add backend route: update `backend/src/routes/index.ts` and ensure tests or example curl are included in `backend/README.md`.
  - Change order schema: update `backend/src/models/index.ts`, add a safe migration (ALTER TABLE ...), and update frontend `types` in `shared/src` and `frontend/types`.
  - Update AI generator UI: edit `frontend/components/design-tools/ai-generator.tsx` and `frontend/lib/simple-comfyui-client.ts` to keep UI and client in sync.

7) Safety & PR guidance for the agent
  - Never add secrets or credentials to code. Use `.env` files and `.env.*.example` templates instead.
  - For production-impacting edits (DB schema, auth, payments), prefer small, reviewed PRs and add migration steps in `docs/`.
  - When adding endpoints, include health-check behavior (see `/health`) and document new routes in `backend/README.md`.

8) Useful files to read first (high signal)
  - `README.md` (root) — project overview and scripts
  - `backend/src/app.ts` — backend start-up, DB behavior, CORS, body limits
  - `backend/src/routes/index.ts` — canonical route patterns and auth usage
  - `frontend/lib/api-client.ts` — how frontend composes API calls and JWT attachment
  - `frontend/components/design-tools/ai-generator.tsx` — example AI integration

If any section is unclear or you'd like me to expand examples (curl snippets, test templates, or a sample PR checklist), tell me which area and I'll iterate.

## Examples: curl (quick copy-paste)

Below are two concrete examples you can copy when testing or documenting endpoints. Replace placeholders like `$TOKEN` and `localhost:8189` with your values.

- Generate image (AI / ComfyUI flow)

```bash
curl -X POST "http://localhost:8189/api/generate-image" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "a photorealistic illustration of a cat wearing sunglasses, studio lighting",
    "width": 512,
    "height": 512,
    "steps": 20,
    "style": "pop-art",
    "seed": 42
  }'
```

Typical (simplified) successful response:

```json
{ "success": true, "imageUrl": "https://cdn.example.com/generated/abc.png", "jobId": "job_123" }
```

Notes:
- The frontend also exposes an API Route that may proxy generation requests; check `frontend/app/api/generate-image` and `frontend/lib/simple-comfyui-client.ts` for client/workflow logic.
- The server may accept different fields (workflow, sampler); inspect the implementation if your payload needs more options.

- Create order (submit design + items)

```bash
curl -X POST "http://localhost:8189/api/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "total": 29.99,
    "items": [{"sku":"TSHIRT-001","qty":1,"price":29.99}],
    "selections": {"size":"M","color":"black","styleId":"classic"},
    "design": {"layers":[{"type":"image","src":"https://cdn.example.com/abc.png","x":0,"y":0,"scale":1}]},
    "shipping_info": {"name":"Alice","address":"123 Main St","country":"CN"}
  }'
```

Typical (simplified) successful response:

```json
{ "id": 123, "user_id": 5, "status": "pending", "created_at": "2025-11-11T00:00:00Z", "total": 29.99 }
```

Notes:
- Orders are persisted as JSONB in the database (`orders.items`, `orders.design`). If the database is unavailable the backend may run in degraded mode and return errors (see `backend/src/app.ts`).
- Ensure `EXPRESS_JSON_LIMIT` is sufficient for large design payloads (images embedded as data URLs can be large).

