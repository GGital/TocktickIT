import { describe, expect, it } from 'vitest'
import {
  MESSAGES,
  checkStagedFile,
  validateDescription,
  validateSummary,
  validateTicketForm,
} from '../../../src/lib/validation'

describe('UNIT-11 client field validators (BR-16, BR-17, AC-12)', () => {
  it('measures the summary after trimming, at both boundaries', () => {
    expect(validateSummary('a'.repeat(9))).toBe(MESSAGES.summary)
    expect(validateSummary('a'.repeat(10))).toBeUndefined()
    expect(validateSummary('a'.repeat(120))).toBeUndefined()
    expect(validateSummary('a'.repeat(121))).toBe(MESSAGES.summary)
    // 10 characters of content padded with spaces is still valid.
    expect(validateSummary(`   ${'a'.repeat(10)}   `)).toBeUndefined()
  })

  it('measures the description after trimming, at both boundaries', () => {
    expect(validateDescription('b'.repeat(19))).toBe(MESSAGES.description)
    expect(validateDescription('b'.repeat(20))).toBeUndefined()
    expect(validateDescription('b'.repeat(2000))).toBeUndefined()
    expect(validateDescription('b'.repeat(2001))).toBe(MESSAGES.description)
  })

  it('treats whitespace-only input as missing', () => {
    expect(validateSummary('               ')).toBe(MESSAGES.summary)
    expect(validateDescription('                          ')).toBe(MESSAGES.description)
  })

  it('reports every offending field at once', () => {
    expect(
      validateTicketForm({
        summary: '',
        description: '',
        categoryId: '',
        relatedSystemId: '',
        requestedPriority: 'CRITICAL',
      }),
    ).toEqual({
      summary: MESSAGES.summary,
      description: MESSAGES.description,
      categoryId: MESSAGES.categoryId,
      relatedSystemId: MESSAGES.relatedSystemId,
      requestedPriority: MESSAGES.requestedPriority,
    })
  })

  it('accepts a valid form', () => {
    expect(
      validateTicketForm({
        summary: 'Laptop battery drains fast',
        description: 'It drops from full to fifteen percent within half an hour.',
        categoryId: '2',
        relatedSystemId: '7',
        requestedPriority: 'HIGH',
      }),
    ).toEqual({})
  })
})

describe('UNIT-11 staged-file pre-check (BR-23, BR-24)', () => {
  it('rejects a non-permitted extension and an oversized file', () => {
    expect(checkStagedFile({ name: 'crash-dump.exe', size: 10 })).toBe('File type not allowed')
    expect(checkStagedFile({ name: 'huge.png', size: 6 * 1024 * 1024 })).toBe(
      'File is larger than 5 MB',
    )
  })

  it('accepts the permitted types up to exactly 5 MB', () => {
    expect(checkStagedFile({ name: 'photo.JPEG', size: 5 * 1024 * 1024 })).toBeUndefined()
    expect(checkStagedFile({ name: 'report.pdf', size: 1 })).toBeUndefined()
  })
})
