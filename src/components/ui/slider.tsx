'use client'

import { Slider as SliderPrimitive } from '@base-ui/react/slider'
import { cn } from '@/lib/utils'

type SliderProps = SliderPrimitive.Root.Props & {
  /** Accessible label for each thumb, e.g. "Minimum amount". */
  thumbLabels?: string[]
}

function Slider({
  className,
  value,
  defaultValue,
  min = 0,
  max = 100,
  thumbLabels,
  ...props
}: SliderProps) {
  const values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [min]

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      value={value}
      defaultValue={defaultValue}
      min={min}
      max={max}
      thumbAlignment="edge"
      className={cn('w-full touch-none select-none', className)}
      {...props}
    >
      <SliderPrimitive.Control className="relative flex h-6 w-full items-center data-disabled:opacity-50">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="h-full bg-primary"
          />
        </SliderPrimitive.Track>
        {values.map((_, index) => (
          <SliderPrimitive.Thumb
            key={index}
            index={index}
            aria-label={thumbLabels?.[index]}
            data-slot="slider-thumb"
            className="block size-5 shrink-0 rounded-full border-2 border-primary bg-background shadow-sm outline-none transition-[box-shadow] focus-visible:ring-4 focus-visible:ring-ring/40"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
