// The copy writes a no-break space before « ? ! : ; » (and Intl writes its own around figures),
// while Testing Library and jest-dom read a screen's text with every kind of space collapsed
// into a plain one. A test that looks a sentence up by its text asks for it through `plain`.
export function plain(text: string): string {
  return text.replace(/[  ]/g, ' ')
}
