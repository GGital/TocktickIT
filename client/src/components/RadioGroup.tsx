import type { ReactNode } from 'react'
import FormField from './FormField'
import { describedBy, type FieldProps } from './fieldIds'

export type RadioOption = { value: string; label: ReactNode }

type RadioGroupProps = FieldProps & {
  name: string
  options: RadioOption[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export default function RadioGroup({
  id,
  label,
  required = false,
  helper,
  error,
  name,
  options,
  value,
  onChange,
  disabled = false,
}: RadioGroupProps) {
  return (
    <fieldset
      className="zen-field"
      aria-required={required || undefined}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(id, helper, error)}
    >
      <FormField id={id} label={label} required={required} helper={helper} error={error} as="legend">
        <div className="d-flex flex-wrap gap-3">
          {options.map((option) => (
            <label key={option.value} className="d-inline-flex align-items-center gap-2">
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={value === option.value}
                disabled={disabled}
                onChange={() => onChange(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </FormField>
    </fieldset>
  )
}
