import { addressUrl } from '../../lib/explorer'
import { shortHex } from '../../lib/format'
import d from './data.module.css'
import { cx } from './cx'

const ExternalIcon = () => <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h4v4M13 3 7.5 8.5M11.5 9.5v3h-8v-8h3"/></svg>

/** An account address as a short link to its block explorer page; plain short text when the value is not an address. */
export function AddressLink({ address }: { address: string }) {
 const href = addressUrl(address)
 if (!href) return <span title={address}>{shortHex(address)}</span>
 return <a className={cx('addr-link', d.addr)} href={href} title={address} target="_blank" rel="noreferrer">{shortHex(address)}<ExternalIcon/></a>
}
