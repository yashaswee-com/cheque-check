export function createLazyService<T extends object>(
  factory: () => T,
  prototype: object,
): T {
  let instance: T | undefined
  // The target preserves instanceof without constructing runtime dependencies.
  const target: T = Object.create(prototype)
  return new Proxy(target, {
    get(_target, property) {
      instance ??= factory()
      const value = Reflect.get(instance, property, instance)
      return typeof value === 'function' ? value.bind(instance) : value
    },
  })
}
