'use client'

import { forwardRef, useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import { Calendar03Icon } from '@hugeicons/core-free-icons'
import { Input, type InputProps } from './input'
import { Calendar } from './calendar'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'
import { calendarDay, parseCalendarDate } from '@/lib/preference-format'
import { TZDate } from 'react-day-picker'
import { cn } from '@/lib/utils'

export interface DateInputProps extends InputProps {
  onValidityChange?: (valid: boolean) => void
}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  (
    {
      value,
      name,
      onChange,
      onBlur,
      onValidityChange,
      leftIcon,
      className,
      min,
      max,
      ...props
    },
    ref,
  ) => {
    const display = useDisplayFormat()
    const t = useTranslations('Common')
    const canonical = typeof value === 'string' ? value : ''
    const nativeRef = useRef<HTMLInputElement>(null)
    const visibleRef = useRef<HTMLInputElement>(null)
    const [open, setOpen] = useState(false)
    const errorId = useId()
    const [edit, setEdit] = useState<{
      value: string
      pattern: string
      text: string
      parseInvalid: boolean
    } | null>(null)
    const current =
      edit?.value === canonical && edit.pattern === display.dateFormat
        ? edit
        : null
    const text = current?.text ?? (canonical ? display.date(canonical) : '')
    const outOfRange = (day: string) =>
      (typeof min === 'string' && day < min) ||
      (typeof max === 'string' && day > max)
    const invalid =
      current?.parseInvalid === true || (!!canonical && outOfRange(canonical))
    const error = t('invalidDateFormat', {
      format: display.dateFormat.toUpperCase(),
    })
    const selected = canonical
      ? (() => {
          const [year, month, day] = canonical.split('-').map(Number)
          return new TZDate(year, month - 1, day, display.timeZone)
        })()
      : undefined
    useEffect(() => {
      visibleRef.current?.setCustomValidity(invalid ? error : '')
      onValidityChange?.(!invalid)
    }, [invalid, error, onValidityChange])

    const change = (text: string) => {
      if (props.disabled || props.readOnly) return
      const parsed = text ? parseCalendarDate(text, display.dateFormat) : ''
      const invalid = parsed === null || (!!parsed && outOfRange(parsed))
      const next = parsed ?? ''
      setEdit({
        value: next,
        pattern: display.dateFormat,
        text: parsed === null ? text : next ? display.date(next) : '',
        parseInvalid: parsed === null,
      })
      visibleRef.current?.setCustomValidity(invalid ? error : '')
      onValidityChange?.(!invalid)
      const native = nativeRef.current
      if (native) {
        // Same native-event bridge used by Input's speech recognition; forms
        // receive ISO values while the editable field uses the chosen pattern.
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set?.call(native, next)
        native.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }
    return (
      <div className="relative">
        <input
          hidden
          type="text"
          name={name}
          disabled={props.disabled}
          value={canonical}
          onChange={onChange}
          onBlur={onBlur}
          ref={(node) => {
            nativeRef.current = node
            if (node)
              node.focus = (options) => visibleRef.current?.focus(options)
            if (typeof ref === 'function') ref(node)
            else if (ref) ref.current = node
          }}
        />
        <Input
          {...props}
          ref={visibleRef}
          type="text"
          value={text}
          enableMic={false}
          leftIcon={leftIcon}
          className={cn(className, 'pr-12')}
          placeholder={display.dateFormat.toUpperCase()}
          aria-invalid={invalid || props['aria-invalid']}
          aria-describedby={
            [props['aria-describedby'], invalid ? errorId : undefined]
              .filter(Boolean)
              .join(' ') || undefined
          }
          onChange={(event) => change(event.currentTarget.value)}
          onBlur={() =>
            nativeRef.current?.dispatchEvent(
              new FocusEvent('focusout', { bubbles: true }),
            )
          }
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            type="button"
            disabled={props.disabled || props.readOnly}
            aria-label={t('chooseDate')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-2 text-muted-foreground"
          >
            <HugeiconsIcon icon={Calendar03Icon} className="size-4" />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={selected}
              defaultMonth={selected}
              disabled={(date) => outOfRange(calendarDay(date))}
              onSelect={(date) => {
                change(date ? calendarDay(date) : '')
                setOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
        {invalid && (
          <p
            id={errorId}
            role="alert"
            className="mt-1 text-xs text-destructive"
          >
            {error}
          </p>
        )}
      </div>
    )
  },
)
DateInput.displayName = 'DateInput'
