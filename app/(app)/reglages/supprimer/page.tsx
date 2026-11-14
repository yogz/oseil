'use client'

import Link from 'next/link'
import { DeleteAccount } from '@/components/settings/DeleteAccount'
import { SENTENCE } from '@/components/settings/styles'
import { FOCUS } from '@/components/setup/styles'
import { Button } from '@/components/ui/Button'
import { PageColumns } from '@/components/ui/PageColumns'
import { useMenuFromModel } from '@/components/ui/use-menu-from-model'
import { VaultWait } from '@/components/ui/VaultWait'
import { useModel } from '@/lib/app/use-model'
import { BACK_TO_SETTINGS, DELETE_TITLE, LOAD_FAILED, RETRY } from '@/lib/screens/settings-words'

const BACK = `inline-flex min-h-11 items-center self-start text-body text-ink-soft ${FOCUS}`
const TITLE = 'pt-2 text-title font-semibold leading-tight tracking-[-0.01em]'

// Its own screen, reached from « Mon compte » in the Réglages: a touch there can delete nothing.
// The vault must be open, for the file offered before deleting.
export default function DeleteAccountPage() {
  const state = useModel()
  useMenuFromModel(state)
  return (
    <PageColumns
      aside={
        <>
          <Link href="/reglages" className={BACK}>
            {BACK_TO_SETTINGS}
          </Link>
          <h1 className={TITLE}>{DELETE_TITLE}</h1>
        </>
      }
    >
      {state.status === 'loading' ? <VaultWait phase="open" /> : null}
      {state.status === 'ready' ? (
        <div className="mt-4">
          <DeleteAccount client={state.client} model={state.model} />
        </div>
      ) : null}
      {state.status === 'failed' || state.status === 'unavailable' ? (
        <div className="mt-4 flex flex-col gap-4">
          <p role="alert" className={SENTENCE}>
            {LOAD_FAILED}
          </p>
          <Button variant="secondary" onClick={state.retry}>
            {RETRY}
          </Button>
        </div>
      ) : null}
    </PageColumns>
  )
}
