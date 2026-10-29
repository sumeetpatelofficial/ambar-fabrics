/** Staff accounts created by scripts/e2e-server.ts in the throwaway test database. Test-only credentials. */
export const E2E_OWNER = { email: "owner@example.com", password: "e2e-first-staff-passphrase-123" }
export const E2E_SUPPORT = {
  email: "support@example.com",
  password: "e2e-second-staff-passphrase-123",
}
export const E2E_CRON_SECRET = "e2e-only-cron-secret-0123456789"

/** A second owner for the admin tests: sign-ins are limited per account, and the owner above is used elsewhere. */
export const E2E_ADMIN = { email: "admin-e2e@example.com", password: "e2e-admin-passphrase-4567" }

/** A third owner, for the content and SEO tests (sign-ins are limited per account). */
export const E2E_EDITOR = {
  email: "editor-e2e@example.com",
  password: "e2e-editor-passphrase-8901",
}

/** A fourth owner, for the admin appearance tests (sign-ins are limited per account). */
export const E2E_LOOKS = { email: "looks-e2e@example.com", password: "e2e-looks-passphrase-2345" }

/** A fifth owner, for the admin navigation tests (sign-ins are limited per account). */
export const E2E_NAV = { email: "nav-e2e@example.com", password: "e2e-nav-passphrase-6789" }

/** A seventh owner, for the reports tests (sign-ins are limited per account). */
export const E2E_REPORTS = {
  email: "reports-e2e@example.com",
  password: "e2e-reports-passphrase-2468",
}

/** An eighth owner, for the theme check on the staff area (sign-ins are limited per account). */
export const E2E_THEME = { email: "theme-e2e@example.com", password: "e2e-theme-passphrase-9753" }

/** A ninth owner, for the home page offer test (sign-ins are limited per account). */
export const E2E_COUPONS = {
  email: "coupons-e2e@example.com",
  password: "e2e-coupons-passphrase-1593",
}

/** A sixth owner, for the master fabric and category-arranging tests (sign-ins are limited per account). */
export const E2E_MASTER = {
  email: "master-e2e@example.com",
  password: "e2e-master-passphrase-1357",
}

/** A tenth owner, for the shop-sale (Add order) tests (sign-ins are limited per account). */
export const E2E_STORE = { email: "store-e2e@example.com", password: "e2e-store-passphrase-7531" }
