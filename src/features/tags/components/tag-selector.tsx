'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon as ChevronDown,
  CheckmarkCircle01Icon as Check,
  PlusSignIcon as Plus,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useTags } from '@/features/tags/hooks/use-tags'
import { nextTagColor } from '@/features/tags/lib/tag-colors'
import type { Tag } from '@/types'
import { cn } from '@/lib/utils'

interface TagSelectorProps {
  businessId: string | undefined
  value: string[]
  onChange: (tagIds: string[]) => void
  placeholder?: string
}

export function TagSelector({
  businessId,
  value,
  onChange,
  placeholder,
}: TagSelectorProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [createError, setCreateError] = useState(false)
  const creating = useRef(false)
  const t = useTranslations('SharedUI')
  const { tags, isLoading, createTag, isCreating } = useTags(businessId)
  const selected = tags.filter((tag) => value.includes(tag.id))

  const toggleTag = (tag: Tag) => {
    onChange(
      value.includes(tag.id)
        ? value.filter((id) => id !== tag.id)
        : [...value, tag.id],
    )
  }

  const addTag = async () => {
    const trimmedName = name.trim()
    if (!businessId || !trimmedName || creating.current) return
    creating.current = true
    setCreateError(false)
    try {
      const tag = await createTag({
        business_id: businessId,
        name: trimmedName,
        color: nextTagColor(tags),
      })
      onChange([...value, tag.id])
      setName('')
    } catch {
      setCreateError(true)
    } finally {
      creating.current = false
    }
  }

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            data-testid="tag-selector-trigger"
            className="h-auto min-h-12 w-full justify-between gap-2 rounded-sm border-primary/10 py-2"
          />
        }
      >
        <div className="flex min-h-6 flex-1 flex-wrap items-center gap-1.5">
          {isLoading && value.length > 0 ? (
            value
              .slice(0, 3)
              .map((id) => (
                <Skeleton key={id} className="h-6 w-16 rounded-full" />
              ))
          ) : selected.length === 0 ? (
            <span className="text-muted-foreground">
              {placeholder ?? t('addTags')}
            </span>
          ) : (
            selected.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold text-white"
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
              </span>
            ))
          )}
        </div>
        <HugeiconsIcon
          icon={ChevronDown}
          className="h-4 w-4 shrink-0 opacity-50"
        />
      </PopoverTrigger>
      <PopoverContent
        backdrop
        aria-label={t('addTags')}
        className="w-(--anchor-width) max-w-[calc(100vw-2rem)] p-3"
        align="start"
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={name}
              data-testid="tag-selector-create-input"
              onChange={(event) => setName(event.target.value)}
              placeholder={t('newTag')}
              aria-label={t('newTag')}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void addTag()
                }
              }}
            />
            <Button
              type="button"
              size="icon"
              onClick={() => void addTag()}
              loading={isCreating}
              disabled={!businessId || !name.trim() || isCreating}
              aria-label={t('createTag')}
              data-testid="tag-selector-create-button"
            >
              <HugeiconsIcon icon={Plus} className="h-4 w-4" />
            </Button>
          </div>
          {createError && (
            <p role="alert" className="text-xs text-destructive">
              {t('createTagFailed')}
            </p>
          )}
          <div className="h-48 space-y-1 overflow-y-auto">
            {isLoading &&
              Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="flex items-center gap-2 px-2 py-2">
                  <Skeleton className="size-3 shrink-0 rounded-full" />
                  <Skeleton className="h-4 w-24 rounded" />
                </div>
              ))}
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                aria-pressed={value.includes(tag.id)}
                data-testid={`tag-selector-option-${tag.id}`}
                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left hover:bg-muted"
                onClick={() => toggleTag(tag)}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </span>
                <HugeiconsIcon
                  icon={Check}
                  className={cn(
                    'h-4 w-4 text-primary',
                    value.includes(tag.id) ? 'opacity-100' : 'opacity-0',
                  )}
                />
              </button>
            ))}
            {!isLoading && tags.length === 0 && (
              <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
                {t('noTags')}
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
