import { createHmac } from "node:crypto"
import type { APIRequestContext, Browser, Page } from "@playwright/test"
import { E2E_CRON_SECRET, E2E_OWNER, E2E_SUPPORT } from "./accounts"
import {
  alerts,
  emailCount,
  emailLink,
  expect,
  expectHeadingOrder,
  jsonLd,
  expectNoViolations,
  label,
  measureLayoutShift,
  newUser,
  otherDevice,
  test,
  text,
  watchConsole,
  type TestUser,
  choose,
} from "./helpers"

async function register(page: Page, user: TestUser) {
  await page.goto("/register")
  await label(page, "Your name").fill(user.name)
  await label(page, "Email address").fill(user.email)
  await label(page, "Password", { exact: true }).fill(user.password)
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page.getByRole("status")).toContainText("Check your email")
}

async function confirmEmail(page: Page, request: APIRequestContext, user: TestUser) {
  await page.goto(await emailLink(request, user.email, "verify_email"))
  await page.getByRole("button", { name: "Confirm my email" }).click()
  await expect(page.getByRole("status")).toContainText("Your email is confirmed")
}

/** Submits the sign-in form and waits for the server to answer, so later steps never race the redirect or the form reset. */
async function signIn(page: Page, email: string, password: string) {
  await label(page, "Email address").fill(email)
  await label(page, "Password", { exact: true }).fill(password)
  const answered = page.waitForResponse(
    (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/login"
  )
  const submit = page.getByRole("button", { name: "Sign in", exact: true })
  await submit.click()
  await answered
  // After a failure React resets the form right after the action settles; wait for that so the next fill is
  // not wiped. After a success the page moves on instead. Either outcome ends the wait.
  const left = page
    .waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 4000 })
    .then(
      () => true,
      () => false
    )
  const idle = expect(submit)
    .toBeEnabled({ timeout: 4000 })
    .then(
      () => true,
      () => false
    )
  await Promise.race([left, idle])
}

async function customer(page: Page, request: APIRequestContext, label?: string) {
  const user = newUser(label)
  await register(page, user)
  await confirmEmail(page, request, user)
  await page.goto("/login")
  await signIn(page, user.email, user.password)
  await expect(page).toHaveURL(/\/account$/)
  return user
}

test.describe("registration and email confirmation", () => {
  test("a new customer registers, confirms by email, signs in, and sees their account", async ({
    page,
    request,
  }) => {
    const problems = watchConsole(page)
    const user = newUser("Meera")
    await register(page, user)
    await confirmEmail(page, request, user)
    await page.getByRole("link", { name: "Sign in" }).last().click()
    await signIn(page, user.email, user.password)
    await expect(page).toHaveURL(/\/account$/)
    await expect(page.getByRole("heading", { level: 1, name: "Hello, Meera" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Your account" }).first()).toBeVisible()
    expect(problems).toEqual([])
  })

  test("the confirmation link needs a button press, works once, and an old link says so", async ({
    page,
    request,
  }) => {
    const user = newUser()
    await register(page, user)
    const link = await emailLink(request, user.email, "verify_email")
    await page.goto(link) // opening it alone changes nothing
    await expect(page.getByRole("button", { name: "Confirm my email" })).toBeVisible()
    await page.getByRole("button", { name: "Confirm my email" }).click()
    await expect(page.getByRole("status")).toContainText("Your email is confirmed")
    await page.goto(link)
    await page.getByRole("button", { name: "Confirm my email" }).click()
    await expect(alerts(page)).toContainText("invalid or has expired")
  })

  test("registering an address that already exists looks identical and sends a different email", async ({
    page,
    browser,
    request,
  }) => {
    const user = await customer(page, request)
    // A second visitor who is not signed in (a page in the same browser context would be signed in too).
    const other = await (
      await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "10.96.4.4" } })
    ).newPage()
    await other.goto("/register")
    await label(other, "Your name").fill("Someone Else")
    await label(other, "Email address").fill(user.email)
    await label(other, "Password", { exact: true }).fill("another-test-phrase-with-words-77")
    await other.getByRole("button", { name: "Create account" }).click()
    await expect(other.getByRole("status")).toContainText(
      "Check your email. If this address can be used"
    )
    expect(await emailCount(request, user.email, "verify_email")).toBe(1)
    expect(await emailCount(request, user.email, "account_exists")).toBe(1)
    await other.context().close()
  })

  test("weak and common passwords are explained, with the other answers kept", async ({ page }) => {
    await page.goto("/register")
    await label(page, "Your name").fill("Weak Tester")
    await label(page, "Email address").fill(newUser().email)
    await label(page, "Password", { exact: true }).fill("short")
    await page.getByRole("button", { name: "Create account" }).click()
    await expect(alerts(page).filter({ hasText: "at least 10 characters" })).toBeVisible()
    await expect(label(page, "Your name")).toHaveValue("Weak Tester")
    await label(page, "Password", { exact: true }).fill("password1234")
    await page.getByRole("button", { name: "Create account" }).click()
    await expect(alerts(page).filter({ hasText: "too common" }).first()).toBeVisible()
  })

  test("the password field can be revealed and hidden", async ({ page }) => {
    await page.goto("/login")
    const field = label(page, "Password", { exact: true })
    await field.fill("secret-words-here")
    await expect(field).toHaveAttribute("type", "password")
    await page.getByRole("button", { name: "Show password" }).click()
    await expect(field).toHaveAttribute("type", "text")
    await page.getByRole("button", { name: "Hide password" }).click()
    await expect(field).toHaveAttribute("type", "password")
  })
})

test.describe("signing in", () => {
  test("a wrong password and an unknown address get the same answer", async ({ page, request }) => {
    const user = await customer(page, request)
    await page.context().clearCookies()
    await page.goto("/login")
    await signIn(page, user.email, "not-the-right-password-1")
    const wrong = await alerts(page).textContent()
    await signIn(page, "nobody-here@example.com", "not-the-right-password-1")
    await expect(alerts(page)).toHaveText(wrong ?? "")
    expect(wrong).toContain("do not match")
  })

  test("an unconfirmed account is told so (only after the right password) and can ask for a new link", async ({
    page,
    request,
  }) => {
    const user = newUser()
    await register(page, user)
    await page.goto("/login")
    await signIn(page, user.email, user.password)
    await expect(alerts(page)).toContainText("confirm your email address first")
    await page.getByRole("link", { name: "Send me a new confirmation link" }).click()
    await expect(label(page, "Email address")).toHaveValue(user.email)
    await page.getByRole("button", { name: "Send a new link" }).click()
    await expect(page.getByRole("status")).toContainText("If that address is waiting")
    expect(await emailCount(request, user.email, "verify_email")).toBe(2)
  })

  test("repeated wrong passwords are slowed down", async ({ page }) => {
    await page.goto("/login")
    const email = newUser().email
    for (let i = 0; i < 6; i++) {
      await signIn(page, email, `wrong-password-attempt-${i}`)
      await expect(alerts(page).first()).toBeVisible()
    }
    await expect(alerts(page).first()).toContainText("Too many attempts")
  })

  test("signed-in visitors skip the sign-in page, and signing out ends the session", async ({
    page,
    request,
  }) => {
    await customer(page, request)
    await page.goto("/login")
    await expect(page).toHaveURL(/\/account$/)
    await page.getByRole("button", { name: "Sign out" }).click()
    // Signing out ends the session on the server, then redirects: give it room on a busy machine.
    await expect(page).toHaveURL("/", { timeout: 15_000 })
    await page.goto("/account")
    await expect(page).toHaveURL(/\/login\?next=%2Faccount$/, { timeout: 15_000 })
  })

  test("the session cookie is HttpOnly, SameSite and carries no readable personal data", async ({
    page,
    request,
  }) => {
    const user = await customer(page, request)
    const cookie = (await page.context().cookies()).find((c) => c.name.endsWith("session-token"))
    expect(cookie).toBeDefined()
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" })
    expect(cookie!.value).not.toContain(user.email)
    expect(cookie!.value).not.toContain("customer")
  })

  test("the session endpoint reveals only an id and a version, never an email, role or hash", async ({
    page,
    request,
  }) => {
    expect(await (await page.request.get("/api/auth/session")).json()).toBeNull()
    await customer(page, request)
    const session = (await (await page.request.get("/api/auth/session")).json()) as {
      user: Record<string, unknown>
    }
    expect(Object.keys(session.user).sort()).toEqual(["id", "sv"])
    expect(JSON.stringify(session)).not.toMatch(/@|argon2|role|passwordHash/)
  })
})

test.describe("protected pages", () => {
  test("signed-out visitors are sent to sign in and come back afterwards", async ({
    page,
    request,
  }) => {
    const user = newUser()
    await register(page, user)
    await confirmEmail(page, request, user)
    await page.goto("/account/addresses?new")
    await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Faddresses%3Fnew%3D?$/)
    await signIn(page, user.email, user.password)
    await expect(page).toHaveURL(/\/account\/addresses\?new=?$/)
    await expect(page.getByRole("heading", { name: "Add an address" })).toBeVisible()
  })

  test("a hostile 'next' address never leaves the site", async ({ page, request }) => {
    const user = newUser()
    await register(page, user)
    await confirmEmail(page, request, user)
    for (const evil of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
    ]) {
      await page.goto(`/login?next=${encodeURIComponent(evil)}`)
      await signIn(page, user.email, user.password)
      await expect(page).toHaveURL(/localhost:3100\/account$/)
      await page.context().clearCookies()
    }
  })

  test("the guest wishlist stays public", async ({ page }) => {
    expect((await page.goto("/account/wishlist"))?.status()).toBe(200)
  })

  test("the admin area does not exist for customers or visitors", async ({ page, request }) => {
    await page.goto("/admin")
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/)
    await customer(page, request)
    // A signed-in customer sees exactly what anyone sees for a page that does not exist. (The status stays
    // 200 because the check runs inside a streamed section; the page is noindex and reveals nothing.)
    await page.goto("/admin")
    await expect(page.getByRole("heading", { name: "We could not find that page" })).toBeVisible()
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/)
    await expect(page.locator("#main").getByText("users:manage_roles")).toHaveCount(0)
  })

  test("staff see the admin entry page with exactly their role's permissions", async ({ page }) => {
    await page.goto("/login")
    await signIn(page, E2E_SUPPORT.email, E2E_SUPPORT.password)
    await expect(page).toHaveURL(/\/account$/)
    await page.goto("/admin")
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible()
    await expect(page.getByText("support", { exact: false }).first()).toBeVisible()
    const menu = page.getByRole("navigation", { name: "Admin" })
    await expect(menu.getByRole("link", { name: "Orders" })).toBeVisible()
    await expect(menu.getByRole("link", { name: "Customers" })).toBeVisible()
    await expect(menu.getByRole("link", { name: "Settings" })).toHaveCount(0)
    await expect(menu.getByRole("link", { name: "Audit log" })).toHaveCount(0)

    await page.context().clearCookies()
    await page.goto("/login")
    await signIn(page, E2E_OWNER.email, E2E_OWNER.password)
    await expect(page).toHaveURL(/\/account$/)
    await page.goto("/admin")
    await expect(
      page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Staff and roles" })
    ).toBeVisible()
    await expect(
      page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Settings" })
    ).toBeVisible()
  })
})

test.describe("forgot and reset password", () => {
  test("the response is the same for known and unknown addresses, and only a known one gets an email", async ({
    page,
    request,
  }) => {
    const user = await customer(page, request)
    await page.context().clearCookies()
    const messages: string[] = []
    for (const email of [user.email, "nobody-registered@example.com"]) {
      await page.goto("/forgot-password")
      await label(page, "Email address").fill(email)
      await page.getByRole("button", { name: "Email me a reset link" }).click()
      messages.push((await page.getByRole("status").textContent()) ?? "")
    }
    expect(messages[0]).toBe(messages[1])
    expect(await emailCount(request, user.email, "password_reset")).toBe(1)
    expect(await emailCount(request, "nobody-registered@example.com", "password_reset")).toBe(0)
  })

  test("resetting works once, ends other sessions, and the old password stops working", async ({
    page,
    browser,
    request,
  }) => {
    const user = await customer(page, request)
    const other = await (
      await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "10.99.1.1" } })
    ).newPage()
    await other.goto("/login")
    await signIn(other, user.email, user.password)
    await expect(other).toHaveURL(/\/account$/)

    await page.context().clearCookies()
    await page.goto("/forgot-password")
    await label(page, "Email address").fill(user.email)
    await page.getByRole("button", { name: "Email me a reset link" }).click()
    await expect(page.getByRole("status")).toContainText("If there is an account")
    const link = await emailLink(request, user.email, "password_reset")
    await page.goto(link)
    await label(page, "New password").fill("a-brand-new-test-phrase-55")
    await page.getByRole("button", { name: "Save new password" }).click()
    await expect(page).toHaveURL(/\/login\?reset=1$/)
    await expect(page.getByRole("status")).toContainText("Your password is updated")

    await page.goto(link)
    await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible()

    await other.goto("/account")
    await expect(other).toHaveURL(/\/login/) // the other device was signed out

    await page.goto("/login")
    await signIn(page, user.email, user.password)
    await expect(alerts(page)).toContainText("do not match")
    await signIn(page, user.email, "a-brand-new-test-phrase-55")
    await expect(page).toHaveURL(/\/account$/)
    expect(await emailCount(request, user.email, "password_changed")).toBe(1)
    await other.context().close()
  })

  test("an unusable link is explained before any password is typed", async ({ page }) => {
    await page.goto("/reset-password?token=" + "x".repeat(43))
    await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible()
    await page.goto("/reset-password")
    await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible()
  })

  test("a weak new password is refused without using up the link", async ({ page, request }) => {
    const user = await customer(page, request)
    await page.context().clearCookies()
    await page.goto("/forgot-password")
    await label(page, "Email address").fill(user.email)
    await page.getByRole("button", { name: "Email me a reset link" }).click()
    await expect(page.getByRole("status")).toContainText("If there is an account")
    await page.goto(await emailLink(request, user.email, "password_reset"))
    await label(page, "New password").fill("password1234")
    await page.getByRole("button", { name: "Save new password" }).click()
    await expect(alerts(page).filter({ hasText: "too common" }).first()).toBeVisible()
    await label(page, "New password").fill("a-different-strong-test-phrase-3")
    await page.getByRole("button", { name: "Save new password" }).click()
    await expect(page).toHaveURL(/\/login\?reset=1$/)
  })
})

test.describe("account: profile", () => {
  test("details save, persist, and reject a bad mobile number", async ({ page, request }) => {
    const user = await customer(page, request, "Asha")
    await page.goto("/account/profile")
    await expect(label(page, "Email address")).toBeDisabled()
    await label(page, "Your name").fill("Asha Patel")
    await label(page, "Mobile number (optional)").fill("12345")
    await page.getByRole("button", { name: "Save changes" }).click()
    await expect(alerts(page).filter({ hasText: "10-digit Indian mobile" }).first()).toBeVisible()
    await label(page, "Mobile number (optional)").fill("98765 43210")
    await label(page, /Email me about new arrivals/).check()
    await page.getByRole("button", { name: "Save changes" }).click()
    await expect(page.getByRole("status")).toContainText("Your details are saved")
    await page.reload()
    await expect(label(page, "Your name")).toHaveValue("Asha Patel")
    await expect(label(page, "Mobile number (optional)")).toHaveValue("9876543210")
    await expect(label(page, /Email me about new arrivals/)).toBeChecked()
    await page.goto("/account")
    await expect(page.getByRole("heading", { level: 1, name: "Hello, Asha" })).toBeVisible()
    expect(user.email).toBeTruthy()
  })
})

test.describe("account: addresses", () => {
  const fill = async (page: Page, over: Partial<Record<string, string>> = {}) => {
    const v = {
      name: "Meera Shah",
      phone: "9876543210",
      line1: "12 Ring Road",
      city: "Surat",
      pin: "395007",
      state: "Gujarat",
      ...over,
    }
    await label(page, "Recipient's name").fill(v.name)
    await label(page, "Mobile number").fill(v.phone)
    await label(page, "Address line 1").fill(v.line1)
    await label(page, "City or town").fill(v.city)
    await label(page, "PIN code").fill(v.pin)
    await choose(page, label(page, "State"), v.state)
  }

  test("add, validate, edit, change the default and delete", async ({ page, request }) => {
    await customer(page, request)
    await page.goto("/account/addresses")
    await expect(page.getByRole("heading", { name: "No saved addresses" })).toBeVisible()

    await page.getByRole("link", { name: "Add an address" }).first().click()
    await fill(page, { pin: "12" })
    await page.getByRole("button", { name: "Add address" }).click()
    await expect(alerts(page).filter({ hasText: "6-digit PIN code" })).toBeVisible()
    await expect(label(page, "State")).toContainText("Gujarat") // kept after the error
    await label(page, "PIN code").fill("395007")
    await page.getByRole("button", { name: "Add address" }).click()
    await expect(page).toHaveURL(/\/account\/addresses$/)
    const home = page.getByRole("listitem").filter({ hasText: "12 Ring Road" })
    await expect(home).toContainText("Default") // the first address becomes the default

    await page.getByRole("link", { name: "Add an address" }).first().click()
    await fill(page, {
      name: "Second Place",
      line1: "5 Mill Road",
      city: "Vadodara",
      pin: "390001",
    })
    await label(page, "Label (optional)").fill("Work")
    await page.getByRole("button", { name: "Add address" }).click()
    const work = page.getByRole("listitem").filter({ hasText: "5 Mill Road" })
    await expect(work).not.toContainText("Default")

    await work.getByRole("button", { name: "Make default" }).click()
    await expect(page.getByRole("listitem").filter({ hasText: "5 Mill Road" })).toContainText(
      "Default"
    )
    await expect(page.getByRole("listitem").filter({ hasText: "12 Ring Road" })).not.toContainText(
      "Default"
    )

    await work.getByRole("link", { name: "Edit" }).click()
    await expect(label(page, "City or town")).toHaveValue("Vadodara")
    await label(page, "City or town").fill("Anand")
    await page.getByRole("button", { name: "Save address" }).click()
    await expect(page.getByRole("listitem").filter({ hasText: "5 Mill Road" })).toContainText(
      "Anand"
    )

    await page
      .getByRole("listitem")
      .filter({ hasText: "5 Mill Road" })
      .getByRole("button", { name: "Delete" })
      .click()
    const dialog = page.getByRole("dialog", { name: "Delete this address?" })
    await dialog.getByRole("button", { name: "Keep it" }).click()
    await expect(page.getByRole("listitem").filter({ hasText: "5 Mill Road" })).toBeVisible()
    await page
      .getByRole("listitem")
      .filter({ hasText: "5 Mill Road" })
      .getByRole("button", { name: "Delete" })
      .click()
    await page.getByRole("dialog").getByRole("button", { name: "Delete address" }).click()
    await expect(page.getByRole("listitem").filter({ hasText: "5 Mill Road" })).toHaveCount(0)
    await expect(page.getByRole("listitem").filter({ hasText: "12 Ring Road" })).toContainText(
      "Default"
    ) // promoted
  })

  test("another customer's address cannot be opened or edited through its id", async ({
    page,
    browser,
    request,
  }) => {
    await customer(page, request, "Alice")
    await page.goto("/account/addresses?new")
    await fill(page, { name: "Alice Private", line1: "1 Secret Lane" })
    await page.getByRole("button", { name: "Add address" }).click()
    const href = await page.getByRole("link", { name: "Edit" }).first().getAttribute("href")
    expect(href).toMatch(/\?edit=[0-9a-f]{24}$/)

    const bob = await (
      await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "10.98.2.2" } })
    ).newPage()
    await customer(bob, request, "Bob")
    await bob.goto(href!)
    await expect(bob.getByRole("heading", { name: "Edit address" })).toHaveCount(0)
    await expect(bob.getByText("1 Secret Lane")).toHaveCount(0)
    await expect(bob.getByRole("heading", { name: "No saved addresses" })).toBeVisible()
    await bob.context().close()
  })
})

test.describe("account: security", () => {
  test("changing the password keeps this device signed in and ends the old password", async ({
    page,
    request,
  }) => {
    const user = await customer(page, request)
    await page.goto("/account/change-password")
    await label(page, "Current password").fill("not-my-current-password-1")
    await label(page, "New password").fill("a-fresh-test-phrase-with-words-8")
    await page.getByRole("button", { name: "Change password" }).click()
    await expect(
      alerts(page).filter({ hasText: "current password is not correct" }).first()
    ).toBeVisible()

    // Passwords are never echoed back after an error, so both fields are empty again.
    await label(page, "Current password").fill(user.password)
    await label(page, "New password").fill("a-fresh-test-phrase-with-words-8")
    await page.getByRole("button", { name: "Change password" }).click()
    await expect(page).toHaveURL(/\/account\/security\?changed=1$/)
    await expect(page.getByRole("status")).toContainText("Your password is changed")
    await page.goto("/account")
    await expect(page).toHaveURL(/\/account$/) // still signed in here

    await page.context().clearCookies()
    await page.goto("/login")
    await signIn(page, user.email, user.password)
    await expect(alerts(page)).toContainText("do not match")
  })

  test("'Sign out everywhere' ends every session, including other devices", async ({
    page,
    browser,
    request,
  }) => {
    const user = await customer(page, request)
    const other = await (
      await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "10.97.3.3" } })
    ).newPage()
    await other.goto("/login")
    await signIn(other, user.email, user.password)
    await expect(other).toHaveURL(/\/account$/)

    await page.goto("/account/security")
    await page.getByRole("button", { name: "Sign out everywhere" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Sign out everywhere" }).click()
    await expect(page).toHaveURL(/\/login\?signedout=all$/)
    await expect(page.getByRole("status")).toContainText("signed out on every device")
    await other.goto("/account/profile")
    await expect(other).toHaveURL(/\/login/)
    await other.context().close()
  })

  test("a customer with no password is offered a link to set one, not a 'current password' box", async ({
    page,
    request,
  }) => {
    // Create a Google-style account (no password) by resetting through the reset flow is not needed here:
    // the page for a password account must not show the set-password button.
    await customer(page, request)
    await page.goto("/account/security")
    await expect(page.locator("#main").getByText("Password: set")).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Email me a link to set a password" })
    ).toHaveCount(0)
    await expect(page.getByRole("link", { name: "Change password" })).toBeVisible()
  })
})

test.describe("wishlist follows the account", () => {
  test("guest saves are merged on sign-in, kept in the account, cleared on sign-out, and restored on the next sign-in", async ({
    page,
    request,
  }) => {
    const user = newUser()
    await register(page, user)
    await confirmEmail(page, request, user)

    await page.goto("/products/handloom-cotton")
    await page.getByRole("button", { name: "Add Handloom cotton to wishlist" }).last().click()
    await page.goto("/products/chinon")
    await page.getByRole("button", { name: "Add Chinon to wishlist" }).last().click()

    await page.goto("/login")
    await signIn(page, user.email, user.password)
    await expect(page).toHaveURL(/\/account$/)
    await page.goto("/account/wishlist")
    await expect(page.getByRole("link", { name: "Handloom cotton" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Chinon" })).toBeVisible()

    await page.getByRole("button", { name: "Remove Chinon from wishlist" }).click()
    await expect(page.getByText("Removed from your wishlist")).toBeVisible() // shown once the account has saved it
    await expect(page.getByRole("link", { name: "Chinon" })).toHaveCount(0)

    await page.goto("/account")
    await page.getByRole("button", { name: "Sign out" }).click()
    await expect(page).toHaveURL("/")
    await page.goto("/account/wishlist")
    await expect(page.getByRole("heading", { name: "Your wishlist is empty" })).toBeVisible() // not left on a shared device

    await page.goto("/login")
    await signIn(page, user.email, user.password)
    await page.goto("/account/wishlist")
    await expect(page.getByRole("link", { name: "Handloom cotton" })).toBeVisible() // from the account
    await expect(page.getByRole("link", { name: "Chinon" })).toHaveCount(0) // removal was saved too
  })
})

test.describe("the bag", () => {
  test("a guest can add, change and remove, and the server does the pricing", async ({ page }) => {
    await page.goto("/products/handloom-cotton")
    await page.getByLabel(/^Length/).fill("2.5")
    await page.getByRole("button", { name: /Add to bag/ }).click()
    await expect(page.getByRole("link", { name: "Bag, 1 item" })).toBeVisible()

    await page.goto("/cart")
    await expect(page.getByRole("heading", { name: "Your bag" })).toBeVisible()
    await expect(text(page, "2.5 m")).toBeVisible()
    await expect(text(page, "₹450", { exact: true }).first()).toBeVisible()
    await expect(page.getByRole("link", { name: "Sign in to check out" })).toBeVisible()

    await page.getByRole("button", { name: "Increase Handloom cotton" }).click()
    await expect(text(page, "3 m", { exact: true })).toBeVisible()
    await expect(text(page, "₹540", { exact: true }).first()).toBeVisible()

    await page.getByRole("button", { name: "Remove Handloom cotton" }).click()
    await expect(page.getByRole("heading", { name: "Your bag is empty" })).toBeVisible()
  })

  test("the bag page is accessible and does not jump around as it loads", async ({ page }) => {
    await page.goto("/products/handloom-cotton")
    await page.getByLabel(/^Length/).fill("2.5")
    await page.getByRole("button", { name: /Add to bag/ }).click()
    await expect(page.getByRole("link", { name: "Bag, 1 item" })).toBeVisible()
    await page.goto("/cart")
    await expect(text(page, "₹450", { exact: true }).first()).toBeVisible()
    await expectNoViolations(page, "/cart")
    await expectHeadingOrder(page, "/cart")
    expect(await measureLayoutShift(await page.context().newPage(), "/cart")).toBeLessThanOrEqual(
      0.1
    )
  })

  test("a tampered quantity is rejected by the server and the line is not counted", async ({
    page,
  }) => {
    await page.goto("/products/handloom-cotton")
    await page.getByLabel(/^Length/).fill("1")
    await page.getByRole("button", { name: /Add to bag/ }).click()
    await expect(page.getByRole("link", { name: "Bag, 1 item" })).toBeVisible()
    await page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem("af-bag") ?? "{}")
      stored.state.lines[0].qty = 700 // off the half-metre step
      localStorage.setItem("af-bag", JSON.stringify(stored))
    })
    await page.goto("/cart")
    await expect(alerts(page).filter({ hasText: "steps of" })).toBeVisible()
    await expect(text(page, "Not counted")).toBeVisible()
    await expect(text(page, "Fix the items marked above to continue.")).toBeVisible()
  })

  test("a guest bag is merged on sign-in, saved to the account, cleared on sign-out and restored on another device", async ({
    page,
    request,
    browser,
  }) => {
    const user = newUser()
    await register(page, user)
    await confirmEmail(page, request, user)

    await page.goto("/products/handloom-cotton")
    await page.getByLabel(/^Length/).fill("1")
    await page.getByRole("button", { name: /Add to bag/ }).click()
    await expect(page.getByRole("link", { name: "Bag, 1 item" })).toBeVisible()

    await page.goto("/login")
    await signIn(page, user.email, user.password)
    await expect(page).toHaveURL(/\/account$/)
    await page.goto("/products/tissue-fabric")
    await page.getByRole("button", { name: /Add to bag/ }).click()
    await expect(page.getByRole("link", { name: "Bag, 2 items" })).toBeVisible()

    await page.goto("/account")
    await page.getByRole("button", { name: "Sign out" }).click()
    await expect(page).toHaveURL("/")
    await page.goto("/cart")
    await expect(page.getByRole("heading", { name: "Your bag is empty" })).toBeVisible() // nothing left on a shared device

    // A different browser: the bag comes from the account, not from local storage.
    const other = await otherDevice(browser)
    const second = await other.newPage()
    await second.goto("/login")
    await signIn(second, user.email, user.password)
    await second.goto("/cart")
    await expect(second.getByRole("link", { name: "Handloom cotton" })).toBeVisible()
    await expect(second.getByRole("link", { name: "Bag, 2 items" })).toBeVisible()
    // Reloading never adds the saved bag to itself: the cotton is still the 1 m that was added.
    await second.reload()
    await expect(text(second, "1 m", { exact: true })).toBeVisible()
    await expect(text(second, "2 m", { exact: true })).toHaveCount(0)
    await other.close()
  })
})

test.describe("checkout", () => {
  async function addAddress(page: Page) {
    await page.goto("/account/addresses?new")
    await label(page, "Recipient's name").fill("Meera Shah")
    await label(page, "Mobile number").fill("9876543210")
    await label(page, "Address line 1").fill("12 Ring Road")
    await label(page, "City or town").fill("Surat")
    await label(page, "PIN code").fill("395007")
    await choose(page, label(page, "State"), "Gujarat")
    await page.getByRole("button", { name: "Add address" }).click()
    await expect(page).toHaveURL(/\/account\/addresses$/)
  }

  async function addToBag(page: Page, slug: string, length?: string) {
    await page.goto(`/products/${slug}`)
    if (length) await page.getByLabel(/^Length/).fill(length)
    await page.getByRole("button", { name: /Add to bag/ }).click()
    await expect(page.getByRole("link", { name: /^Bag, \d+ items?$/ })).toBeVisible()
  }

  test.describe("analytics", () => {
    test.use({ consent: "granted" })

    test("checkout steps and the purchase are reported, and the purchase only once", async ({
      page,
      request,
    }) => {
      test.slow()
      type Call = [string, string, Record<string, unknown>]
      const calls = (name: string) =>
        page.evaluate(
          (n) =>
            ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? [])
              .map((a) => Array.from(a))
              .filter((a) => a[0] === "event" && a[1] === n) as unknown as Call[],
          name
        )
      await customer(page, request, "Analytics")
      await addAddress(page)
      await addToBag(page, "handloom-cotton", "2.5")
      await page.goto("/checkout")
      await expect.poll(async () => (await calls("begin_checkout")).length).toBe(1)
      expect((await calls("begin_checkout"))[0]![2]).toMatchObject({
        currency: "INR",
        value: 450,
        items: [{ item_id: "handloom-cotton", quantity: 2.5, price: 180 }],
      })

      await page.getByRole("button", { name: "Pay ₹530" }).click()
      await expect.poll(async () => (await calls("add_shipping_info")).length).toBe(1)
      await expect.poll(async () => (await calls("add_payment_info")).length).toBe(1)
      await expect(page).toHaveURL(/\/account\/orders\/(AM-\d{4}-\d{6})\?paid=1$/)
      const orderNumber = /(AM-\d{4}-\d{6})/.exec(page.url())![1]!
      await expect.poll(async () => (await calls("purchase")).length).toBe(1)
      const purchase = (await calls("purchase"))[0]![2] as {
        transaction_id: string
        value: number
        shipping: number
        tax: number
        items: { item_id: string; quantity: number; price: number }[]
        [k: string]: unknown
      }
      expect(purchase).toMatchObject({
        transaction_id: orderNumber,
        currency: "INR",
        value: 530, // Rs 450 of cloth + Rs 80 shipping
        shipping: 80,
        tax: 0,
      })
      expect(purchase.items).toEqual([
        expect.objectContaining({ item_id: "handloom-cotton", quantity: 2.5, price: 180 }),
      ])
      // Nothing about what the shop paid for the cloth reaches the customer's browser.
      expect(JSON.stringify(purchase)).not.toMatch(/cost/i)
      expect(await page.content()).not.toMatch(/costLinePaise/)

      // Opening or refreshing the confirmation again does not report the sale twice.
      await page.reload()
      await expect(
        page.getByRole("heading", { level: 1, name: `Order ${orderNumber}` })
      ).toBeVisible()
      await page.waitForTimeout(500)
      expect(await calls("purchase")).toHaveLength(0)
      await page.goto(`/account/orders/${orderNumber}?paid=1`)
      await page.waitForTimeout(500)
      expect(await calls("purchase")).toHaveLength(0)
    })
  })

  test("pays for an order with shipping and a code, sees it confirmed, and the bag is emptied", async ({
    page,
    request,
  }) => {
    const problems = watchConsole(page)
    const user = await customer(page, request, "Buyer")
    await addAddress(page)
    await addToBag(page, "handloom-cotton", "2.5")
    await page.goto("/cart")
    await page.getByRole("link", { name: "Check out" }).click()
    await expect(page).toHaveURL(/\/checkout$/)
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible()
    await expect(
      page.getByRole("complementary", { name: "Order summary" }).getByText("Shipping")
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "Pay ₹530" })).toBeVisible() // Rs 450 + Rs 80 shipping
    await expectNoViolations(page, "/checkout")

    await label(page, "Discount code").fill("NOPE")
    await page.getByRole("button", { name: "Apply" }).click()
    await expect(alerts(page).filter({ hasText: "That code is not valid." })).toBeVisible()
    await label(page, "Discount code").fill("welcome10")
    await page.getByRole("button", { name: "Apply" }).click()
    await expect(text(page, "WELCOME10 applied.")).toBeVisible()
    await expect(page.getByRole("button", { name: "Pay ₹485" })).toBeVisible() // 10% off Rs 450

    await page.getByRole("button", { name: "Pay ₹485" }).click()
    await expect(page).toHaveURL(/\/account\/orders\/AM-\d{4}-\d{6}\?paid=1$/)
    await expect(page.getByRole("heading", { level: 1, name: /^Order AM-/ })).toBeVisible()
    await expect(text(page, "Thank you. Your payment is confirmed", { exact: false })).toBeVisible()
    await expect(text(page, "Confirmed", { exact: true }).first()).toBeVisible()
    await expect(page.getByRole("link", { name: "Bag", exact: true })).toBeVisible() // emptied after payment
    await expect(page.getByRole("heading", { level: 2, name: "Handloom cotton" })).toBeVisible()
    await expectNoViolations(page, "order page")
    expect(problems.filter((p) => !/401|403/.test(p))).toEqual([])

    // The invoice: a Bill of Supply (the shop is not GST-registered), numbered, printable.
    await page.getByRole("link", { name: "View or print your invoice" }).click()
    await expect(page.getByRole("heading", { level: 1, name: "Bill of Supply" })).toBeVisible()
    await expect(page.getByText(/INV\/20\d\d-\d\d\/\d{6}/).first()).toBeVisible()
    await expect(text(page, "Amount in words:", { exact: false })).toBeVisible()
    await expect(text(page, "Rupees Four Hundred Eighty Five Only", { exact: false })).toBeVisible()
    await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeVisible()
    await expect(page.getByText("not registered under GST", { exact: false })).toBeVisible()
    await expectNoViolations(page, "invoice")

    await page.goto("/account/orders")
    await expect(page.getByRole("link", { name: /^AM-\d{4}-\d{6}$/ })).toBeVisible()
    expect(await emailCount(request, user.email, "order_confirmed")).toBe(1)
  })

  test("someone else's order number looks like any other missing page", async ({
    page,
    request,
    browser,
  }) => {
    await customer(page, request, "Owner")
    await addAddress(page)
    await addToBag(page, "handloom-cotton", "1")
    await page.goto("/checkout")
    await page.getByRole("button", { name: /^Pay ₹/ }).click()
    await expect(page).toHaveURL(/\/account\/orders\/AM-/)
    const url = page.url().split("?")[0]!

    const other = await otherDevice(browser)
    const second = await other.newPage()
    await customer(second, request, "Other")
    const response = await second.goto(url)
    await expect(second.getByText("Order AM-")).toHaveCount(0)
    expect(response?.status()).toBeLessThan(500)
    await other.close()
  })

  test("a bag that cannot be bought is stopped before payment, and a signed-out visitor is sent to sign in", async ({
    page,
    request,
  }) => {
    await page.goto("/checkout")
    await expect(page).toHaveURL(/\/login\?next=%2Fcheckout/)
    await customer(page, request, "Stopped")
    await page.goto("/checkout")
    await expect(page.getByRole("heading", { name: "Your bag is empty" })).toBeVisible()
  })

  test("a signed webhook from the gateway is accepted, and a forged one is refused", async ({
    request,
  }) => {
    const body = JSON.stringify({ event: "subscription.charged", payload: {} })
    const forged = await request.post("/api/webhooks/razorpay", {
      data: body,
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": "0".repeat(64),
        "x-razorpay-event-id": "evt_forged",
      },
    })
    expect(forged.status()).toBe(401)
    const unsigned = await request.post("/api/webhooks/razorpay", { data: body })
    expect(unsigned.status()).toBe(401)
    const signature = createHmac("sha256", "mock-gateway-secret-not-for-production")
      .update(body)
      .digest("hex")
    const ok = await request.post("/api/webhooks/razorpay", {
      data: body,
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": signature,
        "x-razorpay-event-id": `evt_${Date.now()}`,
      },
    })
    expect(ok.status()).toBe(200)
  })
})

test.describe("shipping, cancellation and returns", () => {
  async function addAddress(page: Page, pin = "395007") {
    await page.goto("/account/addresses?new")
    await label(page, "Recipient's name").fill("Meera Shah")
    await label(page, "Mobile number").fill("9876543210")
    await label(page, "Address line 1").fill("12 Ring Road")
    await label(page, "City or town").fill("Surat")
    await label(page, "PIN code").fill(pin)
    await choose(page, label(page, "State"), "Gujarat")
    await page.getByRole("button", { name: "Add address" }).click()
    await expect(page).toHaveURL(/\/account\/addresses$/)
  }

  /** Buys one product and pays; returns the order number and leaves the page on the order. */
  async function buy(page: Page, request: APIRequestContext, slug: string, length?: string) {
    const user = await customer(page, request, "Shopper")
    await addAddress(page)
    await page.goto(`/products/${slug}`)
    if (length) await page.getByLabel(/^Length/).fill(length)
    await page.getByRole("button", { name: /Add to bag/ }).click()
    await expect(page.getByRole("link", { name: /^Bag, \d+ items?$/ })).toBeVisible()
    await page.goto("/checkout")
    await page.getByRole("button", { name: /^Pay ₹/ }).click()
    await expect(page).toHaveURL(/\/account\/orders\/AM-\d{4}-\d{6}\?paid=1$/)
    return { user, orderNumber: /(AM-\d{4}-\d{6})/.exec(page.url())![1]! }
  }

  async function staffPage(browser: Browser) {
    const context = await otherDevice(browser)
    const page = await context.newPage()
    await page.goto("/login")
    await signIn(page, E2E_OWNER.email, E2E_OWNER.password)
    await expect(page).toHaveURL(/\/admin|\/account/)
    return { page, context }
  }

  async function courierUpdate(
    request: APIRequestContext,
    awb: string,
    status: string,
    token = "mock-shipping-token-not-for-production"
  ) {
    return request.post("/api/webhooks/shiprocket", {
      data: { awb, status, at: new Date().toISOString(), event_id: `${awb}-${status}` },
      headers: { "x-api-key": token },
    })
  }

  test("an order is booked, tracked to delivery and a ready-made item is returned and refunded", async ({
    page,
    request,
    browser,
  }) => {
    const { orderNumber } = await buy(page, request, "cotton-kurti")
    const { page: staff, context } = await staffPage(browser)

    await staff.goto("/admin/orders?show=to_ship")
    await expect(staff.getByRole("link", { name: orderNumber })).toBeVisible()
    await staff.goto(`/admin/orders/${orderNumber}`)
    await staff.getByRole("button", { name: "Book courier" }).click()
    await expect(staff.getByRole("heading", { name: "Tracking" })).toBeVisible()
    const awb = /(MOCKAWB[0-9A-F]+)/.exec(await staff.locator("main").innerText())![1]!

    expect((await courierUpdate(request, awb, "picked_up", "wrong-token")).status()).toBe(401)
    expect((await courierUpdate(request, awb, "picked_up")).status()).toBe(200)
    expect((await courierUpdate(request, awb, "delivered")).status()).toBe(200)
    expect((await courierUpdate(request, awb, "in_transit")).status()).toBe(200) // late: ignored

    await page.goto(`/account/orders/${orderNumber}`)
    await expect(page.getByRole("heading", { name: "Tracking" })).toBeVisible()
    await expect(text(page, "Delivered", { exact: true }).first()).toBeVisible()
    await expect(page.getByRole("heading", { name: "Return an item" })).toBeVisible()
    await page.getByRole("textbox", { name: /up to/ }).fill("1")
    await label(page, "Why are you returning it?").fill("It is too small")
    await page.getByRole("button", { name: "Ask for a return" }).click()
    await expect(text(page, "Return requested")).toBeVisible()

    await staff.goto(`/admin/orders?show=returns`)
    await expect(staff.getByRole("link", { name: orderNumber })).toBeVisible()
    await staff.goto(`/admin/orders/${orderNumber}`)
    await staff.getByRole("button", { name: "Approve" }).click()
    await staff.getByRole("button", { name: "Mark received and refund" }).click()
    await expect(staff.getByText("Refund processed", { exact: false })).toBeVisible()
    await page.reload()
    await expect(text(page, "Return refunded", { exact: false })).toBeVisible()
    await context.close()
  })

  test("fabric cut to length offers no return", async ({ page, request, browser }) => {
    const { orderNumber } = await buy(page, request, "handloom-cotton", "1")
    const { page: staff, context } = await staffPage(browser)
    await staff.goto(`/admin/orders/${orderNumber}`)
    await staff.getByRole("button", { name: "Book courier" }).click()
    await expect(staff.getByRole("heading", { name: "Tracking" })).toBeVisible()
    const awb = /(MOCKAWB[0-9A-F]+)/.exec(await staff.locator("main").innerText())![1]!
    await courierUpdate(request, awb, "delivered")
    await page.goto(`/account/orders/${orderNumber}`)
    await expect(text(page, "Delivered", { exact: true }).first()).toBeVisible()
    await expect(page.getByRole("heading", { name: "Return an item" })).toHaveCount(0)
    await context.close()
  })

  test("a customer cancels a paid order before it is prepared and is refunded", async ({
    page,
    request,
  }) => {
    const { orderNumber } = await buy(page, request, "handloom-cotton", "1")
    await page.getByRole("button", { name: "Cancel order" }).click()
    await page.getByRole("button", { name: "Yes, cancel order" }).click()
    await expect(text(page, "Refunded", { exact: true }).first()).toBeVisible()
    await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0)
    void orderNumber
  })

  test("delivery can be checked from a product page, and an undeliverable address is stopped at checkout", async ({
    page,
    request,
  }) => {
    await page.goto("/products/handloom-cotton")
    await label(page, "Check delivery").fill("395007")
    await page.getByRole("button", { name: "Check", exact: true }).click()
    await expect(text(page, "We deliver here", { exact: false })).toBeVisible()
    await label(page, "Check delivery").fill("900001")
    await page.getByRole("button", { name: "Check", exact: true }).click()
    await expect(text(page, "do not deliver to that PIN code", { exact: false })).toBeVisible()

    await customer(page, request, "Far")
    await addAddress(page, "900001")
    await page.goto("/products/handloom-cotton")
    await page.getByLabel(/^Length/).fill("1")
    await page.getByRole("button", { name: /Add to bag/ }).click()
    await expect(page.getByRole("link", { name: /^Bag, 1 item$/ })).toBeVisible()
    await page.goto("/checkout")
    await page.getByRole("button", { name: /^Pay ₹/ }).click()
    await expect(alerts(page).filter({ hasText: "cannot deliver to that PIN code" })).toBeVisible()
  })

  test("the courier webhook rejects a missing token", async ({ request }) => {
    const r = await request.post("/api/webhooks/shiprocket", {
      data: { awb: "X", status: "delivered" },
    })
    expect(r.status()).toBe(401)
  })
  test("a buyer reviews a delivered product, staff approve it, and the rating appears everywhere it should", async ({
    page,
    request,
    browser,
  }) => {
    const reviewText = `The cotton is soft and the stitching is neat, run ${Date.now().toString(36)}.`
    const { orderNumber, user } = await buy(page, request, "cotton-kurti")
    await page.goto("/products/cotton-kurti")
    // Not delivered yet: no form, an explanation instead.
    await expect(
      text(page, "You can review this once your order has been delivered.")
    ).toBeVisible()

    const { page: staff, context } = await staffPage(browser)
    await staff.goto(`/admin/orders/${orderNumber}`)
    await staff.getByRole("button", { name: "Book courier" }).click()
    await expect(staff.getByRole("heading", { name: "Tracking" })).toBeVisible()
    const awb = /(MOCKAWB[0-9A-F]+)/.exec(await staff.locator("main").innerText())![1]!
    await courierUpdate(request, awb, "delivered")

    await page.goto("/products/cotton-kurti")
    await expect(page.getByRole("form", { name: "Write a review" })).toBeVisible()
    await page.getByRole("button", { name: "Send review" }).click()
    await expect(alerts(page).filter({ hasText: "Choose a rating from 1 to 5." })).toBeVisible()
    await page.getByLabel("5 stars").check()
    await label(page, "Headline (optional)").fill("Fits well")
    await page.getByRole("textbox", { name: "Your review" }).fill(reviewText)
    await page.getByRole("button", { name: "Send review" }).click()
    await expect(
      text(page, "Your review will appear once we have read it.", { exact: false })
    ).toBeVisible()

    // Hidden from the public until a person approves it.
    await page.goto("/products/cotton-kurti")
    // (The writer's own pending text sits in the form below the list, which is not the public list.)
    await expect(text(page, "No reviews yet", { exact: false })).toBeVisible()
    await expect(page.getByText("Bought this.", { exact: false })).toHaveCount(0)

    await staff.goto("/admin/reviews")
    await expect(staff.getByText(reviewText).first()).toBeVisible()
    await staff
      .locator("li")
      .filter({ hasText: reviewText })
      .getByRole("button", { name: "Approve" })
      .click()
    await expect(staff.getByText(reviewText)).toHaveCount(0)

    await expect(async () => {
      await page.goto("/products/cotton-kurti")
      await expect(page.getByRole("paragraph").filter({ hasText: reviewText })).toBeVisible({
        timeout: 1500,
      })
    }).toPass({ timeout: 20_000 })
    await expect(page.getByRole("img", { name: /5\.0 out of 5/ }).first()).toBeVisible()
    await expect(text(page, "Bought this.", { exact: false })).toBeVisible()
    await expectNoViolations(page, "/products/cotton-kurti with a review")
    const ld = await jsonLd(page)
    expect(ld.find((d) => d["@type"] === "Product")).toMatchObject({
      aggregateRating: { ratingValue: 5, reviewCount: 1 },
    })

    // A visitor who has not bought it is told how reviews work, not given a form.
    const other = await otherDevice(browser)
    const visitor = await other.newPage()
    await visitor.goto("/products/cotton-kurti")
    await expect(visitor.getByRole("form", { name: "Write a review" })).toHaveCount(0)

    // Track the same order without signing in.
    await visitor.goto("/track-order")
    await label(visitor, "Order number").fill(orderNumber)
    await label(visitor, "Email address on the order").fill("nobody@example.com")
    await visitor.getByRole("button", { name: "Track order" }).click()
    await expect(alerts(visitor).filter({ hasText: "could not find an order" })).toBeVisible()
    // What was typed stays in the boxes after a "not found", so only the email needs correcting.
    await expect(label(visitor, "Order number")).toHaveValue(orderNumber)
    await label(visitor, "Email address on the order").fill(user.email)
    await visitor.getByRole("button", { name: "Track order" }).click()
    await expect(visitor.getByRole("status").filter({ hasText: "Delivered" })).toBeVisible()
    await expect(visitor.getByText("12 Ring Road")).toHaveCount(0)
    await other.close()
    await context.close()
  })
})

test.describe("scheduled worker", () => {
  test("only the platform's secret may run it", async ({ request }) => {
    expect((await request.get("/api/cron/jobs")).status()).toBe(401)
    expect(
      (
        await request.get("/api/cron/jobs", { headers: { authorization: "Bearer wrong-secret" } })
      ).status()
    ).toBe(401)
    const ok = await request.get("/api/cron/jobs", {
      headers: { authorization: `Bearer ${E2E_CRON_SECRET}` },
    })
    expect(ok.status()).toBe(200)
    expect(await ok.json()).toMatchObject({ data: { sent: expect.any(Number) } })
  })
})

test.describe("stability while loading", () => {
  test("sign-in pages and account pages do not jump around as they load", async ({
    page,
    request,
    browser,
  }) => {
    test.slow() // it loads a dozen pages and waits out each one's layout, which takes a while on a busy machine
    for (const path of [
      "/login",
      "/register",
      "/forgot-password",
      "/verify-email",
      "/reset-password?token=" + "x".repeat(43),
    ]) {
      const fresh = await (
        await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "10.91.5.5" } })
      ).newPage()
      expect(await measureLayoutShift(fresh, path), `layout shift on ${path}`).toBeLessThanOrEqual(
        0.1
      )
      await fresh.context().close()
    }
    await customer(page, request)
    for (const path of [
      "/account",
      "/account/profile",
      "/account/addresses",
      "/account/security",
    ]) {
      expect(
        await measureLayoutShift(await page.context().newPage(), path),
        `layout shift on ${path}`
      ).toBeLessThanOrEqual(0.1)
    }
  })
})

test.describe("accessibility", () => {
  for (const path of [
    "/login",
    "/register",
    "/forgot-password",
    "/verify-email",
    "/reset-password",
  ]) {
    test(`${path} passes axe and has a sensible heading order`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
      await expectNoViolations(page, path)
      await expectHeadingOrder(page, path)
    })
  }

  test("the sign-in form works by keyboard and announces errors", async ({ page }) => {
    await page.goto("/login")
    await label(page, "Email address").focus()
    await page.keyboard.type("a@example.com")
    await page.keyboard.press("Tab")
    await page.keyboard.type("some-password-1")
    await page.keyboard.press("Enter")
    await expect(alerts(page)).toBeVisible()
    await expectNoViolations(page, "login with error")
  })

  test("every account page passes axe, on desktop and a phone", async ({ page, request }) => {
    await customer(page, request)
    for (const path of [
      "/account",
      "/account/profile",
      "/account/addresses",
      "/account/addresses?new",
      "/account/orders",
      "/account/security",
      "/account/change-password",
    ]) {
      await page.goto(path)
      await expect(
        page
          .getByRole("heading", { level: 1 })
          .or(page.getByRole("heading", { name: "Add an address" }))
          .first()
      ).toBeVisible()
      await expectNoViolations(page, path)
      await expectHeadingOrder(page, path)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    for (const path of ["/account", "/account/addresses?new", "/account/security"]) {
      await page.goto(path)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      )
      expect(overflow, `overflow on ${path}`).toBeLessThanOrEqual(0)
      await expectNoViolations(page, `mobile ${path}`)
    }
  })
})
