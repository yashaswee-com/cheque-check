'use client'

import { useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Mail01Icon,
  MailOpen01Icon,
  MegaphoneIcon,
  Search01Icon,
  TickDouble02Icon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import {
  FilterPillSection,
  filterPillClassName,
} from '@/components/ui/pill-scroller'

type AnnouncementFilter = 'all' | 'unread' | 'read'

type Announcement = {
  id: string
  title: string
  category: string
  summary: string
  detail: string
  author: string
  publishedAt: string
  read: boolean
}

const initialAnnouncements: Announcement[] = [
  {
    id: 'a-1',
    title: 'Security update',
    category: 'Safety',
    summary: 'We tightened access checks for your shared reports.',
    detail:
      'A small security hardening release is now live. We tightened report access validation and improved the sign-in checks for sensitive account activity.',
    author: 'Product security',
    publishedAt: 'Today',
    read: false,
  },
  {
    id: 'a-2',
    title: 'New reporting dashboard',
    category: 'Reports',
    summary: 'The report page now surfaces more summary status cards.',
    detail:
      'You can find clearer cashflow summaries, risk highlights, and the upgraded statistics view directly from the reports area.',
    author: 'Cheques team',
    publishedAt: '2 days ago',
    read: true,
  },
  {
    id: 'a-3',
    title: 'Faster reminders',
    category: 'Automation',
    summary: 'Reminder flows are now smarter and more reliable.',
    detail:
      'Reminder scheduling and follow-ups are now more consistent across delayed cheques and business reminders, with better delivery windows and easier review.',
    author: 'Operations',
    publishedAt: '1 week ago',
    read: false,
  },
]

export default function AnnouncementsPage() {
  const [items, setItems] = useState(initialAnnouncements)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<AnnouncementFilter>('all')

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return items.filter((item) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'unread' && !item.read) ||
        (filter === 'read' && item.read)

      if (!matchesFilter) return false
      if (!term) return true

      const haystack =
        `${item.title} ${item.category} ${item.summary} ${item.detail} ${item.author}`.toLowerCase()
      return haystack.includes(term)
    })
  }, [filter, items, search])

  const unreadCount = items.filter((item) => !item.read).length

  const markAllRead = () => {
    setItems((current) => current.map((item) => ({ ...item, read: true })))
    setFilter('unread')
  }

  const toggleRead = (id: string) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, read: !item.read } : item,
      ),
    )
  }

  const filters: Array<{
    key: AnnouncementFilter
    label: string
    icon: typeof Mail01Icon
  }> = [
    { key: 'all', label: 'All updates', icon: MegaphoneIcon },
    { key: 'unread', label: 'Unread updates', icon: Mail01Icon },
    { key: 'read', label: 'Read updates', icon: MailOpen01Icon },
  ]

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            leftIcon={Search01Icon}
            type="search"
            aria-label="Search announcements"
            placeholder="Search announcements"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-11 rounded-full border-none bg-canvas-parchment"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-full px-4"
          onClick={markAllRead}
          disabled={unreadCount === 0}
        >
          Mark all read
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3 px-1">
        <div className="text-sm text-muted-foreground">
          {unreadCount} unread
        </div>
      </div>

      <FilterPillSection title="Status">
        {filters.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={filter === option.key}
            onClick={() => setFilter(option.key)}
            className={filterPillClassName(filter === option.key)}
          >
            <HugeiconsIcon icon={option.icon} className="h-4 w-4" />
            <span className="text-sm font-bold">{option.label}</span>
          </button>
        ))}
      </FilterPillSection>

      {filtered.length === 0 ? (
        <EmptyState
          icon={MegaphoneIcon}
          title={
            filter === 'unread' ? 'No unread updates' : 'No announcements found'
          }
          description={
            filter === 'unread'
              ? 'All caught up. Everything is up to date.'
              : 'Try a different search or switch back to all updates.'
          }
          action={
            filter === 'unread'
              ? { label: 'View all', onClick: () => setFilter('all') }
              : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => toggleRead(item.id)}
              className={
                'w-full rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/30 ' +
                (item.read
                  ? 'border-border/80'
                  : 'border-primary/30 bg-primary/5')
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {item.category}
                    </span>
                    {!item.read && (
                      <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                        New
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-semibold">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.summary}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{item.publishedAt}</span>
                  <HugeiconsIcon
                    icon={item.read ? MailOpen01Icon : Mail01Icon}
                    className="h-4 w-4"
                  />
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-border/60 bg-background/80 p-3">
                <p className="text-sm leading-6 text-foreground">
                  {item.detail}
                </p>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>By {item.author}</span>
                <span className="inline-flex items-center gap-1 font-medium text-primary">
                  {item.read ? 'Read' : 'Unread'}
                  <HugeiconsIcon
                    icon={TickDouble02Icon}
                    className="h-3.5 w-3.5"
                  />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
