const resourceRoutes = new Set([
  'cheques',
  'parties',
  'accounts',
  'businesses',
  'tags',
])
const viewingRoutes = new Set([
  'dashboard',
  'features',
  'profile',
  'reports',
  'settings',
  'premium',
  'notifications',
  'referrals',
  'feedback',
  'roadmap',
  'help',
  'drafts',
])
/** Single-segment pages reached from another screen, so they keep a back button. */
const nestedRoutes = new Set(['drafts'])

/** Classify complete route segments, never substrings in entity IDs. */
export function getShellRoute(pathname: string) {
  const segments = pathname.split('?')[0].split('/').filter(Boolean)
  const [family, id, action] = segments
  const resource = resourceRoutes.has(family)
  const workflow = resource && (id === 'create' || action === 'edit')
  const fullscreen = family === 'premium'
  const authenticated = resource || viewingRoutes.has(family)
  return {
    showBottomNav: authenticated && !workflow && !fullscreen,
    isTopLevel:
      authenticated && segments.length === 1 && !nestedRoutes.has(family),
    showBusinessSwitcher:
      (resource && !(family === 'businesses' && id === 'create')) ||
      family === 'dashboard' ||
      family === 'reports' ||
      family === 'drafts',
    createHref:
      segments.length === 1 && (resource || family === 'dashboard')
        ? `/${family === 'dashboard' ? 'cheques' : family}/create`
        : null,
    activeTab: ['dashboard', 'cheques', 'parties', 'accounts'].includes(family)
      ? `/${family}`
      : null,
  }
}

export function isKeyboardViewport({
  editable,
  height,
  baseline,
  scale,
}: {
  editable: boolean
  height: number
  baseline: number
  scale: number
}) {
  return (
    editable && scale === 1 && baseline - height > Math.max(150, baseline * 0.2)
  )
}
