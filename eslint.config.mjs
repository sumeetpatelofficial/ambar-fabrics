import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", ".next-e2e/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"]),
  {
    rules: {
      // Rich text is rendered only through the one sanitized component added with the catalog (Phase 3).
      "react/no-danger": "error",
      "no-console": ["warn", { allow: ["error", "warn"] }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
    },
  },
  { files: ["scripts/**"], rules: { "no-console": "off" } },
  {
    // Layering: UI and routes go through features/services. Only repositories touch Mongoose models.
    files: ["src/app/**", "src/components/**", "src/hooks/**", "src/stores/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "mongoose", message: "Only repositories and src/lib/db may import mongoose." },
          ],
          patterns: [
            {
              group: ["@/models/*", "@/repositories/*"],
              message:
                "UI and route code must call services; only repositories may use models/mongoose.",
            },
          ],
        },
      ],
    },
  },
  {
    // Pages, layouts and components must not read server-only config or secrets directly.
    files: ["src/components/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "mongoose", message: "Only repositories and src/lib/db may import mongoose." },
          ],
          patterns: [
            {
              group: ["@/models/*", "@/repositories/*"],
              message: "Use services instead.",
            },
            { group: ["@/lib/env/server"], message: "Components must not import server env." },
          ],
        },
      ],
    },
  },
])

export default eslintConfig
