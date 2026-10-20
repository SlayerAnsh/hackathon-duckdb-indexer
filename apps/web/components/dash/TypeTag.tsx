import d from './data.module.css'
import { cx } from './cx'
/** Stable palette slot for a label, so one type keeps its color in every table and feed. */
export function tagIndex(value: string) { let h = 0; for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0; return Math.abs(h) }
export function TypeTag({value,index}:{value:string;index?:number}) {
 const slot = value === 'pending' || value === 'unlabelled' ? 'var(--c-other)' : `var(--c${index === undefined ? tagIndex(value)%7+1 : index%8+1})`
 return <span className={cx('tt', d.tt)} title={value}><i style={{background:slot}}/><span className={d.ttText}>{value}</span></span>
}
