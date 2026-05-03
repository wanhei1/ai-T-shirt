# Monorepo Restructure Implementation Summary

## ✅ Completed (Phases 1-6)

### Phase 1: Documentation

- [x] Root `README.md` — Project overview and monorepo layout
- [x] `docs/setup.md` — Local setup guide
- [x] `docs/architecture.md` — System architecture overview
- [x] `docs/environment-variables.md` — Env var reference
- [x] `docs/api-reference.md` — API endpoint examples
- [x] `docs/comfyui-integration.md` — ComfyUI integration guide
- [x] `docs/troubleshooting.md` — Common issues and fixes
- [x] `docs/database.md` — Database schema reference
- [x] `apps/web/README.md` — Frontend app guide
- [x] `apps/api/README.md` — Backend app guide

### Phase 2: Pre-Migration Preparation

- [x] Root `tsconfig.json` — Project-wide TypeScript configuration with path aliases
- [x] `docs/type-consolidation.md` — Type deduplication roadmap
- [x] `docs/phase4-5-migration.md` — Step-by-step folder move guide
- [x] Hard-coded ComfyUI paths → environment variables
  - Added `dev:full:comfyui-env:env` and `dev:full:comfyui-env:external-mq:env` scripts using `$COMFYUI_CMD`

### Phase 3-5: Package Configuration Updates

- [x] Root `package.json`
  - Updated `workspaces` from `["frontend", "backend", "shared"]` to `["apps/web", "apps/api", "packages/shared"]`
  - Updated 50+ scripts: `cd frontend` → `cd apps/web`, `cd backend` → `cd apps/api`
  - Updated ComfyUI script from `cd ComfyUI` → `cd services/comfyui`

- [x] `frontend/package.json` (will become `apps/web/package.json`)
  - `prebuild` and `predev` now use workspace-aware `npm --workspace=@v0-t-shirt-design-editor/shared run build`
  - (Was: `npm --prefix ../shared run build`)

- [x] `backend/package.json` (will become `apps/api/package.json`)
  - `prebuild`, `predev`, `prestart` now use workspace-aware commands
  - Updated `backup:daily` and perf scripts: `../scripts` → `../../scripts`

- [x] `vercel.json`
  - `buildCommand`, `devCommand`, `installCommand` updated: `cd frontend` → `cd apps/web`
  - `outputDirectory` updated: `frontend/.next` → `apps/web/.next`

- [x] Docker & Compose (no changes needed)
  - Files remain in place and use relative paths (`context: .`)
  - Will be at `apps/api/docker-compose*.yml` and `apps/api/Dockerfile` after move

## 📋 Next Steps (Phases 7-9)

### Phase 7: Type Consolidation & Imports

**Duplicate Types Identified:**
- `DesignElement` in `shared/src/types/index.ts` (generic) + `frontend/types/design.ts` (detailed)
- `User` in `shared/src/types/index.ts` + `frontend/types/auth.ts` + `frontend/lib/auth-api.ts`

**Action:**
1. Expand `packages/shared/src/types/index.ts` to include all properties from frontend (fontSize, fontFamily, color, side, visible, etc.)
2. Delete `apps/web/types/design.ts` and `apps/web/types/auth.ts`
3. Update all imports in `apps/web` to use `@v0-t-shirt-design-editor/shared`
4. Update all imports in `apps/api` to use `@v0-t-shirt-design-editor/shared`
5. Run `npm run typecheck` to verify no regressions

### Phase 8: Linting, Tests & CI

**Setup:**
- [ ] Add ESLint and Prettier configurations
- [ ] Add Vitest or Jest for unit tests
- [ ] Create basic test harness for auth, health endpoints, order creation
- [ ] Update `.github/workflows` to use new paths (`apps/web`, `apps/api`, `packages/shared`)

**Scripts to Add:**
```json
"lint": "eslint . --ext .ts,.tsx",
"format": "prettier --write .",
"typecheck": "tsc --noEmit",
"test": "vitest run",
"test:watch": "vitest"
```

### Phase 9: Cleanup & Archive

- [ ] Run `npx depcheck` or `npx knip` to find unused dependencies
- [ ] Archive or delete:
  - `ai-T-shirt/ai-T-shirt/` (nested duplicate)
  - Old `frontend-components-package-*` folder if unused
  - ComfyUI source code (keep binaries/models in `services/comfyui` if needed)
- [ ] Create `before-restructure` git tag for safety
- [ ] Update CI/CD environment variables and secrets references

## 🚀 Execution Checklist

Before moving folders:

```bash
# 1. Create directories
mkdir apps
mkdir packages

# 2. Move folders
move frontend apps\web
move backend apps\api
move shared packages\shared

# 3. Update ComfyUI reference in root
move ComfyUI services\comfyui  (optional, or keep at root)

# 4. Verify structure
ls -R  # or dir /s in Windows
```

After moving folders:

```bash
# 5. Install dependencies
npm install

# 6. Build packages/shared first, then apps
npm run build

# 7. Verify no path errors
npm run typecheck

# 8. Commit changes
git add .
git commit -m "chore: restructure into monorepo layout (apps/web, apps/api, packages/shared)"
git push
```

## 📝 Files Modified (Pre-Move)

| File | Changes |
|---|---|
| Root `package.json` | Workspaces + 50+ scripts updated |
| `frontend/package.json` | Prebuild/predev → workspace-aware |
| `backend/package.json` | Prebuild/predev/prestart → workspace-aware, script paths updated |
| `vercel.json` | Build paths updated to `apps/web` |
| `tsconfig.json` | Created with path aliases |
| `docs/` | 8 new docs files + 2 migration guides |
| `apps/web/README.md` | Created |
| `apps/api/README.md` | Created |

## ⚠️ Risk Mitigation

1. **Safety Tag:** Create git tag `before-restructure` before moving folders
2. **Test Build:** After moves, verify `npm install && npm run build` succeeds
3. **Type Safety:** `npm run typecheck` must pass
4. **CI Verification:** Push to feature branch, verify CI pipeline updates before merging to main
5. **Rollback Plan:** `git reset --hard <tag>` if critical issues arise

## 📚 Key Documents

- `docs/phase4-5-migration.md` — Exact folder move steps
- `docs/type-consolidation.md` — Type deduplication plan
- `docs/environment-variables.md` — Updated env var reference
- Root `README.md` — New monorepo overview

## 🎯 Success Criteria

- [ ] Folders moved to `apps/web`, `apps/api`, `packages/shared`
- [ ] `npm install` succeeds at repo root
- [ ] `npm run build` builds `packages/shared` then apps without errors
- [ ] `npm run typecheck` passes
- [ ] All imports updated to use `@v0-t-shirt-design-editor/shared`
- [ ] GitHub Actions CI updated and passing
- [ ] Vercel frontend deployment builds successfully
- [ ] Backend Docker build succeeds
