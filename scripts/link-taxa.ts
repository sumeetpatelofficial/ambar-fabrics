/**
 * Turns the fabric and print names already on your products ("cotton", "bandhani") into master fabrics and
 * prints, and links each product to its master. Safe to run again: it only fills in what is missing.
 *   pnpm db:link-taxa            shows how many it would create and link (dry run)
 *   pnpm db:link-taxa --yes      does it
 */
import mongoose from "mongoose"
import { connectDb } from "@/lib/db/mongoose"
import { getServerEnv } from "@/lib/env/server"
import { Product } from "@/models/product"
import { Taxon } from "@/models/taxon"
import { linkProductsToTaxa } from "@/services/admin-taxonomy-service"
import { describeTarget, loadEnv } from "./lib/script-env"

async function main() {
  loadEnv()
  const env = getServerEnv()
  console.log(
    `Target database: ${describeTarget(env.MONGODB_URI ?? "") || "(MONGODB_URI is not set)"}`
  )
  if (!env.MONGODB_URI) process.exit(1)
  await connectDb()
  const [fabrics, prints, unlinkedFabric, unlinkedPrint] = await Promise.all([
    Taxon.countDocuments({ kind: "fabric" }),
    Taxon.countDocuments({ kind: "print" }),
    Product.countDocuments({
      fabricId: null,
      "attributes.fabricType": { $exists: true, $ne: null },
    }),
    Product.countDocuments({ printId: null, "attributes.pattern": { $exists: true, $ne: null } }),
  ])
  console.log(
    `Now: ${fabrics} fabrics and ${prints} prints. Products with a fabric name not yet linked: ${unlinkedFabric}. With a print name not yet linked: ${unlinkedPrint}.`
  )
  if (!process.argv.includes("--yes")) {
    console.log(
      "Dry run. Add --yes to create the missing fabrics and prints and link the products."
    )
    return
  }
  const result = await linkProductsToTaxa()
  console.log(
    `Created ${result.created} fabrics and prints, and linked ${result.linked} product entries.`
  )
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())
