import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
      include: ["app/api/**/*.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
