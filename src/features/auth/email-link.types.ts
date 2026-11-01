export class EmailLinkError extends Error {
  constructor(public readonly code: string) {
    super(code)
  }
}
