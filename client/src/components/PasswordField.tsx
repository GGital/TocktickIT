import { useState, type InputHTMLAttributes, type Ref } from 'react'
import FormField from './FormField'
import { describedBy, type FieldProps } from './fieldIds'

type PasswordFieldProps = FieldProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'required' | 'type'> & {
    ref?: Ref<HTMLInputElement>
  }

/**
 * Password input with a reveal toggle (ui-spec §2.1, §11). The toggle changes only the `type` attribute of the
 * same element, so the caret and the value survive. Uncontrolled by design: the value lives in the input, never
 * in React state, and is read once at submit.
 */
export default function PasswordField({
  id,
  label,
  required = false,
  helper,
  error,
  className = '',
  ref,
  ...rest
}: PasswordFieldProps) {
  const [revealed, setRevealed] = useState(false)

  return (
    <FormField id={id} label={label} required={required} helper={helper} error={error}>
      <div className="zen-password">
        <input
          ref={ref}
          id={id}
          type={revealed ? 'text' : 'password'}
          className={`zen-control ${className}`.trim()}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, helper, error)}
          autoCapitalize="none"
          spellCheck={false}
          {...rest}
        />
        <button
          type="button"
          className="btn btn-outline-primary zen-reveal"
          aria-label={revealed ? 'Hide password' : 'Show password'}
          aria-pressed={revealed}
          onClick={() => setRevealed((shown) => !shown)}
        >
          {revealed ? 'Hide' : 'Show'}
        </button>
      </div>
    </FormField>
  )
}
