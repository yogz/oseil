// The padlock of « Chiffré sur ton appareil », chosen by Nicolas on 11 November 2026 (planche C): the
// second pictogram of the site, after the gear of the settings (GearIcon.tsx), drawn the same way:
// a line in the colour of the text around it. It says what is true, encrypted, and never stands for
// a certification. Whoever holds it says it in words beside it; it is hidden from VoiceOver.
export function LockIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
