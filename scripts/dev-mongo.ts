/**
 * Local MongoDB (single-node replica set) without Docker, for development only.
 *   pnpm db:dev      prints a MONGODB_URI to put in .env.local and runs until Ctrl+C
 * Data lives in memory and is discarded on exit. Use `docker compose` (pnpm db:up) for persistent data.
 */
import { MongoMemoryReplSet } from "mongodb-memory-server"

async function main() {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, name: "rs0" } })
  console.log(`MONGODB_URI=${replSet.getUri("ambar_fabrics")}`)
  console.log("MongoDB (in-memory replica set) is running. Press Ctrl+C to stop.")

  const stop = async () => {
    await replSet.stop()
    process.exit(0)
  }
  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)
  setInterval(() => {}, 1 << 30) // keep the process alive
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
