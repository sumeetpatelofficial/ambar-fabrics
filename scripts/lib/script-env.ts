import { existsSync } from "node:fs"

/** Scripts run outside Next, so load .env.local the same way Next does (existing variables win). */
export function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    if (existsSync(file)) process.loadEnvFile(file)
  }
}

/** "cluster0.xyz.mongodb.net/ambar_fabrics": where a script is about to write, without credentials. */
export function describeTarget(uri: string): string {
  const withoutCreds = uri.replace(/^(mongodb(?:\+srv)?:\/\/)[^@/]*@/i, "$1")
  return withoutCreds.replace(/^mongodb(\+srv)?:\/\//i, "").split("?")[0] ?? ""
}
