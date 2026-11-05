import { addr, bytes, defineSchema, key, str } from '@arkiv-network/sdk/schema'

// Rabdi entities have no payload: each JSON document lives in a `payload` bytes attribute instead.
// The schemas are untagged (no arkiv.schema attribute), so the attribute names stay the ones the index,
// the SQL views and the trust checks already read. Only the attributes RPC filters use are indexed.
const common = { type: str().indexed(), project: str().indexed(), user: addr().indexed() }
export const WidgetSchema = defineSchema({ ...common, login: str(), name: str(), chart: str(), payload: bytes() })
export const DashboardSchema = defineSchema({ ...common, login: str(), title: str(), slug: str().optional(), cover: key().optional(), payload: bytes() })
export const LinkSchema = defineSchema({ ...common, dashboard: key().indexed(), widget: key().indexed(), payload: bytes() })
export { addr, key }
