# Capacity Baseline Report Template

## 1. Run Metadata

- Date:
- Environment:
- Commit SHA:
- BASE_URL:
- Dependency topology:
- API replicas:
- Worker replicas:

## 2. API Sync Read/Write (api-sync-rw)

- p50:
- p95:
- p99:
- failure ratio:
- pass/fail:

## 3. AI Async Queue (ai-async-queue)

- enqueue acceptance ratio:
- job_time_to_terminal_ms p95:
- request failure ratio:
- pass/fail:

## 4. Dependency Chaos (dependency-chaos)

- fault injection mode: (manual/probe-only/injected)
- failure ratio during fault window:
- recovery time to baseline:
- pass/fail:

## 5. Capacity Baseline Result

- Max sustainable API VUs/RPS under SLO:
- Max sustainable async concurrent jobs under SLO:
- Bottleneck:

## 6. Scaling Decision

- scale-out threshold updates:
- scale-in guard updates:
- release gate decision:

## 7. Action Items

1.
2.
3.
