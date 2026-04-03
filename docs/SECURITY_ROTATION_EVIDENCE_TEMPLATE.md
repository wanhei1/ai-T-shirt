# Security Rotation Evidence Template

Use this template after executing production key rotation.

## Change Metadata
- Date:
- Operator:
- Reviewer:
- Ticket/Change ID:
- Environment:

## Rotated Credentials
- [ ] JWT secret rotated (`JWT_SECRET`)
- [ ] PostgreSQL credential rotated (`DATABASE_URL`)
- [ ] RabbitMQ credential rotated (`RABBITMQ_URL`)
- [ ] Admin bootstrap password reviewed/rotated (`ADMIN_PASSWORD`)

## Verification Evidence
- [ ] `npm run security:validate-env:strict` passed
- [ ] `npm run release:preflight:prod` passed (or equivalent production-safe subset)
- [ ] GitHub Action `Key Rotation Verification` passed

## Impact Validation
- [ ] Login works with newly issued token
- [ ] Existing old token behavior verified (invalidated or transition strategy confirmed)
- [ ] Worker consumes queue with new RabbitMQ credential
- [ ] Database connectivity healthy with rotated credential

## Rollback Readiness
- [ ] Previous credential versions retained in secret manager history
- [ ] Rollback owner confirmed
- [ ] Rollback test command documented

## Notes
- 
