import http from "k6/http";
import { check } from "k6";
export const options = { vus: 100, duration: "30s", thresholds: { http_req_duration: ["p(95)<200"] } };
export default function () {
  const response = http.get(`${__ENV.API_URL || "http://localhost:3000"}/board?hackathonId=${__ENV.HACKATHON_ID}`);
  check(response, { "board returns 200": (value) => value.status === 200 });
}
