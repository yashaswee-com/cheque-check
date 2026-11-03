import {
  inboxKinds,
  type InboxKind,
  type InboxMatch,
} from '@/validators/notification-inbox'

/** Resolves free text to the event kinds and businesses whose localized names contain it. */
export function matchInboxSearch(
  search: string,
  kindLabels: Record<InboxKind, string>,
  businesses: readonly { id: string; name: string | null }[],
): InboxMatch | undefined {
  const term = search.trim().toLocaleLowerCase()
  if (!term) return undefined
  return {
    kinds: inboxKinds.filter((kind) =>
      kindLabels[kind].toLocaleLowerCase().includes(term),
    ),
    businessIds: businesses
      .filter((business) =>
        (business.name ?? '').toLocaleLowerCase().includes(term),
      )
      .map((business) => business.id)
      .slice(0, 100),
  }
}
