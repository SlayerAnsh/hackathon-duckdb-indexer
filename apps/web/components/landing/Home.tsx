'use client'
import { useIndex } from '../../lib/use-index'
import { Hero } from '../dash/Hero'
import { ActivityFeed } from '../dash/ActivityFeed'
import { OfficialDashboards } from './OfficialDashboards'
import s from '../../app/page.module.css'

// The live parts of the home page (hero figures, featured dashboards, activity). `children` (how it works and
// what you can build) and `closing` are static, rendered on the server and passed through.
export function Home({ children, closing }: { children: React.ReactNode; closing?: React.ReactNode }) {
 const { state, version } = useIndex()
 return <main id="main" className={`wrap ${s.main}`}>
  <Hero version={version} manifest={state.manifest}/>
  <OfficialDashboards/>
  {children}
  <div className={s.feed}><ActivityFeed version={version} head={state.liveHead} limit={6} description="Creates, updates and deletions as they reach this tab from the chain."/></div>
  {closing}
 </main>
}
