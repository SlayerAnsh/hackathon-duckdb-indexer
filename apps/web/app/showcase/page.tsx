'use client'
import { Suspense } from 'react'
import { useIndex } from '../../lib/use-index'
import { VIEWS } from '../../lib/views'
import { TopBar } from '../../components/dash/TopBar'
import { Footer } from '../../components/dash/Footer'
import { ShowcaseSection } from '../../components/showcase/ShowcaseSection'
import s from '../../components/showcase/showcase.module.css'

const QUERY_COUNT = VIEWS.reduce((n, v) => n + v.widgets.length, 0)

export default function ShowcasePage() {
 const { state, version } = useIndex()
 return <>
  <TopBar state={state}/>
  <main className={`wrap ${s.page}`}>
   <header className={s.intro}>
    <div>
     <h1>Showcase</h1>
     <p>Real SQL over the live Arkiv index, run by DuckDB in this tab. Every card shows its timing and the clause that arkiv_query cannot express.</p>
    </div>
    <dl className={s.counts}>
     <div><dt>views</dt><dd>{VIEWS.length}</dd></div>
     <div><dt>queries</dt><dd>{QUERY_COUNT}</dd></div>
    </dl>
   </header>
   <Suspense fallback={<div className={s.fallback}/>}>
    <ShowcaseSection version={version}/>
   </Suspense>
  </main>
  <Footer/>
 </>
}
