import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@/lib/utils'
import type { IconType } from '@/types'

interface UsageMeterProps {
  label: string
  used: number
  limit: number
  unlimited?: boolean
  usedText: string
  icon: IconType
}

export function UsageMeter({
  label,
  used,
  limit,
  unlimited = false,
  usedText,
  icon,
}: UsageMeterProps) {
  const percent = unlimited
    ? 0
    : limit === 0
      ? 100
      : Math.min(100, Math.max(0, (used / limit) * 100))

  return (
    <div className="space-y-2" data-testid="usage-meter">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="inline-flex min-w-0 items-center gap-2">
          <HugeiconsIcon
            icon={icon}
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="truncate">{label}</span>
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {usedText}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={usedText}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full bg-primary transition-[width]')}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
