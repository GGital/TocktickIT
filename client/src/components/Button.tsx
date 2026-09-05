import type { ButtonHTMLAttributes } from 'react'

// ui-spec §2.3. Bootstrap carries the shape; zen-theme.css remaps its --bs-btn-* values.
const variantClass = {
  primary: 'btn-primary',
  secondary: 'btn-outline-primary',
  tertiary: 'btn-link',
  destructive: 'btn-outline-danger',
} as const

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variantClass
  /** Busy shows a spinner, disables the control, and sets aria-busy (ui-spec §2.1). */
  busy?: boolean
  /** Explicit busy label — "Submitting…", never a generic one. */
  busyLabel?: string
}

export default function Button({
  variant = 'primary',
  busy = false,
  busyLabel,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn ${variantClass[variant]} ${className}`.trim()}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy && <span className="zen-spinner" data-testid="zen-spinner" aria-hidden="true" />}
      {busy ? (busyLabel ?? children) : children}
    </button>
  )
}
