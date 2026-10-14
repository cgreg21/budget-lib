/*
 * The library has no Node typings on purpose (it must stay platform-independent); the tests may
 * still use Node to cross-check the encrypted configuration format against an independent
 * implementation. Only what those tests call is declared here.
 */
declare module 'node:crypto' {
  export const webcrypto: unknown
  export function pbkdf2Sync(password: string, salt: Uint8Array, iterations: number, keylen: number, digest: string): NodeBuffer
  export function createHmac(algorithm: string, key: Uint8Array): { update(data: Uint8Array): { digest(encoding: string): string } }
  export function createCipheriv(algorithm: string, key: Uint8Array, iv: Uint8Array): { update(data: Uint8Array): NodeBuffer; final(): NodeBuffer }
}

interface NodeBuffer extends Uint8Array {
  toString(encoding?: string): string
  subarray(start?: number, end?: number): NodeBuffer
}

declare const Buffer: {
  from(data: string, encoding: string): NodeBuffer
  concat(list: Uint8Array[]): NodeBuffer
}
