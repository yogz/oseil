// The magnifier of « Trouver », chosen by Nicolas on 14 November 2026 (planche 9E): the third pictogram
// of the site, after the gear of the settings (GearIcon.tsx) and the padlock of the landing
// (LockIcon.tsx), drawn the same way: a line in the colour of the text around it. Whoever holds it
// names it for VoiceOver.
export function FindIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" className={className}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.3 15.3L20.5 20.5" />
    </svg>
  )
}
