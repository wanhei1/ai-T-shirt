import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:8185";

export const options = {
  scenarios: {
    chaos_probe: {
      executor: "constant-vus",
      vus: Number(__ENV.CHAOS_VUS || 20),
      duration: __ENV.CHAOS_DURATION || "5m",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<1500"],
    http_req_failed: ["rate<0.2"],
  },
};

export default function () {
  const healthResp = http.get(`${BASE_URL}/health`, { tags: { endpoint: "health" } });
  check(healthResp, {
    "health endpoint responds": (r) => r.status === 200 || r.status === 503,
  });

  const readyResp = http.get(`${BASE_URL}/health/ready`, { tags: { endpoint: "ready" } });
  check(readyResp, {
    "ready endpoint responds": (r) => r.status === 200 || r.status === 503,
  });

  const galleryResp = http.get(`${BASE_URL}/api/gallery?limit=10`, { tags: { endpoint: "gallery" } });
  check(galleryResp, {
    "gallery request returns status": (r) => [200, 429, 503].includes(r.status),
  });

  sleep(0.3);
}
