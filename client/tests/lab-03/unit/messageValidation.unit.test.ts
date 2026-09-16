import { describe, expect, it } from 'vitest'
import { isValidMessageBody, MESSAGE_MAX_LENGTH } from '../../../src/lib/validation'

describe('UNIT-14 client message validator (BR-44, AC-49)', () => {
  it('matches the server bound of 2000 characters', () => expect(MESSAGE_MAX_LENGTH).toBe(2000))

  it('rejects 0 characters, 2001 characters, and whitespace-only content', () => {
    expect(isValidMessageBody('')).toBe(false)
    expect(isValidMessageBody('c'.repeat(2001))).toBe(false)
    expect(isValidMessageBody('   \n\t  ')).toBe(false)
  })

  it('accepts 1 and 2000 characters', () => {
    expect(isValidMessageBody('c')).toBe(true)
    expect(isValidMessageBody('c'.repeat(2000))).toBe(true)
  })

  it('measures after trimming, as the server does', () => {
    expect(isValidMessageBody(`  ${'c'.repeat(2000)}  `)).toBe(true)
    expect(isValidMessageBody(`  c  `)).toBe(true)
  })
})
