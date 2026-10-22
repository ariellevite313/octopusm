import { describe, it, expect } from "vitest";
import { fetchImage } from "@/lib/mcp/fetch-image";

describe("fetchImage (liens d'images des outils MCP)", () => {
  it("refuse http, localhost et les adresses internes", async () => {
    await expect(fetchImage("http://example.com/a.png", 1e6)).rejects.toThrow(/https/);
    await expect(fetchImage("https://localhost/a.png", 1e6)).rejects.toThrow(/not allowed/);
    await expect(fetchImage("https://127.0.0.1/a.png", 1e6)).rejects.toThrow(/not allowed/);
    await expect(fetchImage("https://10.0.0.5/a.png", 1e6)).rejects.toThrow(/not allowed/);
    await expect(fetchImage("https://169.254.169.254/latest", 1e6)).rejects.toThrow(/not allowed/);
    await expect(fetchImage("https://[::1]/a.png", 1e6)).rejects.toThrow(/not allowed/);
    await expect(fetchImage("pas une url", 1e6)).rejects.toThrow(/invalid/);
  });
});
