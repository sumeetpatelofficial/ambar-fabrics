import type { Metadata } from "next"
import Link from "next/link"
import { AuthCard } from "@/components/auth/auth-card"
import { ForgotForm } from "@/components/auth/forgot-form"

export const metadata: Metadata = { title: "Reset your password" }

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter the email address on your account and we will send a link to choose a new password."
      footer={
        <p>
          Remembered it?{" "}
          <Link href="/login" className="text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </p>
      }
    >
      <ForgotForm />
    </AuthCard>
  )
}
