/**
 * Creates the first super administrator (or promotes an existing account to it). There is deliberately no
 * way to do this from the website.
 *   pnpm admin:create --email you@example.com --name "Your Name"            dry run: shows what would happen
 *   pnpm admin:create --email you@example.com --name "Your Name" --yes       does it. A NEW account gets a one-time password;
 *                                                                         an EXISTING account keeps its password
 *   pnpm admin:create ... --yes --password "your own long passphrase"        uses a password you choose
 * An account created here is verified. Change its password after the first sign-in.
 * Passing --password on an existing account sets that password (and signs the person out everywhere).
 */
import { randomBytes } from "node:crypto"
import mongoose from "mongoose"
import { connectDb } from "@/lib/db/mongoose"
import { getServerEnv } from "@/lib/env/server"
import { User } from "@/models/user"
import { provisionSuperAdmin } from "@/services/auth-service"
import { describeTarget, loadEnv } from "./lib/script-env"

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  loadEnv()
  const email = arg("email")
  const name = arg("name")
  if (!email || !name) {
    console.error(
      'Usage: pnpm admin:create --email you@example.com --name "Your Name" [--password "..."] [--yes]'
    )
    process.exit(1)
  }
  const env = getServerEnv()
  console.log(
    `Target database: ${describeTarget(env.MONGODB_URI ?? "") || "(MONGODB_URI is not set)"}`
  )
  if (!env.MONGODB_URI) process.exit(1)
  if (!process.argv.includes("--yes")) {
    console.log(
      `Dry run. Would create or promote ${email} as a super administrator. Add --yes to do it.`
    )
    return
  }
  const chosen = arg("password")
  await connectDb()
  const exists = Boolean(await User.exists({ email: email.trim().toLowerCase() }))
  // A person who already has an account keeps their password unless one is given on purpose.
  const password = chosen ?? (exists ? undefined : randomBytes(15).toString("base64url")) // about 120 bits
  const result = await provisionSuperAdmin({ email, name, password })
  console.log(`${result.created ? "Created" : "Promoted"} ${email} as a super administrator.`)
  if (!password)
    console.log("Their existing password was left as it is. Sign out and back in to see the admin.")
  else if (!chosen)
    console.log(`One-time password (shown once, change it after signing in): ${password}`)
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())
