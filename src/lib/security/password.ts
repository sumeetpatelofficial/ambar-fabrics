import "server-only"
import { hash, verify } from "@node-rs/argon2"

/**
 * Argon2id with the OWASP-recommended minimum cost (19 MiB, 2 passes, 1 lane); the algorithm defaults to
 * Argon2id. Each hash carries its own random salt and parameters, so the cost can be raised later and old
 * hashes still verify (see `needsRehash` in the auth service).
 */
export const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS)
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password)
  } catch {
    return false // a malformed hash must never behave like a match, or like a crash
  }
}

let dummy: Promise<string> | undefined

/**
 * Verifies against a throwaway hash so "no such account" costs the same time as "wrong password",
 * which keeps response time from revealing whether an email address is registered.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hashPassword("not-a-real-password-for-timing-only")
  await verifyPassword(await dummy, password)
}
