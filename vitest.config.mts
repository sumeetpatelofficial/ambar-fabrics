import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": r("./src"),
      // `server-only` throws outside a React Server environment, so tests use a no-op stub.
      "server-only": r("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node", // component tests opt in with `// @vitest-environment jsdom`
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/integration/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    clearMocks: true,
    coverage: { provider: "v8", include: ["src/lib/**", "src/services/**", "src/features/**"] },
  },
})
