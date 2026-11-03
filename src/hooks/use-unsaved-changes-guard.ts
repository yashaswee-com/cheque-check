import { useLeaveGuard } from '@/features/drafts/hooks/use-leave-guard'

/**
 * Warns before leaving an edit page with unsaved changes.
 * Call `leave()` after a successful save so the guard's history entry is skipped.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const guard = useLeaveGuard(isDirty)
  return {
    dialogProps: {
      open: guard.isLeavePending,
      onDiscard: guard.confirmLeave,
      onCancel: guard.cancelLeave,
    },
    leave: guard.goBack,
    bypass: guard.bypass,
  }
}
