import type { ReactNode } from 'react'

// B6: one page template on a computer. Every screen is drawn in the same two columns as Mon argent:
// the reading column always on the right, where Mon argent lists its categories and a category its
// lines, and on the left the grid or, for a screen without one, its title, which stays in sight.
// On a phone it is one column, the aside first, as before.
export function PageColumns({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  return (
    <div data-columns="" className="flex flex-col lg:mt-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-14">
      <div className="flex min-w-0 flex-col lg:sticky lg:top-24">{aside}</div>
      {/* The first section starts level with the aside: no rule nor margin above it. */}
      <div className="flex min-w-0 flex-col lg:[&>*:first-child]:mt-0 lg:[&_section:first-of-type]:mt-0 lg:[&_section:first-of-type]:border-t-0 lg:[&_section:first-of-type]:pt-0">
        {children}
      </div>
    </div>
  )
}
