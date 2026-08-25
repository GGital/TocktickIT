import { describe, expect, it } from 'vitest'
import {
  MAX_FILE_BYTES,
  buildStoredFilename,
  detectMimeType,
  isWithinSizeLimit,
  resolveUploadType,
  sanitizeOriginalFilename,
  validateRemovalReason,
} from '../../../src/fileValidation.js'

// Real leading bytes for each permitted type; the rest of the file is irrelevant
// to the detector, which only ever reads the signature.
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')])
const pdf = Buffer.from('%PDF-1.7\n%âãÏÓ', 'binary')
const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00])

describe('UNIT-04 magic-byte detection (BR-23)', () => {
  it.each([
    [jpeg, 'image/jpeg'],
    [png, 'image/png'],
    [webp, 'image/webp'],
    [pdf, 'application/pdf'],
  ])('recognises the signature of %#', (buffer, expected) => {
    expect(detectMimeType(buffer as Buffer)).toBe(expected)
  })
})

describe('UNIT-05 signature must agree with the extension (BR-23, AC-19)', () => {
  it('rejects a PDF renamed .png', () => {
    expect(resolveUploadType('fake.png', pdf)).toBeNull()
  })

  it('rejects an executable regardless of its name', () => {
    expect(resolveUploadType('not-an-image.exe', exe)).toBeNull()
    expect(resolveUploadType('not-an-image.png', exe)).toBeNull()
  })

  it('accepts a file whose name and bytes agree, and returns the detected type', () => {
    expect(resolveUploadType('photo.JPG', jpeg)).toBe('image/jpeg')
    expect(resolveUploadType('report.pdf', pdf)).toBe('application/pdf')
  })
})

describe('UNIT-06 size guard (BR-24)', () => {
  it('treats 5 MB as the inclusive maximum', () => {
    expect(isWithinSizeLimit(MAX_FILE_BYTES)).toBe(true)
    expect(isWithinSizeLimit(MAX_FILE_BYTES + 1)).toBe(false)
  })
})

describe('UNIT-07 filename sanitiser (BR-27, AC-30)', () => {
  it.each(['../../etc/passwd', 'C:\\x\\y.png', 'folder/photo.png', '..', '   '])(
    'rejects %s',
    (filename) => {
      expect(sanitizeOriginalFilename(filename)).toBeNull()
    },
  )

  it('caps a 300-character name at 255 characters', () => {
    const long = `${'n'.repeat(296)}.png`
    expect(sanitizeOriginalFilename(long)).toHaveLength(255)
  })

  it('keeps an ordinary display name unchanged', () => {
    expect(sanitizeOriginalFilename('  battery-report.pdf ')).toBe('battery-report.pdf')
  })
})

describe('UNIT-08 stored-name generator (BR-27)', () => {
  it('produces a UUID with the normalised extension for the type', () => {
    expect(buildStoredFilename('image/jpeg')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/,
    )
    expect(buildStoredFilename('application/pdf')).toMatch(/\.pdf$/)
  })

  it('never collides across calls', () => {
    const names = new Set(Array.from({ length: 200 }, () => buildStoredFilename('image/png')))
    expect(names.size).toBe(200)
  })
})

describe('UNIT-12 removal-reason validator (BR-17, AC-28)', () => {
  it.each([
    ['a'.repeat(4), false],
    ['a'.repeat(5), true],
    ['a'.repeat(200), true],
    ['a'.repeat(201), false],
  ])('accepts %# only within 5–200 characters', (value, accepted) => {
    const result = validateRemovalReason(value)
    expect(result.error === undefined).toBe(accepted)
  })

  it('treats a whitespace-only reason as missing and trims what it stores', () => {
    expect(validateRemovalReason('     ').error).toBeDefined()
    expect(validateRemovalReason('  wrong file  ').reason).toBe('wrong file')
  })
})
