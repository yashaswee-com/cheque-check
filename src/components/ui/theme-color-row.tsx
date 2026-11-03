'use client'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export const PARTY_THEME_COLORS = [
  '#FF3B30',
  '#FF9500',
  '#FFCC00',
  '#34C759',
  '#007AFF',
  '#5856D6',
  '#AF52DE',
] as const

export const ACCOUNT_THEME_COLORS = [
  '#007AFF',
  '#5856D6',
  '#AF52DE',
  '#FF2D55',
  '#FF3B30',
  '#FF9500',
  '#34C759',
] as const

export const BUSINESS_THEME_COLORS = [
  '#007AFF',
  '#34C759',
  '#FF9500',
  '#FF3B30',
  '#AF52DE',
  '#5856D6',
  '#8E8E93',
] as const

interface ThemeColorRowProps {
  label: string
  colors: readonly string[]
  value: string | null | undefined
  onChange: (color: string) => void
  testId?: string
}

/** Single-row swatch picker shared by entity create and edit forms. */
export function ThemeColorRow({
  label,
  colors,
  value,
  onChange,
  testId,
}: ThemeColorRowProps) {
  return (
    <div className="space-y-2" data-testid={testId}>
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-1">
        {label}
      </Label>
      <div
        role="group"
        aria-label={label}
        data-slot="theme-color-row"
        className="flex flex-nowrap items-center justify-between gap-2 p-1 sm:justify-start sm:gap-3"
      >
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={color}
            aria-pressed={value === color}
            onClick={() => onChange(color)}
            className={cn(
              'size-10 shrink-0 rounded-full transition-all active:scale-95 ring-offset-2 ring-offset-background',
              value === color
                ? 'ring-2 ring-primary scale-110'
                : 'hover:scale-105',
            )}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  )
}
