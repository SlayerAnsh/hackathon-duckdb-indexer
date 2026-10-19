export function showLoading(q: { loading: boolean; data: unknown }): boolean {
 return q.loading && q.data == null
}
