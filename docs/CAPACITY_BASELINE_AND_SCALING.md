# Capacity Baseline and Scaling Policy

This document closes gap 3.3 (capacity baseline and expansion thresholds) with executable load tests and go/no-go criteria.

## 1. Test Categories

Three standardized tests are provided:

1. API sync read/write load:
- script: scripts/perf/k6/api-sync-rw.js
- command: npm run perf:api-sync-rw
- purpose: validate synchronous path under mixed write/read traffic (register/login/gallery/profile).

2. AI async enqueue/dequeue load:
- script: scripts/perf/k6/ai-async-queue.js
- command: npm run perf:ai-async
- purpose: validate queue throughput and job terminal-state latency under concurrent async submissions.

3. Dependency fault injection resilience:
- probe script: scripts/perf/k6/dependency-chaos.js
- command (probe only): npm run perf:dependency-chaos
- command (with local fault injection): npm run perf:dependency-chaos:inject
- purpose: validate degradation/recovery behavior when DB/MQ/Redis are interrupted.

One-command suite:
- command: npm run perf:capacity-suite
- output: artifacts/perf/<timestamp>/*.json

## 2. Prerequisites

1. Start backend API + worker and dependencies.
2. Ensure BASE_URL points to target API endpoint (default: http://127.0.0.1:8185).
3. Optional envs:
- PERF_TEST_PASSWORD
- START_VUS, STAGE_1_VUS, STAGE_2_VUS, STAGE_3_VUS
- JOB_MAX_POLL_SECONDS
- CHAOS_DURATION, CHAOS_VUS
- INJECT_FAULTS=true

Example:

```bash
BASE_URL=http://127.0.0.1:8185 npm run perf:capacity-suite
```

## 3. Baseline Output Requirements

Each baseline run must include:

1. Test metadata:
- git commit SHA
- environment (single instance / HA)
- dependency topology
- test window and duration

2. Core metrics:
- API: p50/p95/p99, request failure rate
- Async queue: enqueue accept rate, job_time_to_terminal_ms p95
- Chaos: failure ratio during fault window, recovery duration

3. Capacity boundary:
- max sustainable RPS/VUs under SLO target
- max sustainable concurrent async jobs under SLO target

## 4. SLO-Linked Capacity Gate

A baseline is accepted only if all are true:

1. API sync read/write:
- http_req_failed < 2%
- p95 < 800ms
- p99 < 1200ms

2. AI async queue:
- http_req_failed < 5%
- job_time_to_terminal_ms p95 < 120s

3. Dependency chaos:
- request failure ratio during fault window < 20%
- service returns to steady-state p95 in <= 5 minutes after dependency recovery

If any gate fails, capacity ceiling is defined as the previous passing stage.

## 5. Expansion Thresholds and Automation Strategy

Use the following trigger policy in production autoscaling:

1. API scale-out trigger:
- condition A: p95 latency > 800ms for 10m
- condition B: error ratio (5xx) > 2% for 5m
- action: +1 API replica (cooldown 5m)

2. Worker scale-out trigger:
- condition A: queue depth > 200 for 10m
- condition B: queue wait p95 > 120s for 10m
- action: +1 worker replica (cooldown 10m)

3. Scale-in guard:
- only when queue depth < 50 and p95 < 500ms for 30m
- reduce one replica per step with 15m cooldown

4. Release guardrail:
- if 80% monthly error budget is consumed, freeze non-reliability releases.

## 6. Back-of-the-Envelope Capacity Method

Estimate upper bound before full test:

1. API upper bound:
- API_RPS_max ~= replicas * (1000 / p95_ms) * utilization_factor
- utilization_factor default 0.6

2. Async upper bound:
- Async_jobs_per_min ~= worker_count * (60 / avg_job_seconds)

3. Safe operating zone:
- target load <= 70% of validated upper bound

## 7. Recommended Weekly Process

1. Run npm run perf:capacity-suite on staging.
2. Compare current summaries with last accepted baseline.
3. Update thresholds only after two consecutive stable runs.
4. Document accepted baseline and scaling settings in ops changelog.
