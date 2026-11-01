import { vi } from 'vitest'

export function stubWindowReload() {
  const reload = vi.fn()
  // jsdom's unforgeable location setter interprets stubbing location as navigation.
  vi.stubGlobal(
    'window',
    new Proxy(window, {
      get(target, property) {
        return property === 'location'
          ? { reload }
          : Reflect.get(target, property, target)
      },
    }),
  )
  return reload
}
