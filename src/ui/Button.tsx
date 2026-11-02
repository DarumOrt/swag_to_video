import type { VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { buttonVariants } from './buttonVariants'
import { cn } from './cn'

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
}
