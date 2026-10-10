import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  consoleConfigured,
  safeEqualHex,
  sessionTokenFor,
  verifyConsoleSession,
  verifyPasscode,
} from "@/lib/console-auth";
import {
  clearAttempts,
  getClientIp,
  isRateLimited,
  recordFailedAttempt,
} from "@/lib/console-rate-limit";
import { POST as loginPost } from "@/app/api/console/login/route";
import { POST as createProjectRoute } from "@/app/api/console/projects/route";

const ORIGINAL_PASSCODE = process.env.DEMO_PASSCODE;

function setEnv(passcode: string | null) {
  if (passcode === null) delete process.env.DEMO_PASSCODE;
  else process.env.DEMO_PASSCODE = passcode;
}

function loginRequest(passcode: string, ip: string): Request {
  return new Request("http://localhost/api/console/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({ passcode }),
  });
}

describe("console auth helpers", () => {
  beforeEach(() => {
    setEnv(null);
  });
  afterEach(() => {
    if (ORIGINAL_PASSCODE === undefined) delete process.env.DEMO_PASSCODE;
    else process.env.DEMO_PASSCODE = ORIGINAL_PASSCODE;
  });

  it("reports disabled when no DEMO_PASSCODE is configured", () => {
    expect(consoleConfigured()).toBe(false);
    setEnv("correct horse battery staple");
    expect(consoleConfigured()).toBe(true);
  });

  it("verifies the right passcode and rejects the wrong one", () => {
    setEnv("correct horse battery staple");
    expect(verifyPasscode("correct horse battery staple")).toBe(true);
    expect(verifyPasscode("wrong")).toBe(false);
    expect(verifyPasscode("")).toBe(false);
  });

  it("never verifies against an unconfigured passcode", () => {
    expect(verifyPasscode("anything")).toBe(false);
  });

  it("derives a deterministic, non-plaintext session token", () => {
    setEnv("secret");
    const token = sessionTokenFor("secret");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(token).not.toContain("secret");
    expect(sessionTokenFor("secret")).toBe(token);
    expect(sessionTokenFor("other")).not.toBe(token);
  });

  it("validates session cookies with constant-time comparison", () => {
    setEnv("secret");
    expect(verifyConsoleSession(sessionTokenFor("secret"), "secret")).toBe(true);
    expect(verifyConsoleSession("garbage", "secret")).toBe(false);
    expect(verifyConsoleSession(undefined, "secret")).toBe(false);
    expect(verifyConsoleSession(null, "secret")).toBe(false);
    expect(verifyConsoleSession(sessionTokenFor("secret"), undefined)).toBe(false);
  });

  it("safeEqualHex rejects mismatched lengths without reading them", () => {
    expect(safeEqualHex("abc", "abcd")).toBe(false);
    expect(safeEqualHex("", "")).toBe(false);
    expect(safeEqualHex("abc", "abc")).toBe(true);
  });
});

describe("console rate limiter", () => {
  const WINDOW_MS = 15 * 60_000;
  afterEach(() => {
    for (const ip of ["lim-a", "lim-b", "lim-c"]) clearAttempts(ip);
  });

  it("allows attempts below the limit and locks past it", () => {
    expect(isRateLimited("lim-a", 0)).toBe(false);
    for (let i = 0; i < 5; i++) recordFailedAttempt("lim-a", i);
    expect(isRateLimited("lim-a", 5)).toBe(true);
    clearAttempts("lim-a");
    expect(isRateLimited("lim-a", 6)).toBe(false);
  });

  it("lets the window drain: old failures expire", () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt("lim-b", i);
    expect(isRateLimited("lim-b", 1000)).toBe(true);
    expect(isRateLimited("lim-b", WINDOW_MS + 60_000)).toBe(false);
  });

  it("returns the first forwarded IP as the client address", () => {
    const request = new Request("http://localhost/api/console/login", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    expect(getClientIp(request)).toBe("203.0.113.9");
    expect(getClientIp(new Request("http://localhost/"))).toBe("unknown");
  });
});

describe("POST /api/console/login", () => {
  beforeEach(() => {
    setEnv(null);
  });
  afterEach(() => {
    if (ORIGINAL_PASSCODE === undefined) delete process.env.DEMO_PASSCODE;
    else process.env.DEMO_PASSCODE = ORIGINAL_PASSCODE;
    // Route tests use throwaway IPs; clear them so they cannot pollute later.
    for (const ip of ["10.0.0.11", "10.0.0.12", "10.0.0.13", "10.0.0.14"]) {
      clearAttempts(ip);
    }
  });

  it("refuses to run when the console is disabled (no DEMO_PASSCODE)", async () => {
    const response = await loginPost(loginRequest("anything", "10.0.0.11"));
    expect(response.status).toBe(503);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe("console_disabled");
  });

  it("rejects a wrong passcode with 401 and counts the attempt", async () => {
    setEnv("secret");
    const response = await loginPost(loginRequest("nope", "10.0.0.12"));
    expect(response.status).toBe(401);
    // One failure is not yet a lockout (limit is 5)…
    expect(isRateLimited("10.0.0.12")).toBe(false);
    // …but it was counted, so four more real attempts would lock the IP.
    for (let i = 0; i < 4; i++) recordFailedAttempt("10.0.0.12");
    expect(isRateLimited("10.0.0.12")).toBe(true);
  });

  it("stays locked even with the right passcode once the limit is hit", async () => {
    setEnv("secret");
    for (let i = 0; i < 5; i++) recordFailedAttempt("10.0.0.13");
    const response = await loginPost(loginRequest("secret", "10.0.0.13"));
    expect(response.status).toBe(429);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe("rate_limited");
  });

  it("sets an httpOnly session cookie on success", async () => {
    setEnv("secret");
    const response = await loginPost(loginRequest("secret", "10.0.0.14"));
    expect(response.status).toBe(200);
    const cookies = response.headers.get("set-cookie") ?? "";
    expect(cookies).toContain("digsync_console=");
    expect(cookies).toContain("HttpOnly");
    expect(cookies).toContain("SameSite=lax");
  });
});

describe("console write routes are gated", () => {
  beforeEach(() => {
    setEnv(null);
  });
  afterEach(() => {
    if (ORIGINAL_PASSCODE === undefined) delete process.env.DEMO_PASSCODE;
    else process.env.DEMO_PASSCODE = ORIGINAL_PASSCODE;
  });

  it("POST /api/console/projects returns 401 without a session", async () => {
    // cookies() is unavailable outside a Next request scope, so the auth
    // guard fails closed — exactly what we want to assert here.
    const request = new Request("http://localhost/api/console/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "x" }),
    });
    const response = await createProjectRoute(request);
    expect(response.status).toBe(401);
  });
});