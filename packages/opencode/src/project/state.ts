import { Log } from "@/util/log"

export namespace State {
  interface Entry {
    state: any
    dispose?: (state: any) => Promise<void>
    label: string
  }

  const log = Log.create({ service: "state" })
  const recordsByKey = new Map<string, Map<any, Entry>>()

  export function create<S>(root: () => string, init: () => S, dispose?: (state: Awaited<S>) => Promise<void>) {
    const key = function stateGetter() {
      const key = root()
      let entries = recordsByKey.get(key)
      if (!entries) {
        entries = new Map<string, Entry>()
        recordsByKey.set(key, entries)
      }
      const exists = entries.get(stateGetter)
      if (exists) return exists.state as S
      const state = init()
      entries.set(stateGetter, {
        state,
        dispose,
        label: init.name,
      })
      return state
    }
    return key
  }

  async function disposeEntries(key: string, entries: Map<any, Entry>, targets?: Iterable<any>) {
    log.info("waiting for state disposal to complete", { key })

    let disposalFinished = false

    setTimeout(() => {
      if (!disposalFinished) {
        log.warn(
          "state disposal is taking an unusually long time - if it does not complete in a reasonable time, please report this as a bug",
          { key },
        )
      }
    }, 10000).unref()

    const tasks: Promise<void>[] = []
    for (const target of targets ?? entries.keys()) {
      const entry = entries.get(target)
      if (!entry) continue

      if (entry.dispose) {
        const task = Promise.resolve(entry.state)
          .then((state) => entry.dispose!(state))
          .catch((error) => {
            log.error("Error while disposing state:", { error, key, init: entry.label || String(target) })
          })

        tasks.push(task)
      }

      entries.delete(target)
    }

    await Promise.all(tasks)

    if (entries.size === 0) {
      entries.clear()
      recordsByKey.delete(key)
    }

    disposalFinished = true
    log.info("state disposal completed", { key })
  }

  export async function invalidate(key: string, init: any) {
    const entries = recordsByKey.get(key)
    if (!entries?.has(init)) return
    await disposeEntries(key, entries, [init])
  }

  export async function dispose(key: string) {
    const entries = recordsByKey.get(key)
    if (!entries) return
    await disposeEntries(key, entries)
  }
}
