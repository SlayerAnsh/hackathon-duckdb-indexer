import { Home } from '../components/landing/Home'
import { Closing, Story } from '../components/landing/Story'

export default function Page() {
 return <Home closing={<Closing/>}><Story/></Home>
}
