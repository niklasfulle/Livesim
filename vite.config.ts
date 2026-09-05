import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "src/renderer",
  build: {
    outDir: "../../out/renderer",
    emptyOutDir: true
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"]
    }
  }
});
