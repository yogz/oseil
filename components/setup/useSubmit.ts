'use client'

import { useState } from 'react'

// A button that saves then leaves the view stays disabled after a success, so a
// second tap cannot apply the same change again; after a failure it comes back.
export function useSubmit() {
  const [busy, setBusy] = useState(false)
  async function run(action: () => Promise<boolean>) {
    setBusy(true)
    const ok = await action()
    if (!ok) setBusy(false)
  }
  return { busy, run }
}
