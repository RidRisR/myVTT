// server/uuidv7.ts — UUID v7 generator per RFC 9562
import crypto from 'crypto'

/** Generate UUID v7 per RFC 9562: 48-bit ms timestamp + 12-bit random + version/variant bits */
export function uuidv7(): string {
  const timestamp = BigInt(Date.now())
  const buf = Buffer.alloc(16)
  // Write 48-bit millisecond timestamp into bytes 0-5
  buf.writeUIntBE(Number(timestamp & 0xffffffffffffn), 0, 6)
  const rand = crypto.randomBytes(10)
  rand.copy(buf, 6)
  // Set version 7 (0111) in high nibble of byte 6
  buf[6] = (buf[6]! & 0x0f) | 0x70
  // Set variant 10xx in high bits of byte 8
  buf[8] = (buf[8]! & 0x3f) | 0x80
  const hex = buf.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
