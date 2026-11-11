// Where a step stands among the steps of the first launch, or of the update (planche 6, Nicolas,
// 10 November 2026): one small square per step, in place of « 2 sur 4 ». A step done is filled in
// the soft colour of text; the current one has the colour of text as its edge; those to come, a
// faint edge. The square of the step just done fills as the next step opens (`step-done`, at the
// medium pace). VoiceOver, and the tests, still read « 2 sur 4 ».
export function StepProgress({ index, total }: { index: number; total: number }) {
  return (
    <p className="flex items-center gap-[3px]">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          data-step={i < index ? 'done' : i === index ? 'current' : 'next'}
          className={`size-square-s rounded-square border ${
            i < index ? 'border-ink-soft bg-ink-soft' : i === index ? 'border-ink' : 'border-rule-strong'
          } ${i === index - 1 ? 'animate-step-done motion-reduce:animate-none' : ''}`}
        />
      ))}
      <span className="sr-only">{`${index + 1} sur ${total}`}</span>
    </p>
  )
}
