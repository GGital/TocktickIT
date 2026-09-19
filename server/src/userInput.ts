import type { UserRole } from '@prisma/client'
import type { FieldError } from './errors.js'
import { validateNewPassword } from './password.js'

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const ROLES: readonly UserRole[] = ['REQUESTER', 'IT_STAFF', 'ADMINISTRATOR']

/** The one email normaliser: stored and compared trimmed and lower-cased, so uniqueness is case-insensitive (BR-49). */
export const normaliseEmail = (value: string) => value.trim().toLowerCase()

export type UserFields = {
  fullName?: string
  email?: string
  role?: UserRole
  isActive?: boolean
  initialPassword?: string
}

const MESSAGES = {
  fullName: "Enter the user's full name.",
  email: 'Enter a valid email address.',
  role: 'Choose one role.',
  isActive: 'Choose whether the account is active.',
  initialPassword: 'Enter an initial password of at least 10 characters.',
  unknown: 'This field cannot be set here.',
} as const

const EDITABLE = ['fullName', 'email', 'role', 'isActive'] as const

/**
 * Reads a create or edit body (api-spec §3.18, §3.19). Create takes all five fields; edit takes any non-empty subset
 * of the four editable ones. Any other key is an error naming it — never silently ignored (BR-48). Every offending
 * field is reported at once.
 */
export function readUserFields(body: unknown, mode: 'create' | 'update') {
  const input = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>
  const allowed: readonly string[] = mode === 'create' ? [...EDITABLE, 'initialPassword'] : EDITABLE
  const errors: FieldError[] = []
  const data: UserFields = {}
  const has = (key: string) => mode === 'create' || key in input

  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) errors.push({ field: key, message: MESSAGES.unknown })
  }

  if (has('fullName')) {
    const name = typeof input.fullName === 'string' ? input.fullName.trim() : ''
    if (name.length < 2 || name.length > 120) errors.push({ field: 'fullName', message: MESSAGES.fullName })
    else data.fullName = name
  }

  if (has('email')) {
    const email = typeof input.email === 'string' ? normaliseEmail(input.email) : ''
    if (!EMAIL_PATTERN.test(email)) errors.push({ field: 'email', message: MESSAGES.email })
    else data.email = email
  }

  if (has('role')) {
    if (!ROLES.includes(input.role as UserRole)) errors.push({ field: 'role', message: MESSAGES.role })
    else data.role = input.role as UserRole
  }

  if (has('isActive')) {
    if (typeof input.isActive !== 'boolean') errors.push({ field: 'isActive', message: MESSAGES.isActive })
    else data.isActive = input.isActive
  }

  if (mode === 'create') {
    const password = input.initialPassword
    const rule =
      typeof password === 'string'
        ? validateNewPassword(password, { currentPassword: '', email: typeof input.email === 'string' ? normaliseEmail(input.email) : '' })
        : MESSAGES.initialPassword
    if (rule) errors.push({ field: 'initialPassword', message: rule })
    else data.initialPassword = password as string
  }

  if (mode === 'update' && Object.keys(input).length === 0) {
    errors.push({ field: 'body', message: 'Change at least one of full name, email, role, or activation.' })
  }

  return { data, errors }
}
