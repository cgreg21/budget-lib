/*
 * bytes.ts — UTF-8 and Base64 without `TextEncoder`, `btoa` or `Buffer`, so the
 * same code runs on Node, in browsers and in the phone's JavaScript engine.
 */

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const BASE64_INDEX: Record<string, number> = {}
for (let i = 0; i < BASE64.length; i++) BASE64_INDEX[BASE64[i]] = i

export function utf8Encode(text: string): Uint8Array {
  const bytes: number[] = []
  for (const char of text) {
    const code = char.codePointAt(0) as number
    if (code < 0x80) bytes.push(code)
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
  }
  return Uint8Array.from(bytes)
}

/** Decodes UTF-8; malformed sequences throw, as they would with a strict `TextDecoder`. */
export function utf8Decode(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length;) {
    const lead = bytes[i]
    const length = lead < 0x80 ? 1 : lead < 0xc0 ? 0 : lead < 0xe0 ? 2 : lead < 0xf0 ? 3 : lead < 0xf8 ? 4 : 0
    if (length === 0 || i + length > bytes.length) throw new Error('Malformed UTF-8')
    let code = length === 1 ? lead : lead & (0xff >> (length + 1))
    for (let k = 1; k < length; k++) {
      const next = bytes[i + k]
      if ((next & 0xc0) !== 0x80) throw new Error('Malformed UTF-8')
      code = (code << 6) | (next & 0x3f)
    }
    out += String.fromCodePoint(code)
    i += length
  }
  return out
}

export function base64Encode(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b: number | undefined = i + 1 < bytes.length ? bytes[i + 1] : undefined
    const c: number | undefined = i + 2 < bytes.length ? bytes[i + 2] : undefined
    out += BASE64[a >> 2] + BASE64[((a & 3) << 4) | ((b ?? 0) >> 4)]
    out += b === undefined ? '=' : BASE64[((b & 15) << 2) | ((c ?? 0) >> 6)]
    out += c === undefined ? '=' : BASE64[c & 63]
  }
  return out
}

/** Strict Base64: anything but the alphabet and trailing padding throws. */
export function base64Decode(text: string): Uint8Array {
  const clean = text.replace(/[\r\n\s]/g, '')
  if (clean.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new Error('Malformed Base64')
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0
  const bytes = new Uint8Array((clean.length / 4) * 3 - padding)
  let p = 0
  for (let i = 0; i < clean.length; i += 4) {
    const n = (BASE64_INDEX[clean[i]] << 18) | (BASE64_INDEX[clean[i + 1]] << 12)
      | ((BASE64_INDEX[clean[i + 2]] ?? 0) << 6) | (BASE64_INDEX[clean[i + 3]] ?? 0)
    bytes[p++] = n >> 16
    if (p < bytes.length) bytes[p++] = (n >> 8) & 0xff
    if (p < bytes.length) bytes[p++] = n & 0xff
  }
  return bytes
}

/** Base64 of the UTF-8 text, without relying on `btoa`/`Buffer`. */
export function base64Utf8(text: string): string {
  return base64Encode(utf8Encode(text))
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** Constant-time comparison, so a MAC check does not leak how many bytes matched. */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}
