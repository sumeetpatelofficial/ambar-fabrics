/**
 * Test server for Playwright: a throwaway MongoDB (in memory), seeded with the sample catalogue, and the
 * production build of the app on port 3100. Nothing here touches a real database: MONGODB_URI is
 * overridden for the child process, whatever .env.local says.
 *   E2E_SKIP_BUILD=1 reuses an existing build.
 */
import { spawn, spawnSync } from "node:child_process"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"
import { connectDb } from "@/lib/db/mongoose"
import { hashPassword } from "@/lib/security/password"
import { User } from "@/models/user"
import { provisionSuperAdmin } from "@/services/auth-service"
import {
  E2E_ADMIN,
  E2E_CRON_SECRET,
  E2E_EDITOR,
  E2E_LOOKS,
  E2E_MASTER,
  E2E_NAV,
  E2E_COUPONS,
  E2E_OWNER,
  E2E_THEME,
  E2E_REPORTS,
  E2E_STORE,
  E2E_SUPPORT,
} from "../tests/e2e/accounts"
import { Coupon } from "@/models/coupon"
import { seedSampleCatalog } from "./lib/seed-catalog"
import { seedSampleHomeContent } from "./lib/seed-home-samples"

const PORT = "3100"

async function main() {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, name: "rs0" } })
  const uri = replSet.getUri("e2e")
  process.env.MONGODB_URI = uri
  await connectDb()
  const seeded = await seedSampleCatalog()
  await seedSampleHomeContent() // the home page's festive offer and reviews
  await provisionSuperAdmin({
    email: E2E_OWNER.email,
    name: "Test Owner",
    password: E2E_OWNER.password,
  })
  await provisionSuperAdmin({
    email: E2E_ADMIN.email,
    name: "Test Admin",
    password: E2E_ADMIN.password,
  })
  await provisionSuperAdmin({
    email: E2E_EDITOR.email,
    name: "Test Editor",
    password: E2E_EDITOR.password,
  })
  await provisionSuperAdmin({
    email: E2E_LOOKS.email,
    name: "Test Looks",
    password: E2E_LOOKS.password,
  })
  await provisionSuperAdmin({
    email: E2E_NAV.email,
    name: "Test Nav",
    password: E2E_NAV.password,
  })
  await provisionSuperAdmin({
    email: E2E_COUPONS.email,
    name: "Test Coupons",
    password: E2E_COUPONS.password,
  })
  await provisionSuperAdmin({
    email: E2E_THEME.email,
    name: "Test Theme",
    password: E2E_THEME.password,
  })
  await provisionSuperAdmin({
    email: E2E_REPORTS.email,
    name: "Test Reports",
    password: E2E_REPORTS.password,
  })
  await provisionSuperAdmin({
    email: E2E_STORE.email,
    name: "Test Store",
    password: E2E_STORE.password,
  })
  await provisionSuperAdmin({
    email: E2E_MASTER.email,
    name: "Test Master",
    password: E2E_MASTER.password,
  })
  await User.create({
    email: E2E_SUPPORT.email,
    name: "Test Support",
    passwordHash: await hashPassword(E2E_SUPPORT.password),
    emailVerified: new Date(),
    role: "support",
  })
  await Coupon.create({ code: "WELCOME10", type: "percent", percent: 10, perUserLimit: 5 })
  await mongoose.disconnect()
  console.log(`[e2e] seeded ${seeded.products} products and 2 staff accounts`)

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MONGODB_URI: uri,
    NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
    NODE_ENV: "production",
    NEXT_DIST_DIR: ".next-e2e",
    NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-E2ETEST01", // makes the cookie banner exist; Google itself is never contacted
    ENABLE_DEV_PAGES: "1", // lets the component preview page and the test mailbox exist in this production build
    // Test-only secrets, and no real integrations: whatever .env.local holds is overridden.
    AUTH_SECRET: "e2e-only-auth-secret-0123456789abcdef0123456789abcdef",
    CRON_SECRET: E2E_CRON_SECRET,
    AUTH_GOOGLE_ID: "",
    AUTH_GOOGLE_SECRET: "",
    RESEND_API_KEY: "",
    EMAIL_FROM: "",
  }

  if (!process.env.E2E_SKIP_BUILD) {
    const build = spawnSync("pnpm", ["exec", "next", "build"], { env, stdio: "inherit" })
    if (build.status !== 0) {
      await replSet.stop()
      process.exit(build.status ?? 1)
    }
  }

  const server = spawn("pnpm", ["exec", "next", "start", "-p", PORT], { env, stdio: "inherit" })
  const stop = async () => {
    server.kill("SIGTERM")
    await replSet.stop()
    process.exit(0)
  }
  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)
  server.on("exit", async (code) => {
    await replSet.stop()
    process.exit(code ?? 0)
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
