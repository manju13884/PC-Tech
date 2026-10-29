export function maskDashboardCustomerName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const initials = words.length > 1
    ? Array.from(words[0])[0] + Array.from(words[1])[0]
    : Array.from(words[0] ?? '').slice(0, 2).join('')
  return initials ? `${initials}.....` : '.....'
}
