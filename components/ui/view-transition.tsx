import * as React from 'react'
import type { ComponentProps, ReactNode } from 'react'

type Props = ComponentProps<typeof React.ViewTransition>

// Next runs React's canary build, which has <ViewTransition>; the plain React the tests run with does
// not. Without it nothing animates and the screen simply changes, as in a browser without View
// Transitions.
function NoTransition({ children }: Props): ReactNode {
  return children
}

export const ViewTransition: (props: Props) => ReactNode =
  (React as { ViewTransition?: (props: Props) => ReactNode }).ViewTransition ?? NoTransition
