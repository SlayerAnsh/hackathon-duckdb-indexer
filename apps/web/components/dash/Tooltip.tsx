import type { ReactNode } from 'react'
export function Tooltip({text,children}:{text:string;children:ReactNode}) { return <span className="tip-trigger" title={text}>{children}</span> }
