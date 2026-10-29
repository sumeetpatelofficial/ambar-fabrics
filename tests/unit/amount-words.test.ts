import { describe, expect, it } from "vitest"
import { numberInWords, rupeesInWords } from "@/lib/amount-words"
import { financialYear } from "@/lib/financial-year"

describe("amounts in words (Indian numbering)", () => {
  it.each([
    [0, "Zero"],
    [7, "Seven"],
    [13, "Thirteen"],
    [40, "Forty"],
    [99, "Ninety Nine"],
    [100, "One Hundred"],
    [1293, "One Thousand Two Hundred Ninety Three"],
    [100_000, "One Lakh"],
    [1_25_000, "One Lakh Twenty Five Thousand"],
    [10_000_000, "One Crore"],
    [12_34_56_789, "Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine"],
  ])("%i is %s", (n, words) => expect(numberInWords(n)).toBe(words))

  it("writes rupees and paise", () => {
    expect(rupeesInWords(129_300)).toBe("Rupees One Thousand Two Hundred Ninety Three Only")
    expect(rupeesInWords(53_050)).toBe("Rupees Five Hundred Thirty and Fifty Paise Only")
    expect(rupeesInWords(5)).toBe("Rupees Zero and Five Paise Only")
    expect(rupeesInWords(0)).toBe("Rupees Zero Only")
  })

  it("refuses what is not an amount", () => {
    expect(() => rupeesInWords(-1)).toThrow()
    expect(() => rupeesInWords(1.5)).toThrow()
    expect(() => numberInWords(Number.NaN)).toThrow()
  })
})

describe("financial year", () => {
  it("runs April to March in Indian time", () => {
    expect(financialYear(new Date("2026-10-14T06:00:00Z"))).toBe("2026-27")
    expect(financialYear(new Date("2027-03-31T10:00:00Z"))).toBe("2026-27")
    // 18:30 UTC on 31 March is midnight in India: already 1 April.
    expect(financialYear(new Date("2027-03-31T18:30:00Z"))).toBe("2027-28")
    expect(financialYear(new Date("2027-03-31T18:29:59Z"))).toBe("2026-27")
    expect(financialYear(new Date("2026-04-01T00:00:00+05:30"))).toBe("2026-27")
    expect(financialYear(new Date("2099-12-31T00:00:00Z"))).toBe("2099-00")
  })
})
