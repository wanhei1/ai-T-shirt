# Type & Import Consolidation Roadmap

## Issue: Duplicate Type Definitions

Currently, types are duplicated across the codebase:

| Type | Locations | Status |
|---|---|---|
| `DesignElement` | `shared/src/types/index.ts`, `frontend/types/design.ts` | Duplicate (frontend version more detailed) |
| `User` | `shared/src/types/index.ts`, `frontend/types/auth.ts`, `frontend/lib/auth-api.ts` | Duplicate |
| `ApiResponse` | `shared/src/types/index.ts` only | ✓ Single source |

## Action Items (Before/During Monorepo Move)

### 1. Expand Shared Types to Match Frontend Detail

Update `shared/src/types/index.ts` to include frontend-specific properties in `DesignElement`:

```ts
export interface DesignElement {
  id: string;
  type: 'text' | 'image' | 'shape' | 'ai-generated';
  // ... current properties ...
  // Add frontend-specific props:
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  side?: 'front' | 'back';
  visible?: boolean;
}
```

### 2. Update Frontend Imports

- Replace `import { DesignElement } from '../types/design.ts'` with `import { DesignElement } from '@v0-t-shirt-design-editor/shared'`.
- Replace `import { User } from '../types/auth.ts'` with `import { User } from '@v0-t-shirt-design-editor/shared'`.
- Delete `frontend/types/design.ts` and `frontend/types/auth.ts` (after moving files).

### 3. Update Backend Models & API

Ensure `backend/src/models` use shared types for consistency:

```ts
import { User, DesignElement, ApiResponse } from '@v0-t-shirt-design-editor/shared';
```

## Migration Steps (Phase 6-7)

1. **Phase 3-4**: After moving to monorepo layout (`apps/web`, `apps/api`, `packages/shared`).
2. **Phase 6**: Consolidate types in `packages/shared/src/types/index.ts`.
3. **Phase 6**: Update all `apps/web` imports to use `@v0-t-shirt-design-editor/shared`.
4. **Phase 6**: Update all `apps/api` imports to use `@v0-t-shirt-design-editor/shared`.
5. **Phase 6**: Delete duplicate type files.
6. **Phase 7**: Run `npm run typecheck` to verify no regressions.

## Notes

- Keep package name `@v0-t-shirt-design-editor/shared` unchanged for minimal import churn.
- Ensure `packages/shared` is built before `apps/web` and `apps/api` use it (configured in workspace).
