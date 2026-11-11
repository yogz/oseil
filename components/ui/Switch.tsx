import { FOCUS } from '@/components/setup/styles'

// An on/off switch, named by the label it points to (`labelledBy`). The whole 44 px row of the switch
// takes the touch; the drawn pill is decoration.
export function Switch({
  checked,
  labelledBy,
  disabled,
  onToggle,
}: {
  checked: boolean
  labelledBy: string
  disabled?: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={onToggle}
      className={`relative inline-flex min-h-11 w-14 shrink-0 items-center disabled:opacity-40 ${FOCUS}`}
    >
      <span
        aria-hidden="true"
        className={`relative block h-7 w-12 rounded-full transition-colors ${checked ? 'bg-ink' : 'bg-field'}`}
      >
        <span
          className={`absolute top-1 size-5 rounded-full transition-[left] ${checked ? 'left-6 bg-ground' : 'left-1 bg-ink-soft'}`}
        />
      </span>
    </button>
  )
}
