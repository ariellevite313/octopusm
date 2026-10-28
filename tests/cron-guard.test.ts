import { describe, it, expect, afterEach } from "vitest";
import { cronDenied } from "@/lib/auth/cron";

const req = (auth?: string) => new Request("http://x/api/cron/t", { headers: auth ? { authorization: auth } : {} });

describe("cronDenied", () => {
  const old = process.env.CRON_SECRET;
  afterEach(() => { if (old === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = old; });

  it("closes the route when CRON_SECRET is not set", () => {
    delete process.env.CRON_SECRET;
    expect(cronDenied(req("Bearer anything"))?.status).toBe(503);
  });
  it("rejects a missing or wrong bearer", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(cronDenied(req())?.status).toBe(401);
    expect(cronDenied(req("Bearer nope"))?.status).toBe(401);
  });
  it("accepts the right bearer", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(cronDenied(req("Bearer s3cret"))).toBeNull();
  });
});
