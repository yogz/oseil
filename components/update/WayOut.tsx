import Link from 'next/link'
import { BACK } from '@/components/setup/styles'

// « Fermer » is on every screen of the update (decision 5), waiting and errors included, and always on
// the right of the top line: the way back, when there is one, is on its left.
export function WayOut({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end text-body text-ink-soft">
        <Link href="/" className={BACK}>
          Fermer
        </Link>
      </div>
      {children}
    </div>
  )
}
