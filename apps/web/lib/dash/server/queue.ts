import { dashErrors } from './errors'

export class WriteQueue {
  private running = false
  private readonly jobs: (() => void)[] = []
  constructor(private readonly maxWaiting = 25) {}
  get waiting(): number { return this.jobs.length }
  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.running && this.waiting >= this.maxWaiting) return Promise.reject(dashErrors.busy())
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.running = true
        void (async () => {
          try { resolve(await work()) } catch (error) { reject(error) }
          finally {
            const next = this.jobs.shift()
            if (next) next()
            else this.running = false
          }
        })()
      }
      if (this.running) this.jobs.push(start)
      else start()
    })
  }
}
