import { Suspense } from 'react'
import { ExplorePage } from '../../components/explore/ExplorePage'
import s from '../../components/explore/explore.module.css'
export default function Page() { return <Suspense fallback={<main id="main" className="wrap"><p className={s.fallback} role="status">Loading the index into your browser…</p></main>}><ExplorePage/></Suspense> }
