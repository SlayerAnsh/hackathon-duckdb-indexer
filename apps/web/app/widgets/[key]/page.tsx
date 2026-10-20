import { WidgetPage } from '../../../components/widgets/WidgetPage'

export default async function SavedWidgetPage({ params }: { params: Promise<{ key: string }> }) {
 const { key } = await params
 return <main id="main" className="wrap"><WidgetPage widgetKey={key}/></main>
}
