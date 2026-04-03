import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:8185";
const PASSWORD = __ENV.PERF_TEST_PASSWORD || "PerfTest-123456";

export const options = {
  scenarios: {
    api_sync_rw: {
      executor: "ramping-vus",
      startVUs: Number(__ENV.START_VUS || 5),
      stages: [
        { duration: __ENV.STAGE_1 || "1m", target: Number(__ENV.STAGE_1_VUS || 20) },
        { duration: __ENV.STAGE_2 || "2m", target: Number(__ENV.STAGE_2_VUS || 50) },
        { duration: __ENV.STAGE_3 || "1m", target: Number(__ENV.STAGE_3_VUS || 0) },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<800", "p(99)<1200"],
  },
};

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

function uniqueIdentity() {
  const suffix = `${Date.now()}-${__VU}-${__ITER}`;
  return {
    username: `perf_user_${suffix}`,
    email: `perf_${suffix}@example.com`,
  };
}

export default function () {
  const identity = uniqueIdentity();

  const registerResp = http.post(
    `${BASE_URL}/api/register`,
    JSON.stringify({
      username: identity.username,
      email: identity.email,
      password: PASSWORD,
    }),
    { headers: { "Content-Type": "application/json" }, tags: { endpoint: "register" } }
  );

  check(registerResp, {
    "register succeeds": (r) => r.status === 201,
  });

  const loginResp = http.post(
    `${BASE_URL}/api/login`,
    JSON.stringify({
      email: identity.email,
      password: PASSWORD,
    }),
    { headers: { "Content-Type": "application/json" }, tags: { endpoint: "login" } }
  );

  const loginOk = check(loginResp, {
    "login succeeds": (r) => r.status === 200,
    "login contains token": (r) => {
      try {
        return Boolean(r.json("token"));
      } catch (_error) {
        return false;
      }
    },
  });

  if (!loginOk) {
    sleep(1);
    return;
  }

  const token = loginResp.json("token");

  const galleryResp = http.get(`${BASE_URL}/api/gallery?limit=20`, {
    tags: { endpoint: "gallery" },
  });
  check(galleryResp, {
    "gallery read succeeds": (r) => r.status === 200,
  });

  const profileResp = http.get(`${BASE_URL}/api/profile`, {
    headers: authHeaders(token),
    tags: { endpoint: "profile" },
  });
  check(profileResp, {
    "profile read succeeds": (r) => r.status === 200,
  });

  sleep(0.2);
}
