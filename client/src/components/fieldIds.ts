import type { ReactNode } from 'react'

// Shared id wiring for FormField and its controls (ui-spec §2.2). Kept out of
// FormField.tsx so that file exports components only, which keeps fast refresh working.

export const helperId = (id: string) => `${id}-help`
export const errorId = (id: string) => `${id}-error`

/** aria-describedby value for a control, or undefined when it has nothing to describe. */
export const describedBy = (id: string, helper?: ReactNode, error?: string) =>
  [helper ? helperId(id) : null, error ? errorId(id) : null].filter(Boolean).join(' ') || undefined

export type FieldProps = {
  id: string
  label: string
  required?: boolean
  helper?: ReactNode
  error?: string
}
