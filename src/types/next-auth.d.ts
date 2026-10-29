import type { DefaultSession } from "next-auth"

// next-auth re-exports these types from @auth/core, so both module names are augmented.
declare module "next-auth" {
  interface User {
    /** Session version at the moment of sign-in; the session dies if the account's version moves on. */
    sv?: number
  }
  interface Session {
    user: { id: string; sv: number } & DefaultSession["user"]
  }
}

declare module "@auth/core/types" {
  interface User {
    sv?: number
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string
    sv?: number
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string
    sv?: number
  }
}
