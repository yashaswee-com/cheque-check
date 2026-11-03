'use client'

import { useState, useRef } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Camera01Icon as Camera,
  Delete02Icon as Trash,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { EntityAvatar } from './entity-avatar'
import { SkeletonImage } from './skeleton-image'
import { Button } from './button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog'
import { storageService } from '@/services/storage.service'
import { toast } from './toast'
import { logger } from '@/lib/logger'
import { useTranslations } from 'next-intl'

async function centerCropImage(file: File): Promise<File> {
  const image = new Image()
  const objectUrl = URL.createObjectURL(file)
  try {
    image.src = objectUrl
    await image.decode()
    const size = Math.min(image.naturalWidth, image.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(
      image,
      (image.naturalWidth - size) / 2,
      (image.naturalHeight - size) / 2,
      size,
      size,
      0,
      0,
      size,
      size,
    )
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, file.type, 0.9),
    )
    return blob ? new File([blob], file.name, { type: file.type }) : file
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

interface EditableAvatarProps {
  name: string
  color?: string
  icon?: string
  imageUrl?: string | null
  onUpload: (url: string) => Promise<void>
  onDelete?: () => Promise<void>
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function EditableAvatar({
  name,
  color,
  icon,
  imageUrl,
  onUpload,
  onDelete,
  className,
  size = 'lg',
}: EditableAvatarProps) {
  const t = useTranslations('Common')
  const [pendingAction, setPendingAction] = useState<
    'upload' | 'delete' | null
  >(null)
  const isPending = pendingAction !== null
  const [isOpen, setIsOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const sizeClasses = {
    sm: 'h-10 w-10',
    md: 'h-14 w-14',
    lg: 'h-20 w-20',
    xl: 'h-32 w-32',
  }
  const badgeClasses = {
    sm: { badge: '-bottom-1 -right-1 size-5', icon: 'size-3' },
    md: { badge: '-bottom-1 -right-1 size-6', icon: 'size-3' },
    lg: { badge: '-bottom-1 -right-1 size-7', icon: 'size-3.5' },
    xl: { badge: 'bottom-0 right-0 size-9', icon: 'size-4' },
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setPendingAction('upload')
    try {
      const croppedFile = await centerCropImage(file)
      const publicUrl = await storageService.uploadAvatar(croppedFile)
      await onUpload(publicUrl)
      toast.add({
        title: t('success'),
        description: t('avatarUpdated'),
        type: 'success',
      })
      setIsOpen(false)
    } catch (error) {
      logger.error('Error uploading avatar', error)
      toast.add({
        title: t('error'),
        description: t('avatarUploadFailed'),
        type: 'error',
      })
    } finally {
      setPendingAction(null)
    }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    setPendingAction('delete')
    try {
      await onDelete()
      toast.add({
        title: t('success'),
        description: t('avatarRemoved'),
        type: 'success',
      })
      setIsOpen(false)
    } catch (error) {
      logger.error('Error deleting avatar', error)
      toast.add({
        title: t('error'),
        description: t('avatarRemoveFailed'),
        type: 'error',
      })
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label={t('changePhoto')}
            className={cn(
              'relative group shrink-0 rounded-full transition-transform active:scale-95',
              sizeClasses[size],
              className,
            )}
          >
            <span
              className="absolute inset-0 overflow-hidden rounded-full border-2 border-background"
              data-testid="avatar-image-clip"
            >
              {imageUrl ? (
                <SkeletonImage
                  src={imageUrl}
                  alt={name}
                  containerClassName="h-full w-full rounded-full"
                  className="h-full w-full object-cover"
                />
              ) : (
                <EntityAvatar
                  name={name}
                  color={color}
                  icon={icon}
                  size={size === 'xl' ? 'lg' : size}
                  className="h-full w-full"
                />
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <HugeiconsIcon
                  icon={Camera}
                  className="h-1/3 w-1/3 text-white"
                />
              </span>
            </span>
            <span
              className={cn(
                'absolute flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm ring-2 ring-background',
                badgeClasses[size].badge,
              )}
              data-testid="avatar-camera-badge"
            >
              <HugeiconsIcon
                icon={Camera}
                className={badgeClasses[size].icon}
              />
            </span>
          </button>
        }
      />

      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('changePhoto')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-6 py-8">
          <div
            className={cn(
              'rounded-full overflow-hidden border-4 border-muted/20',
              sizeClasses.xl,
            )}
          >
            {imageUrl ? (
              <SkeletonImage
                src={imageUrl}
                alt={name}
                containerClassName="h-full w-full rounded-full"
                className="h-full w-full object-cover"
              />
            ) : (
              <EntityAvatar
                name={name}
                color={color}
                icon={icon}
                size="lg"
                className="h-full w-full"
              />
            )}
          </div>

          <div className="flex w-full gap-3">
            <Button
              variant="outline"
              className="flex-1 rounded-full h-12"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPending}
              loading={pendingAction === 'upload'}
            >
              {t('uploadNew')}
            </Button>
            {imageUrl && onDelete && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('delete')}
                className="rounded-full h-12 w-12 p-0 text-destructive hover:bg-destructive/10"
                onClick={handleDelete}
                disabled={isPending}
                loading={pendingAction === 'delete'}
              >
                <HugeiconsIcon icon={Trash} className="h-5 w-5" />
              </Button>
            )}
          </div>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleFileChange}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
