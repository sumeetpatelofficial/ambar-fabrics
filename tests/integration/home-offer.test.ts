import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { MongoMemoryReplSet } from "mongodb-memory-server"
import mongoose from "mongoose"
import { ROLES, roleHasPermission } from "@/config/permissions"
import { couponInputSchema } from "@/features/admin/catalog-schemas"
import { ForbiddenError } from "@/lib/errors"
import { AuditLog } from "@/models/audit-log"
import { Coupon } from "@/models/coupon"
import { saveCoupon } from "@/services/admin-ops-service"
import { getHomeOffer } from "@/services/coupon-service"
import { resetDatabase, startDatabase, stopDatabase } from "./helpers"

vi.mock("server-only", () => ({}))

let replSet: MongoMemoryReplSet
const NOW = new Date("2026-10-20T06:00:00Z")
const DAY = 86_400_000
const owner = { id: String(new mongoose.Types.ObjectId()), role: "super_admin" as const }

beforeAll(async () => {
  replSet = await startDatabase("home_offer_test")
}, 240_000)
afterAll(() => stopDatabase(replSet))
beforeEach(resetDatabase)

const input = (o: Record<string, string>) =>
  couponInputSchema.parse({ code: "FESTIVE15", type: "percent", percent: "15", active: "on", ...o })

describe("the offer on the home page", () => {
  it("is nothing until a coupon is ticked to show", async () => {
    await saveCoupon(owner, null, input({}))
    expect(await getHomeOffer(NOW)).toBeNull()
  })

  it("shows the ticked coupon's real figures, and only those", async () => {
    await saveCoupon(
      owner,
      null,
      input({
        showOnHome: "on",
        minOrder: "1500",
        endsAt: "2026-11-05",
        description: "private note",
      })
    )
    const offer = await getHomeOffer(NOW)
    expect(offer).toEqual({
      code: "FESTIVE15",
      kind: "percent",
      figure: 15,
      endsOn: "5 November",
      minimumRupees: 1500,
    })
    // The coupon's note is for the owner: it never reaches the page.
    expect(JSON.stringify(offer)).not.toContain("private")
  })

  it("shows a flat amount off, and leaves out an end date and minimum the coupon does not have", async () => {
    await saveCoupon(
      owner,
      null,
      input({ code: "FLAT200", type: "flat", percent: "", amount: "200", showOnHome: "on" })
    )
    expect(await getHomeOffer(NOW)).toEqual({ code: "FLAT200", kind: "flat", figure: 200 })
  })

  it("disappears when the coupon is switched off, not started, ended or used up", async () => {
    const saved = await saveCoupon(
      owner,
      null,
      input({ showOnHome: "on", startsAt: "2026-10-01", endsAt: "2026-11-05" })
    )
    expect(await getHomeOffer(NOW)).not.toBeNull()
    expect(await getHomeOffer(new Date("2026-09-30T00:00:00Z"))).toBeNull() // not started
    expect(await getHomeOffer(new Date(NOW.getTime() + 30 * DAY))).toBeNull() // ended
    await Coupon.updateOne({ _id: saved.id }, { $set: { usageLimit: 3, usedCount: 3 } })
    expect(await getHomeOffer(NOW)).toBeNull() // used up
    await Coupon.updateOne({ _id: saved.id }, { $set: { usedCount: 2 } })
    expect(await getHomeOffer(NOW)).not.toBeNull()
    await Coupon.updateOne({ _id: saved.id }, { $set: { active: false } })
    expect(await getHomeOffer(NOW)).toBeNull() // switched off
  })

  it("is one coupon at a time: ticking a second takes it off the first, and unticking removes it", async () => {
    const first = await saveCoupon(owner, null, input({ showOnHome: "on" }))
    const second = await saveCoupon(
      owner,
      null,
      input({ code: "SECOND10", percent: "10", showOnHome: "on" })
    )
    expect((await getHomeOffer(NOW))?.code).toBe("SECOND10")
    expect((await Coupon.findById(first.id).lean())?.showOnHome).toBe(false)
    await saveCoupon(owner, second.id, input({ code: "SECOND10", percent: "10" })) // untick
    expect(await getHomeOffer(NOW)).toBeNull()
    expect(await Coupon.countDocuments({ showOnHome: true })).toBe(0)
  })

  it("records the choice in the audit log, and needs permission to make it", async () => {
    await saveCoupon(owner, null, input({ showOnHome: "on" }))
    const log = await AuditLog.findOne({ action: "coupon.created" }).lean()
    expect(log?.details).toMatchObject({ code: "FESTIVE15", showOnHome: true })
    for (const role of ROLES) {
      const actor = { id: String(new mongoose.Types.ObjectId()), role }
      const result = await saveCoupon(
        actor,
        null,
        input({ code: `C${role}`.slice(0, 14).toUpperCase() })
      ).then(
        () => "ok",
        (e: unknown) => (e instanceof ForbiddenError ? "forbidden" : "other")
      )
      expect(result === "ok", role).toBe(roleHasPermission(role, "coupons:manage"))
    }
  })
})
