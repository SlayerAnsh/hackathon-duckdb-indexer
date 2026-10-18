'use client'
import { useIndex } from '../lib/use-index'
import { TopBar } from '../components/dash/TopBar'
import { Hero } from '../components/dash/Hero'
import { ActivityFeed } from '../components/dash/ActivityFeed'
import { Footer } from '../components/dash/Footer'
import { PreviewCards } from '../components/landing/PreviewCards'
import { About } from '../components/landing/About'
import s from './page.module.css'

export default function Page() {
 const { state, version } = useIndex()
 return <><TopBar state={state}/><main className={`wrap ${s.main}`}>
  <Hero version={version} manifest={state.manifest}/>
  <PreviewCards/>
  <div className={s.feed}><ActivityFeed version={version} head={state.liveHead} limit={6} description="The most recent creates, updates and deletions seen by this tab."/></div>
  <About/>
 </main><Footer/></>
}
