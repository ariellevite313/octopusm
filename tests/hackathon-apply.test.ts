import { describe, it, expect } from "vitest";
import { validateApplication, isPrivateIp, cleanHttpsUrl } from "@/lib/hackathon/apply";

const SOL = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const base = { name: "Nova Orbit", description: "Un agent qui gère ton portefeuille.", siteUrl: "https://nova.example.com", xHandle: "@novaorbit", category: "ai_agents" };

describe("validateApplication", () => {
  it("accepts a valid application and adds the applicant to the team", () => {
    const r = validateApplication(base, SOL);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.teamWallets).toEqual([SOL]); expect(r.value.xHandle).toBe("novaorbit"); }
  });
  it("requires an https website", () => {
    expect(validateApplication({ ...base, siteUrl: "http://nova.example.com" }, SOL).ok).toBe(false);
    expect(validateApplication({ ...base, siteUrl: undefined }, SOL).ok).toBe(false);
  });
  it("github is optional but must be https when given", () => {
    expect(validateApplication({ ...base, githubUrl: "" }, SOL).ok).toBe(true);
    expect(validateApplication({ ...base, githubUrl: "javascript:alert(1)" }, SOL).ok).toBe(false);
  });
  it("limits the team to 4 members", () => {
    const w = [
      "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
      "GDfnEsia2WLAW5t8yx2X5j2mkfA74i5kwGdDuZHt7XmG", "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH",
    ];
    expect(validateApplication({ ...base, teamWallets: w.slice(0, 3) }, SOL).ok).toBe(true);
    expect(validateApplication({ ...base, teamWallets: w }, SOL).ok).toBe(false);
  });
  it("rejects an invalid category and invalid wallets", () => {
    expect(validateApplication({ ...base, category: "casino" }, SOL).ok).toBe(false);
    expect(validateApplication({ ...base, teamWallets: ["nope"] }, SOL).ok).toBe(false);
  });
});

describe("isPrivateIp / cleanHttpsUrl", () => {
  it("blocks internal addresses", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.9", "169.254.169.254", "::1", "fd00::1"]) expect(isPrivateIp(ip)).toBe(true);
    expect(isPrivateIp("93.184.216.34")).toBe(false);
  });
  it("rejects credentials in URLs", () => {
    expect(cleanHttpsUrl("https://user:pw@site.com")).toBeNull();
  });
});
