/**
 * Loads (or removes) sample catalogue data.
 *   pnpm db:seed            show where it would write, change nothing
 *   pnpm db:seed --yes      replace the sample data (tagged "sample-data", SKUs "DEMO-..."), plus a sample
 *                           festive-offer coupon (FESTIVE15) and sample reviews for the home page
 *   pnpm db:unseed --yes    remove the sample data only; categories and real products are kept
 * Refuses to run with NODE_ENV=production unless --force is also given.
 */
import mongoose from "mongoose"
import { connectDb } from "@/lib/db/mongoose"
import { getServerEnv } from "@/lib/env/server"
import { describeTarget, loadEnv } from "./lib/script-env"
import { removeSampleCatalog, seedSampleCatalog } from "./lib/seed-catalog"
import { removeSampleHomeContent, seedSampleHomeContent } from "./lib/seed-home-samples"

async function main() {
  loadEnv()
  const args = new Set(process.argv.slice(2))
  const remove = args.has("--remove")
  const yes = args.has("--yes")
  const env = getServerEnv()
  const target = describeTarget(env.MONGODB_URI ?? "")

  console.log(`Target database: ${target || "(MONGODB_URI is not set)"}`)
  if (!env.MONGODB_URI) process.exit(1)
  if (env.NODE_ENV === "production" && !args.has("--force")) {
    console.error("Refusing to run with NODE_ENV=production. Add --force if you really mean it.")
    process.exit(1)
  }
  if (!yes) {
    console.log(
      `Dry run. Re-run with --yes to ${remove ? "remove" : "replace"} the sample data in this database.`
    )
    return
  }

  await connectDb()
  if (remove) {
    console.log("Removed:", await removeSampleHomeContent())
    console.log("Removed:", await removeSampleCatalog())
  } else {
    console.log("Seeded:", await seedSampleCatalog())
    console.log("Seeded (home page samples):", await seedSampleHomeContent())
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())
