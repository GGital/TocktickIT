import type { ReactNode } from 'react'
import { errorId, helperId, type FieldProps } from './fieldIds'

// ui-spec §2.2: label above the control, asterisk plus aria-required, message
// directly below its own field and linked with aria-describedby (BR-18).
export default function FormField({
  id,
  label,
  required = false,
  helper,
  error,
  children,
  as = 'label',
}: FieldProps & { children: ReactNode; as?: 'label' | 'legend' }) {
  const Label = as === 'legend' ? 'legend' : 'label'

  return (
    <div className="zen-field">
      <Label className="zen-label" htmlFor={as === 'legend' ? undefined : id}>
        {label}
        {required && (
          <span className="zen-required" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {children}
      {helper && (
        <p className="zen-help" id={helperId(id)}>
          {helper}
        </p>
      )}
      {error && (
        <p className="zen-error-text" id={errorId(id)}>
          {error}
        </p>
      )}
    </div>
  )
}

/** Rendered once per form (ui-spec §2.2). */
export function RequiredLegend() {
  return <p className="zen-legend">Fields marked * are required.</p>
}
