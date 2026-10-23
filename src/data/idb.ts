const DB_NAME = 'my-ai-wardrobe'
const DB_VERSION = 1

/**
 * 极简键值存储接口。
 * 真机用 IndexedDB，自动化测试用内存版，逻辑完全一致。
 */
export interface KeyValueStore {
  get<T>(collection: string, key: string): Promise<T | null>
  set<T>(collection: string, key: string, value: T): Promise<void>
  remove(collection: string, key: string): Promise<void>
  list<T>(collection: string): Promise<{ key: string; value: T }[]>
  clear(collection: string): Promise<void>
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('wardrobe')) {
        const store = db.createObjectStore('wardrobe', { keyPath: 'key' })
        store.createIndex('collection', 'collection')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('本地数据库打开失败'))
  })
  return dbPromise
}

type Row = { key: string; collection: string; value: unknown }

export const idbStore: KeyValueStore = {
  async get<T>(collection: string, key: string): Promise<T | null> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('wardrobe', 'readonly')
      const request = tx.objectStore('wardrobe').get(`${collection}:${key}`)
      request.onsuccess = () => {
        const row = request.result as Row | undefined
        resolve(row ? (row.value as T) : null)
      }
      request.onerror = () => reject(request.error ?? new Error('读取失败'))
    })
  },

  async set<T>(collection: string, key: string, value: T): Promise<void> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('wardrobe', 'readwrite')
      tx.objectStore('wardrobe').put({ key: `${collection}:${key}`, collection, value })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('保存失败'))
    })
  },

  async remove(collection: string, key: string): Promise<void> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('wardrobe', 'readwrite')
      tx.objectStore('wardrobe').delete(`${collection}:${key}`)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('删除失败'))
    })
  },

  async list<T>(collection: string): Promise<{ key: string; value: T }[]> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('wardrobe', 'readonly')
      const request = tx.objectStore('wardrobe').index('collection').getAll(collection)
      request.onsuccess = () => {
        const rows = (request.result ?? []) as Row[]
        resolve(rows.map((row) => ({ key: row.key.slice(collection.length + 1), value: row.value as T })))
      }
      request.onerror = () => reject(request.error ?? new Error('读取失败'))
    })
  },

  async clear(collection: string): Promise<void> {
    const rows = await idbStore.list(collection)
    for (const row of rows) await idbStore.remove(collection, row.key)
  }
}
