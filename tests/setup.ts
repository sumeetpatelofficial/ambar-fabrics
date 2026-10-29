import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

// Components read the sign-in state through next-auth's React hook, which needs its provider. Unit tests
// replace it with a controllable stand-in: set `globalThis.__testSessionStatus` to change who is signed in.
declare global {
  var __testSessionStatus: "loading" | "authenticated" | "unauthenticated" | undefined
}

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: globalThis.__testSessionStatus ?? "unauthenticated",
    data: null,
    update: async () => null,
  }),
  SessionProvider: ({ children }: { children: unknown }) => children,
}))

// Server actions run on the server and need the full Auth.js stack; component tests stub them. Their real
// behaviour is covered by the service integration tests and the browser tests.
vi.mock("@/features/account/actions", () => ({
  setWishlistItemAction: vi.fn(async () => true),
  syncWishlistAction: vi.fn(async (slugs: string[]) => slugs),
  updateProfileAction: vi.fn(),
  saveAddressAction: vi.fn(),
  deleteAddressAction: vi.fn(),
  setDefaultAddressAction: vi.fn(),
  changePasswordAction: vi.fn(),
  revokeSessionsAction: vi.fn(),
  requestSetPasswordAction: vi.fn(),
}))

vi.mock("@/features/cart/actions", () => ({
  addToCartAction: vi.fn(async () => ({ ok: true, lines: [] })),
  setCartQuantityAction: vi.fn(async () => ({ ok: true, lines: [] })),
  removeFromCartAction: vi.fn(async () => ({ ok: true, lines: [] })),
  mergeCartAction: vi.fn(async () => ({ ok: true, lines: [] })),
  getPricedCartAction: vi.fn(async () => null),
}))

vi.mock("@/features/fulfilment/actions", () => ({
  checkDeliveryAction: vi.fn(async () => ({ serviceable: true })),
  cancelMyOrderAction: vi.fn(async () => ({ ok: true })),
  requestReturnAction: vi.fn(async () => ({ ok: true })),
  bookShipmentAction: vi.fn(async () => ({ ok: true })),
  cancelShipmentAction: vi.fn(async () => ({ ok: true })),
  staffCancelOrderAction: vi.fn(async () => ({ ok: true })),
  decideReturnAction: vi.fn(async () => ({ ok: true })),
  receiveReturnAction: vi.fn(async () => ({ ok: true })),
}))

vi.mock("@/features/orders/actions", () => ({
  previewCheckoutAction: vi.fn(),
  startCheckoutAction: vi.fn(),
  resumePaymentAction: vi.fn(),
  verifyPaymentAction: vi.fn(),
  cancelOrderAction: vi.fn(),
  payWithMockGatewayAction: vi.fn(),
}))

vi.mock("@/features/reviews/actions", () => ({ submitReviewAction: vi.fn() }))

afterEach(() => {
  cleanup()
  globalThis.__testSessionStatus = undefined
})
