import { screen } from '@testing-library/react'
import { GROUP_ORDINALS } from '@/lib/auth/recovery-check'

type User = {
  click: (element: Element) => Promise<void>
  type: (element: Element, text: string) => Promise<void>
}

// Goes through the recovery key screen as a person who put the key away:
// « Je l’ai rangée », then the asked group (drawn at random) typed back.
export async function confirmRecoveryKey(user: User, display: string) {
  await user.click(await screen.findByRole('button', { name: 'Je l’ai rangée' }))
  const field = await screen.findByRole('textbox', { name: /morceau$/ })
  const label = (field as HTMLInputElement).labels?.[0]?.textContent?.toLowerCase() ?? ''
  const index = GROUP_ORDINALS.findIndex((ordinal) => label.startsWith(ordinal))
  await user.type(field, display.split('-')[index])
  await user.click(screen.getByRole('button', { name: 'C’est fait' }))
}
