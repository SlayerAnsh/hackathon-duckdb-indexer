import type { ReactNode } from 'react'
/** Native title tooltip around an inline element. Kept tiny on purpose: the text is a short explanation. */
export function Tooltip({text,children}:{text:string;children:ReactNode}) { return <span className="tip-trigger" title={text}>{children}</span> }
