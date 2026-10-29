const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
]
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

function below100(n: number): string {
  return n < 20 ? ONES[n]! : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`
}
function below1000(n: number): string {
  const h = Math.floor(n / 100)
  const rest = n % 100
  return [h ? `${ONES[h]} Hundred` : "", rest ? below100(rest) : ""].filter(Boolean).join(" ")
}

/** 1,234 -> "One Thousand Two Hundred Thirty Four", counting in the Indian way (thousand, lakh, crore). */
export function numberInWords(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError("a whole number from zero up is needed")
  if (n === 0) return "Zero"
  const crore = Math.floor(n / 10_000_000)
  const lakh = Math.floor((n % 10_000_000) / 100_000)
  const thousand = Math.floor((n % 100_000) / 1000)
  const rest = n % 1000
  return [
    crore ? `${numberInWords(crore)} Crore` : "",
    lakh ? `${below100(lakh)} Lakh` : "",
    thousand ? `${below100(thousand)} Thousand` : "",
    rest ? below1000(rest) : "",
  ]
    .filter(Boolean)
    .join(" ")
}

/** 129300 paise -> "Rupees One Thousand Two Hundred Ninety Three Only". Paise are added when there are any. */
export function rupeesInWords(paise: number): string {
  if (!Number.isSafeInteger(paise) || paise < 0)
    throw new RangeError("an amount in paise, zero or more, is needed")
  const rupees = Math.floor(paise / 100)
  const p = paise % 100
  const parts = [`Rupees ${numberInWords(rupees)}`]
  if (p) parts.push(`and ${numberInWords(p)} Paise`)
  return `${parts.join(" ")} Only`
}
