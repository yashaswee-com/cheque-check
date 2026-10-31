import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

export type RunAction = (action: () => Promise<unknown>) => Promise<void>

export function useWorkspaceAction() {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<'success' | 'error' | null>(null)
  const lock = useRef(false)
  const run = useCallback<RunAction>(
    async (action) => {
      if (lock.current) return
      lock.current = true
      setBusy(true)
      setNotice(null)
      try {
        await action()
        await queryClient.invalidateQueries()
        setNotice('success')
      } catch {
        setNotice('error')
        void queryClient.invalidateQueries({
          queryKey: queryKeys.premiumWorkspace.all(),
        })
      } finally {
        lock.current = false
        setBusy(false)
      }
    },
    [queryClient],
  )
  return { busy, notice, setNotice, run }
}
