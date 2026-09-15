import { describe, expect, it } from 'vitest'
import { normaliseEmail, readUserFields } from '../../../src/userInput.js'

describe('UNIT-13 email normaliser (BR-49)', () => {
  it('trims and lower-cases, so comparison is case-insensitive', () => {
    expect(normaliseEmail('  Ada@KMUTT.ac.th  ')).toBe('ada@kmutt.ac.th')
    expect(normaliseEmail('Ada@KMUTT.ac.th')).toBe(normaliseEmail('ada@kmutt.AC.TH'))
  })
})

const valid = { fullName: 'Nara Sukjai', email: 'Nara.Sukjai@KMUTT.ac.th', role: 'IT_STAFF', isActive: true, initialPassword: 'first-login-2026' }
const fieldsOf = (errors: { field: string }[]) => errors.map((error) => error.field).sort()

describe('user field rules (BR-47, BR-48, BR-50, api-spec §3.18, §3.19)', () => {
  it('accepts a valid create body and normalises it', () => {
    expect(readUserFields(valid, 'create')).toEqual({
      errors: [],
      data: { fullName: 'Nara Sukjai', email: 'nara.sukjai@kmutt.ac.th', role: 'IT_STAFF', isActive: true, initialPassword: 'first-login-2026' },
    })
  })

  it('names every offending field on create, including a missing isActive and a server-owned key', () => {
    const { errors } = readUserFields(
      { fullName: ' ', email: 'not-an-email', role: 'SUPERUSER', initialPassword: 'nine-char', mustChangePassword: false },
      'create',
    )
    expect(fieldsOf(errors)).toEqual(['email', 'fullName', 'initialPassword', 'isActive', 'mustChangePassword', 'role'])
  })

  it('bounds the full name at 2 and 120 characters after trimming', () => {
    expect(fieldsOf(readUserFields({ fullName: ' A ' }, 'update').errors)).toEqual(['fullName'])
    expect(readUserFields({ fullName: ' Al ' }, 'update')).toEqual({ errors: [], data: { fullName: 'Al' } })
    expect(readUserFields({ fullName: 'a'.repeat(120) }, 'update').errors).toEqual([])
    expect(fieldsOf(readUserFields({ fullName: 'a'.repeat(121) }, 'update').errors)).toEqual(['fullName'])
  })

  it('applies the password rules to the initial password, including the email local part', () => {
    expect(fieldsOf(readUserFields({ ...valid, initialPassword: 'nara.sukjai' }, 'create').errors)).toEqual(['initialPassword'])
    expect(fieldsOf(readUserFields({ ...valid, initialPassword: ' '.repeat(12) }, 'create').errors)).toEqual(['initialPassword'])
    expect(readUserFields({ ...valid, initialPassword: 'x'.repeat(128) }, 'create').errors).toEqual([])
  })

  it('on update accepts any subset of the four fields and rejects everything else', () => {
    expect(readUserFields({ isActive: false }, 'update')).toEqual({ errors: [], data: { isActive: false } })
    expect(fieldsOf(readUserFields({ passwordHash: 'x', mustChangePassword: true, department: 'IT', createdAt: 'now' }, 'update').errors)).toEqual([
      'createdAt',
      'department',
      'mustChangePassword',
      'passwordHash',
    ])
    expect(fieldsOf(readUserFields({ initialPassword: 'first-login-2026' }, 'update').errors)).toEqual(['initialPassword'])
    expect(fieldsOf(readUserFields({ isActive: 'false' }, 'update').errors)).toEqual(['isActive'])
  })

  it('requires at least one field on update', () => {
    expect(readUserFields({}, 'update').errors).toHaveLength(1)
    expect(readUserFields(null, 'update').errors).toHaveLength(1)
  })
})
