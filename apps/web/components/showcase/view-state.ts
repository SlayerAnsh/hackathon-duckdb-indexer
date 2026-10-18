import { VIEWS, rangeOf, type Widget } from '../../lib/views'

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

/** The selected time range of a ranged widget, stored under its id (for example `?creations=5h`). */
export function rangeFromSearch(search: string | URLSearchParams, widget: Widget): string | undefined {
 const params = typeof search === 'string' ? new URLSearchParams(search) : search
 return rangeOf(widget, params.get(widget.id))?.id
}

/** The query string that selects `range` for `widget`, dropping the parameter for its default range. */
export function searchForRange(current: string, widget: Widget, range: string): string {
 const params = new URLSearchParams(current)
 const id = rangeOf(widget, range)?.id
 if (id && id !== widget.timeRange?.defaultRange) params.set(widget.id, id)
 else params.delete(widget.id)
 const out = params.toString()
 return out ? '?' + out : ''
}
