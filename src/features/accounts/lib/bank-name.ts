export function bankNameKey(value: string): string {
  return value
    .trim()
    .replace(/(?:limited|ltd\.?)$/i, '')
    .toLocaleLowerCase('en-IN')
    .replace(/[^\p{L}\p{N}]/gu, '')
}

export function isValidBankName(value: string): boolean {
  const name = value.trim()
  return (
    name.length >= 2 &&
    name.length <= 120 &&
    /\p{L}/u.test(name) &&
    !/[\u0000-\u001f]/.test(name)
  )
}
