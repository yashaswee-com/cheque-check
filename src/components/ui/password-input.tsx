'use client'

import * as React from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ViewIcon as Eye,
  ViewOffIcon as EyeOff,
} from '@hugeicons/core-free-icons'
import { useTranslations } from 'next-intl'
import { Input, type InputProps } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// U+2217 sits on the math axis, so the mask hint is vertically centred.
export const PASSWORD_PLACEHOLDER = '********'

/** Password field with a visibility toggle; speech input is always disabled. */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<InputProps, 'type' | 'enableMic'>
>(({ className, placeholder = PASSWORD_PLACEHOLDER, ...props }, ref) => {
  const t = useTranslations('Auth')
  const [visible, setVisible] = React.useState(false)
  return (
    <div className="relative w-full">
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        enableMic={false}
        autoComplete={props.autoComplete ?? 'current-password'}
        placeholder={placeholder}
        className={cn('pr-11 placeholder:text-center', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? t('hidePassword') : t('showPassword')}
        aria-pressed={visible}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={visible ? EyeOff : Eye} className="h-5 w-5" />
      </button>
    </div>
  )
})
PasswordInput.displayName = 'PasswordInput'
