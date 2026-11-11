export type Cache<T> = {
  get(key: string): T | undefined
  set(key: string, value: T, ttlMs: number): void
  clear(): void
}

export function createCache<T>(max: number, now: () => number = () => Date.now()): Cache<T> {
  const entries = new Map<string, { value: T; expiresAt: number }>()
  return {
    get(key) {
      const entry = entries.get(key)
      if (!entry) return undefined
      if (now() >= entry.expiresAt) {
        entries.delete(key)
        return undefined
      }
      return entry.value
    },
    set(key, value, ttlMs) {
      entries.delete(key) // a rewritten key becomes the newest
      entries.set(key, { value, expiresAt: now() + ttlMs })
      while (entries.size > max) {
        const oldest = entries.keys().next().value
        if (oldest === undefined) break
        entries.delete(oldest)
      }
    },
    clear() {
      entries.clear()
    },
  }
}
