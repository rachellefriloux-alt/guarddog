import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const rootDir = dirname(fileURLToPath(new URL(import.meta.url)));

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(rootDir, "client/src"),
      "@shared": resolve(rootDir, "shared"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts"],
    coverage: {
      enabled: false,
    },
  },
});
