import type { KeyValueStore } from './idb'

/**
 * 内存版键值存储，只用于自动化测试。
 * 行为和 IndexedDB 版本一致，但换个“浏览器”就相当于重新打开一次应用，
 * 可以用来验证「关掉软件再打开，编号还能继续」这类场景。
 */
export function createMemoryStore(): KeyValueStore {
  const rows = new Map<string, { collection: string; value: unknown }>()

  return {
    async get<T>(collection: string, key: string): Promise<T | null> {
      const row = rows.get(`${collection}:${key}`)
      return row ? (row.value as T) : null
    },
    async set<T>(collection: string, key: string, value: T): Promise<void> {
      rows.set(`${collection}:${key}`, { collection, value })
    },
    async remove(collection: string, key: string): Promise<void> {
      rows.delete(`${collection}:${key}`)
    },
    async list<T>(collection: string): Promise<{ key: string; value: T }[]> {
      const prefix = `${collection}:`
      return [...rows.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, row]) => ({ key: key.slice(prefix.length), value: row.value as T }))
    },
    async clear(collection: string): Promise<void> {
      const prefix = `${collection}:`
      for (const key of [...rows.keys()]) {
        if (key.startsWith(prefix)) rows.delete(key)
      }
    }
  }
}
