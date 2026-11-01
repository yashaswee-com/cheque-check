'use client'

import * as React from 'react'
import { OTPInput, REGEXP_ONLY_DIGITS } from 'input-otp'
import { cn } from '@/lib/utils'

interface DigitSlotsInputProps {
  id?: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  length?: number
  invalid?: boolean
  disabled?: boolean
  autoComplete?: string
  className?: string
  'data-testid'?: string
  'aria-describedby'?: string
}

/** Fixed-length numeric entry rendered as individual digit slots (OTP style). */
export const DigitSlotsInput = React.forwardRef<
  HTMLInputElement,
  DigitSlotsInputProps
>(function DigitSlotsInput(
  {
    id,
    value,
    onChange,
    onBlur,
    length = 6,
    invalid = false,
    disabled,
    autoComplete = 'off',
    className,
    'data-testid': testId,
    'aria-describedby': describedBy,
  },
  ref,
) {
  return (
    <OTPInput
      ref={ref}
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete={autoComplete}
      data-testid={testId}
      maxLength={length}
      pattern={REGEXP_ONLY_DIGITS}
      pasteTransformer={(pasted) => pasted.replace(/\D/g, '').slice(0, length)}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      disabled={disabled}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      containerClassName={cn('w-full has-[:disabled]:opacity-50', className)}
      render={({ slots }) => (
        <div
          className="grid w-full gap-2"
          style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}
          data-slot="digit-slots"
          aria-hidden="true"
        >
          {slots.map((slot, index) => (
            <div
              key={index}
              data-slot="digit-slot"
              data-active={slot.isActive || undefined}
              className={cn(
                'relative flex h-12 min-w-0 items-center justify-center rounded-sm border border-border bg-canvas-parchment text-lg font-semibold tabular-nums',
                invalid && 'border-destructive',
                slot.isActive && 'border-ring ring-2 ring-ring/50',
              )}
            >
              {slot.char}
              {slot.hasFakeCaret && (
                <span className="absolute h-5 w-px animate-pulse bg-foreground motion-reduce:animate-none" />
              )}
            </div>
          ))}
        </div>
      )}
    />
  )
})
