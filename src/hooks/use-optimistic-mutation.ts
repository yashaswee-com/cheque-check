import {
  QueryKey,
  useMutation,
  useQueryClient,
  type MutationFunction,
} from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

type QueryKeyResolver<TVariables> =
  QueryKey | ((variables: TVariables) => QueryKey)

interface AdditionalMutation<TData, TVariables> {
  queryKey: QueryKeyResolver<TVariables>
  update: (
    current: TData | undefined,
    variables: TVariables,
  ) => TData | undefined
}

interface MutationContext {
  previousValues: Record<string, unknown>
}

interface UseOptimisticMutationOptions<TData, TVariables, TResult> {
  queryKey: QueryKey
  additionalQueryKeys?: QueryKeyResolver<TVariables>[]
  additionalMutations?: Array<AdditionalMutation<any, TVariables>>
  mutationFn: MutationFunction<TResult, TVariables>
  update: (
    current: TData | undefined,
    variables: TVariables,
  ) => TData | undefined
  onSuccess?: (data: TResult, variables: TVariables) => void | Promise<void>
  onError?: (
    error: unknown,
    variables: TVariables,
    context: MutationContext | undefined,
  ) => void
}

function resolveQueryKey<TVariables>(
  key: QueryKeyResolver<TVariables>,
  variables: TVariables,
): QueryKey {
  return typeof key === 'function' ? key(variables) : key
}

export function useOptimisticMutation<TData, TVariables, TResult>({
  queryKey,
  additionalQueryKeys = [],
  additionalMutations = [],
  mutationFn,
  update,
  onSuccess,
  onError,
}: UseOptimisticMutationOptions<TData, TVariables, TResult>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onMutate: async (variables) => {
      const keysToSync = Array.from(
        new Map(
          [
            queryKey,
            ...additionalQueryKeys.map((key) =>
              resolveQueryKey(key, variables),
            ),
            ...additionalMutations.map((meta) =>
              resolveQueryKey(meta.queryKey, variables),
            ),
          ].map((key) => [JSON.stringify(key), key]),
        ).values(),
      )

      const previousValues: Record<string, unknown> = {}
      for (const key of keysToSync) {
        const keyString = JSON.stringify(key)
        previousValues[keyString] = queryClient.getQueryData(key)
        await queryClient.cancelQueries({ queryKey: key })
      }

      queryClient.setQueryData<TData>(queryKey, (current) =>
        update(current, variables),
      )

      for (const mutation of additionalMutations) {
        const key = resolveQueryKey(mutation.queryKey, variables)
        queryClient.setQueryData(key, (current) =>
          mutation.update(current, variables),
        )
      }

      return { previousValues }
    },
    onError: (error, variables, context) => {
      for (const [key, value] of Object.entries(
        context?.previousValues ?? {},
      )) {
        queryClient.setQueryData(JSON.parse(key), value)
      }
      onError?.(error, variables, context)
    },
    onSuccess,
    onSettled: async (_data, _error, variables) => {
      const keysToInvalidate = Array.from(
        new Map(
          [
            queryKey,
            ...(['cheques', 'businesses'].includes(String(queryKey[0]))
              ? [queryKeys.monetization.freeUsageAll()]
              : []),
            ...(['cheques', 'accounts', 'businesses', 'master-banks'].includes(
              String(queryKey[0]),
            )
              ? [queryKeys.cheques.analyticsAll()]
              : []),
            ...(queryKey[0] === 'cheques'
              ? [
                  queryKeys.cheques.pages(
                    typeof queryKey[1] === 'string' ? queryKey[1] : undefined,
                  ),
                  queryKeys.cheques.summaries(
                    typeof queryKey[1] === 'string' ? queryKey[1] : undefined,
                  ),
                  queryKeys.businesses.summaries(),
                  queryKeys.businesses.allCheques(),
                  queryKeys.premiumWorkspace.all(),
                ]
              : []),
            ...additionalQueryKeys.map((key) =>
              resolveQueryKey(key, variables),
            ),
            ...additionalMutations.map((meta) =>
              resolveQueryKey(meta.queryKey, variables),
            ),
          ].map((key) => [JSON.stringify(key), key]),
        ).values(),
      )

      await Promise.all(
        keysToInvalidate.map((key) =>
          queryClient.invalidateQueries({ queryKey: key }),
        ),
      )
    },
  })
}
