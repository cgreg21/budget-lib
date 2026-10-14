export declare function utf8Encode(text: string): Uint8Array;
/** Decodes UTF-8; malformed sequences throw, as they would with a strict `TextDecoder`. */
export declare function utf8Decode(bytes: Uint8Array): string;
export declare function base64Encode(bytes: Uint8Array): string;
/** Strict Base64: anything but the alphabet and trailing padding throws. */
export declare function base64Decode(text: string): Uint8Array;
/** Base64 of the UTF-8 text, without relying on `btoa`/`Buffer`. */
export declare function base64Utf8(text: string): string;
export declare function concatBytes(...parts: Uint8Array[]): Uint8Array;
/** Constant-time comparison, so a MAC check does not leak how many bytes matched. */
export declare function bytesEqual(a: Uint8Array, b: Uint8Array): boolean;
//# sourceMappingURL=bytes.d.ts.map