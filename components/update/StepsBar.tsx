import type { StepStatus } from '@/lib/model/types'

const TONE = { done: 'bg-ink', current: 'bg-ink-soft', skipped: 'bg-ink-muted', todo: 'bg-rule-strong' } as const

// One piece per establishment: dark when done, grey when left for this time, pale when still to do.
export function StepsBar({ statuses }: { statuses: Array<'todo' | 'current' | StepStatus> }) {
  return (
    <div aria-hidden="true" className="flex gap-1">
      {statuses.map((status, i) => (
        <span key={i} className={`h-1 flex-1 rounded-square ${TONE[status]}`} />
      ))}
    </div>
  )
}
