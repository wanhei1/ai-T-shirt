# Cache Strategy and SLOs (Top N Hot Routes)

## Scope

This document defines a global cache-aside strategy for the backend hot read routes, including TTL, invalidation triggers, and consistency priority.

## Top N Cache-Aside Routes

| Route | Cache key pattern | TTL | Consistency priority | Backsource |
|---|---|---:|---|---|
| `/gallery` | `gallery:list:<query-hash>` | 30s | eventual consistency | read replica / primary |
| `/gallery/:designId` | `gallery:item:<id>` | 30s | eventual consistency | read replica / primary |
| `/cart` | `cart:list:<userId>:v1` | 15s | read-your-write preferred | read replica / primary |
| `/orders/summary` | `orders:summary:<userId>:<limit>:v1` | 20s | read-your-write preferred | read replica / primary |
| `/orders` | `orders:list:<userId>:v1` | 20s | read-your-write preferred | read replica / primary |
| `/admin/orders` | `orders:admin:list:v1` | 10s | operational freshness | read replica / primary |
| `/memberships/me` | `membership:me:<userId>:v1` | 20s | strong correctness on writes | read replica / primary |
| `/memberships/transactions/me` | `membership:transactions:<userId>:<limit>:v1` | 20s | strong correctness on writes | read replica / primary |

## Invalidation Triggers

- Gallery data:
  - Trigger: `POST /gallery/publish`, order/cart checkout flows that publish to gallery.
  - Action: invalidate `gallery:list:*`; invalidate `gallery:item:<id>` when known.

- Cart data:
  - Trigger: `POST /cart`, `PUT /cart/:id`, `DELETE /cart/:id`, `POST /cart/clear`, `POST /cart/checkout`.
  - Action: invalidate `cart:list:<userId>:*`.

- Order data:
  - Trigger: `POST /orders`, `POST /cart/checkout`, `PUT /admin/orders/:orderId/status`.
  - Action: invalidate `orders:list:<userId>:*`, `orders:summary:<userId>:*`, and `orders:admin:list:*`.

- Membership data:
  - Trigger: `POST /orders`, `POST /cart/checkout`, `POST /memberships`.
  - Action: invalidate `membership:me:<userId>:*` and `membership:transactions:<userId>:*`.

## TTL Control (Environment Variables)

- `GALLERY_CACHE_TTL_SECONDS`
- `GALLERY_ITEM_CACHE_TTL_SECONDS`
- `CART_CACHE_TTL_SECONDS`
- `ORDERS_SUMMARY_CACHE_TTL_SECONDS`
- `ORDERS_LIST_CACHE_TTL_SECONDS`
- `ADMIN_ORDERS_CACHE_TTL_SECONDS`
- `MEMBERSHIP_CACHE_TTL_SECONDS`
- `MEMBERSHIP_TRANSACTIONS_CACHE_TTL_SECONDS`

## Metrics and Dashboard Queries

Use `/metrics` counters:

- `cache_hits_total{route=...}`
- `cache_misses_total{route=...}`
- `cache_backsource_total{route=...}`
- `cache_requests_total{route=...,result="hit|miss|store|invalidate|error"}`

Suggested PromQL panels:

- Global cache hit ratio:
  - `sum(rate(cache_requests_total{result="hit"}[5m])) / clamp_min(sum(rate(cache_requests_total{result=~"hit|miss"}[5m])), 1)`

- Hit ratio by route:
  - `sum(rate(cache_requests_total{result="hit"}[5m])) by (route) / clamp_min(sum(rate(cache_requests_total{result=~"hit|miss"}[5m])) by (route), 1)`

- Backsource QPS by route:
  - `sum(rate(cache_backsource_total[5m])) by (route)`

## Target Values

- Global hit ratio target: >= 70% on normal business traffic.
- Top routes (`/gallery`, `/orders`, `/cart`) hit ratio target: >= 75%.
- Backsource growth alarm: alert if hit ratio < 60% for 15 minutes while cache request volume is significant.
