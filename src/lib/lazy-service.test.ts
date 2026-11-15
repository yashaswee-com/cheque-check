import { describe, expect, it, vi } from 'vitest'
import { createLazyService } from './lazy-service'

class Counter {
  #count = 0
  increment() {
    return ++this.#count
  }
  get count() {
    return this.#count
  }
}
describe('lazy service composition', () => {
  it('constructs once on first access and binds detached methods to private state', () => {
    const factory = vi.fn(() => new Counter())
    const service = createLazyService(factory, Counter.prototype)
    expect(service).toBeInstanceOf(Counter)
    expect(factory).not.toHaveBeenCalled()
    const increment = service.increment
    expect(increment()).toBe(1)
    expect(increment()).toBe(2)
    expect(service.count).toBe(2)
    expect(Reflect.get(service, 'missing')).toBeUndefined()
    expect(factory).toHaveBeenCalledOnce()
  })
  it('propagates construction failure without caching a broken instance', () => {
    const factory = vi
      .fn<() => Counter>()
      .mockImplementationOnce(() => {
        throw new Error('unavailable')
      })
      .mockImplementation(() => new Counter())
    const service = createLazyService(factory, Counter.prototype)
    expect(() => service.increment()).toThrow('unavailable')
    expect(service.increment()).toBe(1)
    expect(factory).toHaveBeenCalledTimes(2)
  })
})
