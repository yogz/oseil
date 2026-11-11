import { Button } from '@/components/ui/Button'

// The two ways a first-launch screen can fail to load, said the same way everywhere.
export function LoadFailed({ retry }: { retry: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p role="alert" className="text-body leading-relaxed text-ink">
        Tes chiffres n’ont pas pu être chargés.
      </p>
      <Button variant="secondary" onClick={retry}>
        Réessayer
      </Button>
    </div>
  )
}

// Something on this device could not be read, or is no longer the latest: nothing is written
// until it is read again, which is offered.
export function Blocked({ message, retry, label = 'Réessayer' }: { message: string; retry: () => void; label?: string }) {
  return (
    <div className="flex flex-col gap-4">
      <p role="alert" className="text-body leading-relaxed text-ink">
        {message}
      </p>
      <Button variant="secondary" onClick={retry}>
        {label}
      </Button>
    </div>
  )
}

export function Alert({ children }: { children: string }) {
  return (
    <p role="alert" className="text-body leading-relaxed text-ink">
      {children}
    </p>
  )
}
