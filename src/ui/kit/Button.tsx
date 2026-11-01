import type { ButtonHTMLAttributes } from 'react'

const VARIANTS = {
  primary: 'bg-brand text-white hover:brightness-110',
  secondary: 'border border-line bg-surface-2 text-ink-0 hover:border-ink-2',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS
}

export function Button({ variant = 'secondary', type = 'button', className = '', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`h-8 rounded-sm px-4 font-medium outline-none focus-visible:ring-1 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  )
}
