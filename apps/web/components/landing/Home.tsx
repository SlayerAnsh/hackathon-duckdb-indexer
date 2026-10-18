'use client'
import { useIndex } from '../../lib/use-index'
import { TopBar } from '../dash/TopBar'
import { Hero } from '../dash/Hero'
import { ActivityFeed } from '../dash/ActivityFeed'
import { Footer } from '../dash/Footer'
import { PreviewCards } from './PreviewCards'
import s from '../../app/page.module.css'

// The live part of the home page. `children` is the static story, rendered on the server and passed through.
export function Home({ children }: { children: React.ReactNode }) {
 const { state, version } = useIndex()
 return <><TopBar state={state}/><main className={`wrap ${s.main}`}>
  <Hero version={version} manifest={state.manifest}/>
  <PreviewCards/>
  <div className={s.feed}><ActivityFeed version={version} head={state.liveHead} limit={6} description="The most recent creates, updates and deletions seen by this tab."/></div>
  {children}
 </main><Footer/></>
}
