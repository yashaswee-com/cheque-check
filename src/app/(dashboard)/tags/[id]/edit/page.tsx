'use client'

import { useCallback, useState } from 'react'
import dynamic from 'next/dynamic'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import { Delete02Icon as Trash2 } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/toast'
import { useTags } from '@/features/tags/hooks/use-tags'
import { useTagDetail } from '@/features/tags/hooks/use-tag-list'
import { TagForm } from '@/features/tags/components/tag-form'
import { EditSaveBar } from '@/components/ui/edit-save-bar'
import { UnsavedChangesDialog } from '@/components/ui/unsaved-changes-dialog'
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard'

const DeleteConfirmationDialog = dynamic(
  () =>
    import('@/components/ui/delete-dialog').then(
      (mod) => mod.DeleteConfirmationDialog,
    ),
  {
    loading: () => <Skeleton className="h-14 w-full rounded-full" />,
    ssr: false,
  },
)

export default function EditTagPage() {
  const t = useTranslations('Tags')
  const router = useRouter()
  const { id } = useParams() as { id: string }
  const { tag, isLoading } = useTagDetail(id)
  const { updateTag, isUpdating, deleteTag } = useTags(tag?.business_id)
  const [formState, setFormState] = useState({
    isDirty: false,
    canSubmit: false,
  })
  const onStateChange = useCallback(
    (next: { isDirty: boolean; canSubmit: boolean }) => setFormState(next),
    [],
  )
  const guard = useUnsavedChangesGuard(formState.isDirty)

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-8 pb-20">
        <Skeleton className="h-14 w-full rounded-sm" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-sm" />
      </div>
    )
  }

  if (!tag) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        {t('notFound')}
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-8 pb-6">
      <TagForm
        key={tag.id}
        formId="tag-edit-form"
        hideSubmit
        onStateChange={onStateChange}
        defaultValues={{ name: tag.name, color: tag.color }}
        submitLabel={t('updateTag')}
        isSaving={isUpdating}
        onSubmit={async (values) => {
          try {
            await updateTag({ id: tag.id, input: values })
            toast.add({ title: t('tagUpdated'), type: 'success' })
            guard.leave()
          } catch {
            toast.add({ title: t('saveFailed'), type: 'error' })
          }
        }}
      />
      <DeleteConfirmationDialog
        title={t('deleteConfirmTitle')}
        description={t('deleteConfirmDesc')}
        confirmName={tag.name}
        onDelete={async () => {
          await deleteTag(tag.id)
          guard.bypass(() => router.push('/tags'))
        }}
        trigger={
          <Button
            type="button"
            variant="ghost"
            data-testid="tag-delete-trigger"
            className="h-14 w-full rounded-full text-muted-foreground transition-colors hover:text-destructive"
          >
            <HugeiconsIcon icon={Trash2} className="mr-2 h-5 w-5" />
            {t('deleteTag')}
          </Button>
        }
      />
      <EditSaveBar
        formId="tag-edit-form"
        label={t('updateTag')}
        isDirty={formState.canSubmit}
        isSaving={isUpdating}
        testId="tag-form-submit-button"
      />
      <UnsavedChangesDialog {...guard.dialogProps} />
    </div>
  )
}
