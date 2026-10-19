import { WidgetPage } from '../../../components/widgets/WidgetPage'
import { TopBar } from '../../../components/dash/TopBar'
import { Footer } from '../../../components/dash/Footer'

export default async function SavedWidgetPage({ params }: { params: Promise<{ key: string }> }) {
 const { key } = await params
 return <><TopBar/><main id="main" className="wrap"><WidgetPage widgetKey={key}/></main><Footer/></>
}
