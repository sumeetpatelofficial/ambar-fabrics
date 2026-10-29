/** Spreadsheet cells that start with = + - @ are read as formulas; a leading quote makes them plain text. */
export function csvCell(value: string | number): string {
  const v = String(value)
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n"
}
