import type { InputHTMLAttributes } from 'react'
import FormField from './FormField'
import { describedBy, type FieldProps } from './fieldIds'

type TextFieldProps = FieldProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'required'>

export default function TextField({
  id,
  label,
  required = false,
  helper,
  error,
  className = '',
  ...rest
}: TextFieldProps) {
  return (
    <FormField id={id} label={label} required={required} helper={helper} error={error}>
      <input
        id={id}
        className={`zen-control ${className}`.trim()}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, helper, error)}
        {...rest}
      />
    </FormField>
  )
}
