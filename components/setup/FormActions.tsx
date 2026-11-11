import { Button } from '@/components/ui/Button'

// The buttons under every form: the main one, then « Annuler », then « Supprimer » when a line is reopened.
export function FormActions({
  submitLabel,
  busy,
  saveError,
  onCancel,
  onDelete,
}: {
  submitLabel: string
  busy: boolean
  saveError: string | null
  onCancel: () => void
  onDelete?: () => void
}) {
  return (
    <div className="mt-2 flex flex-col gap-3">
      <Button type="submit" disabled={busy}>
        {submitLabel}
      </Button>
      <Button variant="secondary" disabled={busy} onClick={onCancel}>
        Annuler
      </Button>
      {onDelete ? (
        <Button variant="secondary" disabled={busy} onClick={onDelete}>
          Supprimer
        </Button>
      ) : null}
      {saveError ? (
        <p role="alert" className="text-body leading-relaxed text-ink">
          {saveError}
        </p>
      ) : null}
    </div>
  )
}
