import type { ReactNode } from 'react'
import { ExampleBanner } from '@/components/example/ExampleBanner'
import { ScreenTransition } from '@/components/ui/ScreenTransition'

// The frame of the example: its banner at the top of every screen, then the same width as the
// site's screens (components/ui/AppFrame.tsx), two columns on a computer. Outside the (app) group,
// whose layout sends anyone without a session to /connexion: the example is open to anyone, and
// reads no session. No tab bar nor menu of the site: the example moves by its own pages and the
// banner (spec of the landing, « L’exemple »).

export default function ExampleLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ExampleBanner />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-3 pb-10 lg:max-w-5xl lg:pt-8">
        <ScreenTransition>{children}</ScreenTransition>
      </main>
    </>
  )
}
