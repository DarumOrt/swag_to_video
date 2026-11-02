import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  [
    'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap font-medium',
    'transition-[background-color,color,border-color,transform] duration-150 ease-out',
    'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    '[&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg hover:bg-accent-strong',
        secondary: 'border border-line-strong bg-raised text-fg hover:bg-hover',
        ghost: 'text-muted hover:bg-hover hover:text-fg',
        danger: 'bg-danger-soft text-danger hover:bg-danger/25',
      },
      size: {
        sm: 'h-7 rounded-sm px-2.5 text-xs',
        md: 'h-8 rounded-md px-3 text-[13px]',
        lg: 'h-10 rounded-md px-4 text-sm',
        icon: 'size-8 rounded-md',
        'icon-lg': 'size-10 rounded-full [&_svg]:size-5',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)
