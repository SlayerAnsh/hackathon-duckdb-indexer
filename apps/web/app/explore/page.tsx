import { Suspense } from 'react'
import { ExplorePage } from '../../components/explore/ExplorePage'
export default function Page() { return <Suspense fallback={<p>Loading the index into your browser…</p>}><ExplorePage/></Suspense> }
