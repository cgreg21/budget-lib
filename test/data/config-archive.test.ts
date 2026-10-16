import { createHmac, pbkdf2Sync, createCipheriv, webcrypto } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  CONFIG_FORMAT, CONFIG_VERSION, ConfigFileError, ENCRYPTED_CONFIG_FORMAT, base64Decode, base64Encode, base64Utf8,
  bytesEqual, concatBytes, createConfigArchive, describeConfig, emptyConfigData, isEncryptedConfigFile,
  isPassphraseAcceptable, openConfig, parseConfigData, sealConfig, utf8Decode, utf8Encode, webCryptoConfigCipher,
  type ConfigArchive, type ConfigData, type EncryptedConfigFile, type WebCryptoLike,
} from '../../src/index.js'

const cipher = webCryptoConfigCipher(webcrypto as WebCryptoLike)
const PASSPHRASE = 'correct horse battery'

const sample = (): ConfigData => ({
  general: { language: 'fr', currency: 'CHF', dateFormat: 'dd-mm-yyyy', amountFormat: 'space-comma', theme: 'dark' },
  thresholds: { low: 100, medium: 500, high: 1000 },
  calendar: {
    enabled: true,
    calendarUrl: 'https://cloud.example.org/remote.php/dav/calendars/alice/budget/',
    username: 'alice',
    proxyUrl: 'https://proxy.example.workers.dev',
    password: 'p@ss wörd — ✓',
  },
  bank: {
    config: { applicationId: 'app-1', bankName: 'Bank', bankCountry: 'FR', bankConsentSeconds: 86400, redirectUrl: 'budget://bank', importFrom: '2026-01-01' },
    privateKey: '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n',
  },
})

describe('bytes', () => {
  it('round-trips UTF-8 and Base64', () => {
    for (const text of ['', 'a', 'ab', 'abc', 'héllo wörld', '日本語', '🚀 emoji']) {
      const bytes = utf8Encode(text)
      expect(utf8Decode(bytes)).toBe(text)
      expect(base64Decode(base64Encode(bytes))).toEqual(bytes)
      expect(base64Encode(bytes)).toBe(Buffer.from(text, 'utf8').toString('base64'))
    }
    expect(base64Utf8('alice:secret')).toBe('YWxpY2U6c2VjcmV0')
  })

  it('rejects malformed input', () => {
    expect(() => base64Decode('abc')).toThrow(/Base64/)
    expect(() => base64Decode('ab$=')).toThrow(/Base64/)
    expect(() => utf8Decode(Uint8Array.from([0xc3]))).toThrow(/UTF-8/)
    expect(() => utf8Decode(Uint8Array.from([0x80]))).toThrow(/UTF-8/)
    expect(() => utf8Decode(Uint8Array.from([0xc3, 0x41]))).toThrow(/UTF-8/)
    expect(base64Decode('YQ==\n')).toEqual(Uint8Array.from([0x61]))
  })

  it('concatenates and compares', () => {
    expect(concatBytes(Uint8Array.from([1]), new Uint8Array(0), Uint8Array.from([2, 3]))).toEqual(Uint8Array.from([1, 2, 3]))
    expect(bytesEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 2]))).toBe(true)
    expect(bytesEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 3]))).toBe(false)
    expect(bytesEqual(Uint8Array.from([1]), Uint8Array.from([1, 2]))).toBe(false)
  })
})

describe('config archive', () => {
  it('creates a self-describing archive with copies of the data', () => {
    const data = sample()
    const archive = createConfigArchive(data, '2026-10-14T10:00:00.000Z')
    expect(archive.format).toBe(CONFIG_FORMAT)
    expect(archive.version).toBe(CONFIG_VERSION)
    expect(archive.exportedAt).toBe('2026-10-14T10:00:00.000Z')
    expect(archive.general).toEqual(data.general)
    expect(archive.general).not.toBe(data.general)
    expect(archive.bank).toEqual(data.bank)
    expect(archive.bank).not.toBe(data.bank)
    expect(createConfigArchive({ ...data, bank: null }).bank).toBeNull()
    expect(createConfigArchive(data).exportedAt).toMatch(/^\d{4}-/)
  })

  it('parses valid archives and refuses foreign or broken ones', () => {
    const archive = createConfigArchive(sample())
    expect(parseConfigData(archive)).toEqual(archive)
    expect((parseConfigData(JSON.parse(JSON.stringify({ ...archive, exportedAt: undefined }))) as ConfigArchive | null)?.exportedAt).toBe('')
    expect(parseConfigData({ ...archive, bank: null })?.bank).toBeNull()

    expect(parseConfigData(null)).toBeNull()
    expect(parseConfigData('text')).toBeNull()
    expect(parseConfigData({ ...archive, format: 'other' })).toBeNull()
    expect(parseConfigData({ ...archive, version: CONFIG_VERSION + 1 })).toBeNull()
    expect(parseConfigData({ ...archive, general: { language: 'de' } })).toBeNull()
    expect(parseConfigData({ ...archive, thresholds: { low: 1 } })).toBeNull()
    expect(parseConfigData({ ...archive, calendar: { ...archive.calendar, password: 1 } })).toBeNull()
    expect(parseConfigData({ ...archive, calendar: null })).toBeNull()
    expect(parseConfigData({ ...archive, bank: { config: {}, privateKey: '' } })).toBeNull()
    expect(parseConfigData({ ...archive, bank: { config: archive.bank?.config, privateKey: 3 } })).toBeNull()
    expect(parseConfigData({ ...archive, bank: 'x' })).toBeNull()
  })

  it('describes an empty and a filled configuration', () => {
    expect(describeConfig(emptyConfigData())).toEqual({ calendar: false, calendarPassword: false, bank: false, bankKey: false })
    expect(describeConfig(sample())).toEqual({ calendar: true, calendarPassword: true, bank: true, bankKey: true })
    const partial = sample()
    partial.calendar.password = ''
    partial.bank = { config: { ...partial.bank!.config, applicationId: '' }, privateKey: '' }
    expect(describeConfig(partial)).toEqual({ calendar: true, calendarPassword: false, bank: false, bankKey: false })
  })

  it('judges passphrases', () => {
    expect(isPassphraseAcceptable('short')).toBe(false)
    expect(isPassphraseAcceptable('long enough')).toBe(true)
  })
})

describe('sealConfig / openConfig', () => {
  it('round-trips through the encrypted file', async () => {
    const data = sample()
    const text = await sealConfig(data, PASSPHRASE, cipher, { exportedAt: '2026-10-14T10:00:00.000Z', iterations: 1000 })
    const file = JSON.parse(text) as EncryptedConfigFile
    expect(isEncryptedConfigFile(file)).toBe(true)
    expect(file.format).toBe(ENCRYPTED_CONFIG_FORMAT)
    expect(file.exportedAt).toBe('2026-10-14T10:00:00.000Z')
    expect(file.kdf.iterations).toBe(1000)
    expect(text).not.toContain('alice')
    expect(text).not.toContain('PRIVATE KEY')

    const opened = await openConfig(text, PASSPHRASE, cipher)
    expect(opened).toEqual(createConfigArchive(data, '2026-10-14T10:00:00.000Z'))
  })

  it('uses fresh salt and iv on every export and the default iteration count', async () => {
    const data = sample()
    const [a, b] = await Promise.all([sealConfig(data, PASSPHRASE, cipher), sealConfig(data, PASSPHRASE, cipher)])
    const fa = JSON.parse(a) as EncryptedConfigFile
    const fb = JSON.parse(b) as EncryptedConfigFile
    expect(fa.kdf.salt).not.toBe(fb.kdf.salt)
    expect(fa.iv).not.toBe(fb.iv)
    expect(fa.ciphertext).not.toBe(fb.ciphertext)
    expect(fa.kdf.iterations).toBe(100_000)
    const [oa, ob] = await Promise.all([openConfig(a, PASSPHRASE, cipher), openConfig(b, PASSPHRASE, cipher)])
    expect({ ...ob, exportedAt: '' }).toEqual({ ...oa, exportedAt: '' })
  }, 20_000)

  it('refuses weak passphrases before encrypting', async () => {
    await expect(sealConfig(sample(), 'short', cipher)).rejects.toMatchObject({ code: 'weak-passphrase' })
  })

  const code = async (text: string, passphrase = PASSPHRASE): Promise<string> => {
    try {
      await openConfig(text, passphrase, cipher)
      return 'ok'
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigFileError)
      return (error as ConfigFileError).code
    }
  }

  it('reports the wrong passphrase and tampering as such', async () => {
    const text = await sealConfig(sample(), PASSPHRASE, cipher, { iterations: 500 })
    expect(await code(text, 'wrong passphrase')).toBe('passphrase')

    const file = JSON.parse(text) as EncryptedConfigFile
    const bytes = base64Decode(file.ciphertext)
    bytes[0] ^= 0xff
    expect(await code(JSON.stringify({ ...file, ciphertext: base64Encode(bytes) }))).toBe('passphrase')
  })

  it('reports files that are not ours', async () => {
    expect(await code('not json')).toBe('format')
    expect(await code('{"format":"budget-app-backup"}')).toBe('format')
    const text = await sealConfig(sample(), PASSPHRASE, cipher, { iterations: 500 })
    const file = JSON.parse(text) as EncryptedConfigFile
    expect(await code(JSON.stringify({ ...file, version: 99 }))).toBe('format')
    expect(await code(JSON.stringify({ ...file, iv: '!!!' }))).toBe('format')
    expect(await code(JSON.stringify({ ...file, iv: base64Encode(new Uint8Array(4)) }))).toBe('format')
    expect(await code(JSON.stringify({ ...file, kdf: { ...file.kdf, iterations: 0 } }))).toBe('format')
    expect(isEncryptedConfigFile(null)).toBe(false)
  })

  it('reports a file whose content is not a configuration', async () => {
    const salt = cipher.randomBytes(16)
    const iv = cipher.randomBytes(16)
    const material = await cipher.pbkdf2Sha256(utf8Encode(PASSPHRASE), salt, 500, 64)
    const write = async (plaintext: Uint8Array): Promise<string> => {
      const ciphertext = await cipher.aesCbcEncrypt(material.slice(0, 32), iv, plaintext)
      const mac = await cipher.hmacSha256(material.slice(32), concatBytes(salt, iv, ciphertext))
      return JSON.stringify({
        format: ENCRYPTED_CONFIG_FORMAT, version: 1, exportedAt: '',
        kdf: { name: 'PBKDF2-SHA256', iterations: 500, salt: base64Encode(salt) },
        cipher: 'AES-256-CBC', iv: base64Encode(iv), ciphertext: base64Encode(ciphertext), mac: base64Encode(mac),
      })
    }
    expect(await code(await write(utf8Encode('{"format":"other"}')))).toBe('content')
    expect(await code(await write(utf8Encode('not json')))).toBe('content')
    expect(await code(await write(Uint8Array.from([0xff, 0xfe])))).toBe('content')
  })

  it('reports a decryption failure as a passphrase problem', async () => {
    const text = await sealConfig(sample(), PASSPHRASE, cipher, { iterations: 500 })
    const broken = { ...cipher, aesCbcDecrypt: async () => { throw new Error('bad padding') } }
    await expect(openConfig(text, PASSPHRASE, broken)).rejects.toMatchObject({ code: 'passphrase' })
  })

  it('is interoperable with an independent implementation of the same scheme', async () => {
    const text = await sealConfig(sample(), PASSPHRASE, cipher, { exportedAt: 'x', iterations: 500 })
    const file = JSON.parse(text) as EncryptedConfigFile
    const salt = Buffer.from(file.kdf.salt, 'base64')
    const iv = Buffer.from(file.iv, 'base64')
    const material = pbkdf2Sync(PASSPHRASE, salt, file.kdf.iterations, 64, 'sha256')
    const ciphertext = Buffer.from(file.ciphertext, 'base64')
    const mac = createHmac('sha256', material.subarray(32)).update(Buffer.concat([salt, iv, ciphertext])).digest('base64')
    expect(mac).toBe(file.mac)

    const expected = createCipheriv('aes-256-cbc', material.subarray(0, 32), iv)
    const plain = Buffer.from(JSON.stringify(createConfigArchive(sample(), 'x')), 'utf8')
    expect(Buffer.concat([expected.update(plain), expected.final()]).toString('base64')).toBe(file.ciphertext)
  })
})
