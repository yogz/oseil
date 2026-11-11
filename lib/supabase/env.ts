// The two values every Supabase client of the app is built from. Both are
// public by design: the publishable key only opens what row-level security
// lets the signed-in person see.
//
// They are read by their full literal names, which is what lets Next.js write
// them into the code sent to the browser.

export function supabaseEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishableKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must both be set')
  }
  return { url, publishableKey }
}
