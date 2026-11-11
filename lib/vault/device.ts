// Where the data key lives between page loads: on the device, under the id of
// the person it belongs to. In the browser that is IndexedDB, which stores a
// CryptoKey as is — a non-extractable key can be used from there but never
// read out, not even by the page that put it there.

export interface KeyStore {
  get(userId: string): Promise<CryptoKey | null>
  set(userId: string, key: CryptoKey): Promise<void>
  delete(userId: string): Promise<void>
  /** Forgets every key on this device — what signing out does, whoever was signed in. */
  clear(): Promise<void>
}

const DATABASE = 'stefin-vault'
const STORE = 'keys'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Resolves once the transaction has completed, so a written or deleted key is
// on disk by the time the caller moves on. A failed request rejects with its
// own error: at that moment the transaction's error is still null, it is only
// set once the transaction aborts.
async function inStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode)
      const request = action(transaction.objectStore(STORE))
      request.onerror = () => reject(request.error)
      transaction.oncomplete = () => resolve(request.result)
      transaction.onabort = () =>
        reject(transaction.error ?? request.error ?? new Error('The key store transaction was aborted'))
    })
  } finally {
    database.close()
  }
}

export function indexedDbKeyStore(): KeyStore {
  return {
    async get(userId) {
      const key = await inStore<unknown>('readonly', (store) => store.get(userId))
      return key instanceof CryptoKey ? key : null
    },
    async set(userId, key) {
      await inStore('readwrite', (store) => store.put(key, userId))
    },
    async delete(userId) {
      await inStore('readwrite', (store) => store.delete(userId))
    },
    async clear() {
      await inStore('readwrite', (store) => store.clear())
    },
  }
}

export function memoryKeyStore(): KeyStore {
  const keys = new Map<string, CryptoKey>()
  return {
    get: async (userId) => keys.get(userId) ?? null,
    set: async (userId, key) => {
      keys.set(userId, key)
    },
    delete: async (userId) => {
      keys.delete(userId)
    },
    clear: async () => {
      keys.clear()
    },
  }
}
