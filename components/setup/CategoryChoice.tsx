import { CATEGORIES, CATEGORY_ORDER } from '@/lib/catalog'
import type { CategoryId } from '@/lib/model/types'
import { CHIP } from './styles'

// The five categories as chips; touching one chooses it.
export function CategoryChoice({
  value,
  onChoose,
  error,
  labelledBy,
}: {
  value: CategoryId | undefined
  onChoose: (category: CategoryId) => void
  error?: string
  labelledBy: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <ul role="group" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
        {CATEGORY_ORDER.map((id) => (
          <li key={id}>
            <button type="button" aria-pressed={value === id} className={CHIP} onClick={() => onChoose(id)}>
              {CATEGORIES[id].label}
            </button>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="text-body font-medium leading-normal text-ink">
          {error}
        </p>
      ) : null}
    </div>
  )
}
