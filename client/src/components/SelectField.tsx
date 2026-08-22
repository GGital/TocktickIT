import type { SelectHTMLAttributes } from 'react'
import FormField from './FormField'
import { describedBy, type FieldProps } from './fieldIds'

export type Option = { value: string; label: string }

type SelectFieldProps = FieldProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'required'> & {
    options: Option[]
    /** First entry when nothing is chosen yet — "Select a category", "All". */
    placeholder?: string
  }

export default function SelectField({
  id,
  label,
  required = false,
  helper,
  error,
  options,
  placeholder,
  className = '',
  ...rest
}: SelectFieldProps) {
  return (
    <FormField id={id} label={label} required={required} helper={helper} error={error}>
      <select
        id={id}
        className={`zen-control ${className}`.trim()}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, helper, error)}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FormField>
  )
}
