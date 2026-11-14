// The gear of the settings, chosen by Nicolas on 9 November 2026: one of the three pictograms of the
// site, with the padlock of the landing (LockIcon.tsx) and the magnifier of « Trouver » (FindIcon.tsx).
// Drawn here (eight teeth around a hole), in the colour of the text around it; whoever holds it
// names it for VoiceOver.
export function GearIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" className={className}>
      <path d="M10.5 2.52L13.5 2.52L13.86 5.05L15.6 5.76L17.64 4.23L19.77 6.36L18.24 8.4L18.95 10.14L21.48 10.5L21.48 13.5L18.95 13.86L18.24 15.6L19.77 17.64L17.64 19.77L15.6 18.24L13.86 18.95L13.5 21.48L10.5 21.48L10.14 18.95L8.4 18.24L6.36 19.77L4.23 17.64L5.76 15.6L5.05 13.86L2.52 13.5L2.52 10.5L5.05 10.14L5.76 8.4L4.23 6.36L6.36 4.23L8.4 5.76L10.14 5.05Z" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  )
}
