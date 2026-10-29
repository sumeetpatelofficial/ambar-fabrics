import { CredentialsSignin } from "next-auth"

/**
 * Sign-in failures the form can explain. The `code` travels in a URL, so it names the situation without
 * hinting at anything an attacker could use (only reached after the password is right, except `invalid`).
 */
export class InvalidCredentialsError extends CredentialsSignin {
  override code = "invalid"
}
export class UnverifiedEmailError extends CredentialsSignin {
  override code = "unverified"
}
export class SuspendedAccountError extends CredentialsSignin {
  override code = "suspended"
}
export class RateLimitedError extends CredentialsSignin {
  override code = "rate_limited"
}

export type SignInFailure = "invalid" | "unverified" | "suspended" | "rate_limited"
