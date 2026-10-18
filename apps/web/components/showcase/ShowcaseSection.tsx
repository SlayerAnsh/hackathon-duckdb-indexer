'use client'
import { usePathname, useSearchParams } from 'next/navigation'
import { ShowcaseGallery } from '../dash/ShowcaseGallery'
import { viewFromSearch, searchForView } from './view-state'

/** Gallery whose selected view lives in `?view=`, so a tab can be shared as a link. */
export function ShowcaseSection({ version }: { version: number }) {
 const params = useSearchParams()
 const pathname = usePathname()
 const selected = viewFromSearch(params)
 function select(id: string) {
  if (id === selected) return
  window.history.replaceState(null, '', pathname + searchForView(window.location.search, id))
 }
 return <ShowcaseGallery version={version} selected={selected} onSelect={select}/>
}
