'use client'

import { FormLabel } from '@/components/ui/form-label'
import { Attachment01Icon } from '@hugeicons/core-free-icons'
import { useEffect, useId, useRef } from 'react'
import { Button } from './button'

export function AttachmentPicker({
  files,
  onChange,
  onInvalid,
  validate,
  label,
  hint,
  accept,
  removeLabel,
  disabled,
}: {
  files: File[]
  onChange: (files: File[]) => void
  onInvalid: () => void
  validate: (files: File[]) => boolean
  label: string
  hint: string
  accept: string
  removeLabel: (name: string) => string
  disabled?: boolean
}) {
  const hintId = useId()
  return (
    <div className="space-y-2">
      <FormLabel
        icon={Attachment01Icon}
        htmlFor={hintId}
        className="text-sm font-medium"
      >
        {label}
      </FormLabel>
      <input
        id={hintId}
        type="file"
        accept={accept}
        multiple
        disabled={disabled}
        aria-describedby={`${hintId}-hint`}
        onChange={(event) => {
          const next = [
            ...files,
            ...Array.from(event.currentTarget.files ?? []),
          ]
          event.currentTarget.value = ''
          if (!validate(next)) {
            onInvalid()
            return
          }
          onChange(next)
        }}
        className="block w-full text-sm file:mr-3 file:rounded-full file:border file:bg-background file:px-4 file:py-2"
      />
      <p id={`${hintId}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
      {!!files.length && (
        <ul className="space-y-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm"
            >
              <ImagePreview file={file} />
              <span className="min-w-0 break-all">
                {file.name} · {(file.size / 1024).toFixed(1)} KB
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                aria-label={removeLabel(file.name)}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ImagePreview({ file }: { file: File }) {
  const image = useRef<HTMLImageElement>(null)
  useEffect(() => {
    if (!file.type.startsWith('image/') || !image.current) return
    const objectUrl = URL.createObjectURL(file)
    image.current.src = objectUrl
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])
  return file.type.startsWith('image/') ? (
    <img ref={image} alt="" className="size-12 shrink-0 rounded object-cover" />
  ) : null
}
