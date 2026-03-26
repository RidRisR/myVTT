// src/shared/uuidv7.ts — UUID v7 (browser-compatible, uses crypto.getRandomValues)
export function uuidv7(): string {
  const timestamp = BigInt(Date.now())
  const buf = new Uint8Array(16)
  // Write 48-bit ms timestamp into bytes 0-5 (big-endian)
  const ts = Number(timestamp & 0xffffffffffffn)
  buf[0] = (ts / 2 ** 40) & 0xff
  buf[1] = (ts / 2 ** 32) & 0xff
  buf[2] = (ts / 2 ** 24) & 0xff
  buf[3] = (ts / 2 ** 16) & 0xff
  buf[4] = (ts / 2 ** 8) & 0xff
  buf[5] = ts & 0xff
  // Fill bytes 6-15 with random
  const rand = new Uint8Array(10)
  crypto.getRandomValues(rand)
  // Set version 7 (0111) in high nibble of byte 6
  buf[6] = ((rand[0] ?? 0) & 0x0f) | 0x70
  // Copy byte 7 as-is
  buf[7] = rand[1] ?? 0
  // Set variant 10xx in high bits of byte 8
  buf[8] = ((rand[2] ?? 0) & 0x3f) | 0x80
  // Copy remaining random bytes 9-15
  for (let i = 3; i < 10; i++) {
    buf[i + 6] = rand[i] ?? 0
  }
  const hex = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
