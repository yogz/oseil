import { ACCOUNT_TYPES, CRYPTO_PLATFORMS, FAMILY_LABELS, OUTSIDE_BANKS } from '@/lib/catalog'
import type { AccountTypeId, Establishment } from '@/lib/model/types'
import { FOCUS } from './styles'

const HOME_TYPES: AccountTypeId[] = ['home', 'gold', 'crypto']
// The same, in the first launch: ids of OUTSIDE_BANKS, in the order of its list.
const HOME_IDS = ['my-home', 'other-home', 'gold', 'crypto'] as const
const FAMILIES = ['everyday', 'investments', 'retirement', 'holdings'] as const
const HOLDINGS_ORDER: AccountTypeId[] = ['loan', 'gold', 'crypto']

// The words of « Mon logement » and « Un autre logement », as ticked on the screen before.
export const outsideLabel = (id: string) => OUTSIDE_BANKS.find((b) => b.id === id)!.label

// Under the two homes of the first launch: what each one covers (a flat is a home too).
const HOME_EXPLANATIONS: Record<string, string> = {
  'my-home': 'Maison ou appartement, là où tu vis',
  'other-home': 'Résidence secondaire ou bien mis en location',
}

function Option({
  type,
  onPick,
  label = ACCOUNT_TYPES[type].label,
  explanation = ACCOUNT_TYPES[type].explanation,
}: {
  type: AccountTypeId
  onPick: () => void
  label?: string
  explanation?: string
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className={`flex min-h-11 w-full flex-col items-start justify-center border-b border-hairline py-3 text-left ${FOCUS}`}
      >
        <span className="text-body font-medium text-ink">{label}</span>
        {explanation ? <span className="text-caption leading-normal text-ink-muted">{explanation}</span> : null}
      </button>
    </li>
  )
}

// The kinds of account a step can add: families for a bank, the planned items first for « Chez toi »,
// the one kind there is for employee savings. `splitHome` (the first launch): « Mon logement » and
// « Un autre logement » in place of « Logement »; the first is picked as « Logement » always was,
// the second with `otherHome`, so that its form asks for its type.
export function TypePicker({
  establishment,
  planned,
  splitHome = false,
  onPick,
}: {
  establishment: Establishment
  planned: string[]
  splitHome?: boolean
  onPick: (type: AccountTypeId, otherHome?: true) => void
}) {
  if (establishment.catalogId === 'employee-savings') {
    return (
      <ul className="mt-4 flex flex-col">
        <Option type="employee-savings" onPick={() => onPick('employee-savings')} />
      </ul>
    )
  }

  if (establishment.kind === 'home' && splitHome) {
    // The same order as the list of choices: the ticked ones first, then the rest.
    const ticked = HOME_IDS.filter((id) => planned.includes(id))
    const ids = [...new Set([...ticked, ...HOME_IDS])]
    return (
      <ul className="mt-4 flex flex-col">
        {ids.map((id) =>
          id === 'gold' || id === 'crypto' ? (
            <Option key={id} type={id} onPick={() => onPick(id)} />
          ) : (
            <Option
              key={id}
              type="home"
              label={outsideLabel(id)}
              explanation={HOME_EXPLANATIONS[id]}
              onPick={() => (id === 'other-home' ? onPick('home', true) : onPick('home'))}
            />
          ),
        )}
      </ul>
    )
  }

  if (establishment.kind === 'home') {
    // The ticked items in the order of the list they were ticked in, whatever the order of the touches.
    const first = OUTSIDE_BANKS.filter((b) => planned.includes(b.id))
      .map((b) => b.accountType)
      .filter((type) => HOME_TYPES.includes(type))
    const types = [...new Set([...first, ...HOME_TYPES])]
    return (
      <ul className="mt-4 flex flex-col">
        {types.map((type) => (
          <Option key={type} type={type} onPick={() => onPick(type)} />
        ))}
      </ul>
    )
  }

  // On a crypto platform, crypto is what the person came for: its family and its type come first.
  const onCryptoPlatform = establishment.catalogId !== undefined && CRYPTO_PLATFORMS.includes(establishment.catalogId)
  const families = onCryptoPlatform ? ['holdings', ...FAMILIES.filter((f) => f !== 'holdings')] as const : FAMILIES
  return (
    <div className="mt-4 flex flex-col gap-6">
      {families.map((family) => {
        const types =
          family === 'holdings'
            ? onCryptoPlatform ? [...HOLDINGS_ORDER].reverse() : HOLDINGS_ORDER
            : (Object.keys(ACCOUNT_TYPES) as AccountTypeId[]).filter((type) => ACCOUNT_TYPES[type].family === family)
        return (
          <section key={family}>
            <h2 className="text-body font-medium text-ink-muted">{FAMILY_LABELS[family]}</h2>
            <ul className="mt-1 flex flex-col">
              {types.map((type) => (
                <Option key={type} type={type} onPick={() => onPick(type)} />
              ))}
            </ul>
          </section>
        )
      })}
      <ul className="flex flex-col">
        <li>
          <button
            type="button"
            onClick={() => onPick('other')}
            className={`flex min-h-11 w-full items-center py-3 text-left text-body text-ink-soft ${FOCUS}`}
          >
            {ACCOUNT_TYPES.other.explanation}
          </button>
        </li>
      </ul>
    </div>
  )
}
