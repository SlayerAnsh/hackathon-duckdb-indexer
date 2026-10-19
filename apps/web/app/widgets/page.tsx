'use client'
import { useReducer } from 'react'
import { TopBar } from '../../components/dash/TopBar'
import { Footer } from '../../components/dash/Footer'
import { ExplorerGrid } from '../../components/widgets/ExplorerGrid'
import { explorerReducer, initExplorer } from '../../lib/dash/explorer-state'

export default function WidgetsPage() {
 const [state, dispatch] = useReducer(explorerReducer, undefined, initExplorer)
 return <><TopBar/><main className="wrap"><ExplorerGrid state={state} dispatch={dispatch}/></main><Footer/></>
}
