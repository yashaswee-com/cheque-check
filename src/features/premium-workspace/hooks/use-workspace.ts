import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { premiumWorkspaceService } from '../services/workspace.service'

export function useWorkspaceContext(
  businessId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.premiumWorkspace.context(businessId),
    queryFn: () => premiumWorkspaceService.context(businessId!),
    enabled: enabled && !!businessId,
  })
}

export function useWorkspaceTools(
  businessId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.premiumWorkspace.tools(businessId),
    queryFn: () => premiumWorkspaceService.tools(businessId!),
    enabled: enabled && !!businessId,
  })
}
