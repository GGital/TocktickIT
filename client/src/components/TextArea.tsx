import type { TextareaHTMLAttributes } from 'react'
import FormField from './FormField'
import { describedBy, type FieldProps } from './fieldIds'

type TextAreaProps = FieldProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'required'> & {
    /** Shows "n / max characters" under the control (ui-spec §5.2). */
    counterMax?: number
  }

export default function TextArea({
  id,
  label,
  required = false,
  helper,
  error,
  counterMax,
  className = '',
  rows = 6,
  value,
  ...rest
}: TextAreaProps) {
  const counter = counterMax
    ? `${String(value ?? '').length} / ${counterMax} characters`
    : undefined
  const helperText = counter ? (
    <>
      {helper} <span className="ms-1">{counter}</span>
    </>
  ) : (
    helper
  )

  return (
    <FormField id={id} label={label} required={required} helper={helperText} error={error}>
      <textarea
        id={id}
        rows={rows}
        value={value}
        className={`zen-control zen-textarea ${className}`.trim()}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, helperText, error)}
        {...rest}
      />
    </FormField>
  )
}
