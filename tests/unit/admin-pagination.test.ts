import { describe, expect, it } from "vitest"
import { pageWindow } from "@/components/admin/pagination"

describe("page numbers", () => {
  it("shows every page when there are few", () => {
    expect(pageWindow(1, 1)).toEqual([1])
    expect(pageWindow(2, 3)).toEqual([1, 2, 3])
  })
  it("keeps the first, last and neighbours, and marks the gaps", () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, "gap", 10])
    expect(pageWindow(5, 10)).toEqual([1, "gap", 4, 5, 6, "gap", 10])
    expect(pageWindow(10, 10)).toEqual([1, "gap", 9, 10])
    expect(pageWindow(3, 5)).toEqual([1, 2, 3, 4, 5])
  })
  it("never repeats or skips a number without a gap", () => {
    for (let last = 1; last <= 40; last++)
      for (let cur = 1; cur <= last; cur++) {
        const w = pageWindow(cur, last)
        const nums = w.filter((x): x is number => x !== "gap")
        expect(new Set(nums).size).toBe(nums.length)
        expect(nums).toContain(cur)
        expect(nums[0]).toBe(1)
        expect(nums.at(-1)).toBe(last)
        w.forEach((x, i) => {
          const prev = w[i - 1]
          if (typeof x === "number" && typeof prev === "number") expect(x - prev).toBe(1)
        })
      }
  })
})
