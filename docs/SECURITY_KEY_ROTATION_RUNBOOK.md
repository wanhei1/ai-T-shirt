# Security Key Rotation Runbook

This runbook standardizes production credential rotation for JWT, PostgreSQL, and RabbitMQ.

## Scope
- JWT signing secret (`JWT_SECRET`)
- PostgreSQL credentials (`DATABASE_URL`)
- RabbitMQ credentials (`RABBITMQ_URL`)

## Preconditions
- Maintenance window approved
- Rollback owner assigned
- Current secrets backed up in secret manager history
- Current release health is green

## 1. Prepare New Secrets
- Generate new JWT secret (>= 32 chars, random)
- Generate new DB password (strong random)
- Generate new RabbitMQ password (strong random)
- Store all values in deployment secret manager (do not commit into repo)

Suggested commands:

```bash
openssl rand -hex 32
```

## 2. Rotate PostgreSQL Credential
- Create/alter application DB user with new password
- Validate DB login using new credential
- Update `DATABASE_URL` in deployment platform

Validation:

```bash
npm run security:validate-env:strict
npm run release:db:check:prod
```

## 3. Rotate RabbitMQ Credential
- Create/alter RabbitMQ user and permissions
- Update `RABBITMQ_URL` in deployment platform
- Confirm worker can connect and consume

Validation:

```bash
npm run security:validate-env:strict
```

## 4. Rotate JWT Secret
- Update `JWT_SECRET` in deployment platform
- Roll restart API and worker
- Verify login and token-protected API routes

Notes:
- Existing tokens may become invalid immediately after rotation depending on strategy.
- If zero-downtime token transition is required, add dual-secret verification logic before rotation.

## 5. Post-rotation Verification Checklist
- Run strict env guard: `npm run security:validate-env:strict`
- Run functional pipeline: `npm run verify:functional`
- Confirm CI gates are green:
  - `Secret Scan`
  - `DB Release Gate`
  - `Functional Gate`
  - `Security Readiness`
- Manual smoke checks:
  - Login / register
  - Create AI job and poll result
  - Submit order
  - Worker consumption and queue depth

## 6. Rollback Plan
- Revert secret manager values to previous versions
- Restart API and worker
- Re-run verification checklist
- Capture incident note (time, reason, impact)

## 7. Ownership Record (fill per rotation)
- Rotation date:
- Operator:
- Reviewer:
- Ticket/Change ID:
- Verification completed:
