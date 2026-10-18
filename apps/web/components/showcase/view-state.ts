import { VIEWS } from '../../lib/views'

export const VIEW_PARAM = 'view'
const DEFAULT_VIEW = VIEWS[0].id
const known = (id: string | null): id is string => !!id && VIEWS.some(v => v.id === id)

/** The selected showcase view from a query string, falling back to the first view. */
export function viewFromSearch(search: string | URLSearchParams): string {
 const params = typeof search === 'string' ? new URLSearchParams(search) : search
 const id = params.get(VIEW_PARAM)
 return known(id) ? id : DEFAULT_VIEW
}

/** The query string (with leading `?`, or empty) that selects `id`, keeping other parameters. */
export function searchForView(current: string, id: string): string {
 const params = new URLSearchParams(current)
 if (known(id) && id !== DEFAULT_VIEW) params.set(VIEW_PARAM, id)
 else params.delete(VIEW_PARAM)
 const out = params.toString()
 return out ? '?' + out : ''
}
