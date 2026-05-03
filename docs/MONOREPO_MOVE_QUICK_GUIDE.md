# ⚡ Quick Reference: Monorepo Move Execution

## Pre-Move Checklist ✅

```bash
# In e:\BIT_file\year4\FUZHUANG\ai-T-shirt (root of repo)

# 1. Create git safety tag
git tag before-restructure

# 2. Verify current structure
ls -R
# Expected: frontend/, backend/, shared/, ComfyUI/, CatVTON/, detectron2/, docs/, apps/, packages/
```

## Move Commands (PowerShell/CMD)

```cmd
# From repo root: e:\BIT_file\year4\FUZHUANG\ai-T-shirt

# 1. Create target folders
mkdir apps
mkdir packages

# 2. Move folders
move frontend apps\web
move backend apps\api
move shared packages\shared

# 3. (Optional) Move ComfyUI to services
mkdir services
move ComfyUI services\comfyui
# OR keep ComfyUI at root — either works, just update docs accordingly
```

## Verify Structure

```cmd
# After moves, you should see:
dir /s

# Expected structure:
# ai-T-shirt/
#   apps/
#     web/      (was frontend)
#     api/      (was backend)
#   packages/
#     shared/   (was shared)
#   services/
#     comfyui/  (optional, or leave ComfyUI at root)
#   docs/
#   ...
```

## Post-Move Build Verification

```bash
# Back in repo root
cd ai-T-shirt

# 1. Clean install
npm install

# 2. Build packages/shared first (dependencies)
npm run build:shared  # or: npm --workspace=packages/shared run build

# 3. Build all apps
npm run build

# 4. Type check
npm run typecheck  # if script exists, else: npx tsc --noEmit

# 5. Verify key paths resolved
npm run build 2>&1 | grep -i "error\|cannot find"  # Should be empty
```

## If Issues Occur

```bash
# Rollback
git reset --hard before-restructure
git clean -fd

# OR check what went wrong:
npm run build 2>&1 | head -50  # First 50 lines of error
npm run typecheck 2>&1 | head -30
```

## Git Commit

```bash
# After successful build/typecheck:
git add .
git commit -m "chore: restructure into monorepo (apps/web, apps/api, packages/shared)

- Move frontend → apps/web
- Move backend → apps/api
- Move shared → packages/shared
- Update root package.json workspaces and scripts
- Update vercel.json, frontend/backend package.json for new paths
- Create root tsconfig.json
"

git push origin <your-branch>
```

## Next (Phase 7-9): Type Consolidation & Cleanup

Once folder move is confirmed working:

```bash
# 1. Consolidate types in packages/shared
#    Expand DesignElement, User to match frontend details
#    Delete apps/web/types/design.ts and apps/web/types/auth.ts

# 2. Update all imports in apps/web and apps/api to use:
#    import { User, DesignElement } from '@v0-t-shirt-design-editor/shared'

# 3. Add linting, tests, CI updates

# 4. Archive old files and run depcheck
```

---

**Estimated time to execute moves:** 5-10 minutes  
**Time to verify build:** 5-15 minutes (depends on node_modules install speed)

**Reference docs:**
- `docs/phase4-5-migration.md` — Detailed step-by-step guide
- `docs/implementation-summary.md` — Full overview of all changes
- `docs/type-consolidation.md` — Type dedup roadmap
