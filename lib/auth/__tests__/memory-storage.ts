// A `localStorage` stand-in for tests that run in Node, which has none that works.

export function memoryStorage(onSet?: (key: string, value: string) => void): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, String(value))
      onSet?.(key, String(value))
    },
    removeItem: (key) => void items.delete(key),
    clear: () => items.clear(),
  }
}
