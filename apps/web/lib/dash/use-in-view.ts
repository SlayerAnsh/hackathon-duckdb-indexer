'use client'
import { useCallback, useEffect, useRef, useState, type RefCallback } from 'react'

export function useInView<T extends Element>(): [RefCallback<T>, boolean] {
 const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined')
 const observer = useRef<IntersectionObserver | null>(null)
 const ref = useCallback<RefCallback<T>>(node => {
  observer.current?.disconnect()
  if (!node || seen) return
  if (typeof IntersectionObserver === 'undefined') { setSeen(true); return }
  observer.current = new IntersectionObserver(entries => {
   if (entries.some(entry => entry.isIntersecting)) { setSeen(true); observer.current?.disconnect() }
  }, { rootMargin: '200px' })
  observer.current.observe(node)
 }, [seen])
 useEffect(() => () => observer.current?.disconnect(), [])
 return [ref, seen]
}
