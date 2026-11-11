import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PRIVATE_METADATA } from '@/lib/app/site-metadata'
import { AppFrame } from '@/components/ui/AppFrame'
import { createServerSupabase } from '@/lib/supabase/server'

// The screens of the application proper. `proxy.ts` already turns away a
// visitor without a session; this checks again where the screens are built,
// so that a change to the proxy's matcher cannot open them by accident.
export const metadata: Metadata = PRIVATE_METADATA

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) redirect('/connexion')

  return <AppFrame>{children}</AppFrame>
}
