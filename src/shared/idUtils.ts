export function generateTokenId(): string {
  return self.crypto.randomUUID()
}
