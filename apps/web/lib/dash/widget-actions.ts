import { ExpirationTime } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { isHexAddress, type LifetimeDays } from './schema'
import { extendTarget } from './time'
import type { UserWalletClient } from './wallet'

export type DirectResult = { txHash: string; afterBlock: number; expiresAt?: number }
export type WalletErrorKind = 'rejected' | 'not_owner' | 'expired' | 'funds' | 'at_cap' | 'mismatch' | 'invalid_address' | 'self' | 'wallet'
export class WalletActionError extends Error {
 constructor(public kind: WalletErrorKind) { super(kind); this.name = 'WalletActionError' }
}
const hex = (value: string) => value.toLowerCase() as `0x${string}`
export async function extendWidgetDirect(client: UserWalletClient, w: { key: string; expiresAt: number; lifetimeDays: LifetimeDays }): Promise<DirectResult> {
 const head = Number(await client.getBlockNumber())
 const target = extendTarget(w.expiresAt, head, w.lifetimeDays)
 if (w.expiresAt <= head) throw new WalletActionError('expired')
 if (target <= w.expiresAt) throw new WalletActionError('at_cap')
 const { txHash } = await client.extendEntity({ entityKey: hex(w.key), expires: ExpirationTime.atBlock(BigInt(target)) })
 return { txHash, afterBlock: head, expiresAt: target }
}
export async function deleteWidgetDirect(client: UserWalletClient, key: string): Promise<DirectResult> {
 const head = Number(await client.getBlockNumber())
 const { txHash } = await client.deleteEntity({ entityKey: hex(key) })
 return { txHash, afterBlock: head }
}
export function transferAddressError(value: string, self: string): string | null {
 const address = value.trim()
 if (!isHexAddress(address) || /^0x0{40}$/i.test(address)) return 'Enter a 0x address with 40 hex characters.'
 if (address.toLowerCase() === self.toLowerCase()) return 'That is already your address.'
 return null
}
export async function transferWidgetDirect(client: UserWalletClient, key: string, to: string): Promise<DirectResult> {
 const address = to.trim()
 if (!client.account) throw new WalletActionError('wallet')
 const error = transferAddressError(address, client.account.address)
 if (error) throw new WalletActionError(error === 'That is already your address.' ? 'self' : 'invalid_address')
 const head = Number(await client.getBlockNumber())
 const { txHash } = await client.changeOwnership({ entityKey: hex(key), newOwner: hex(address) })
 return { txHash, afterBlock: head }
}
function classify(error: unknown): WalletErrorKind | undefined {
 if (error instanceof WalletActionError) return error.kind
 if (!error || typeof error !== 'object') return
 const e = error as { code?: unknown; name?: unknown; message?: unknown; data?: { errorName?: unknown } }
 const message = typeof e.message === 'string' ? e.message : ''
 const name = e.data?.errorName
 if (e.code === 4001 || e.name === 'UserRejectedRequestError' || /user rejected|user denied|rejected the request/i.test(message)) return 'rejected'
 if (e.name === 'InsufficientFundsError' || /insufficient funds/i.test(message)) return 'funds'
 if (name === 'NotOwner' || /NotOwner|is owned by 0x/i.test(message)) return 'not_owner'
 if (name === 'EntityExpired' || name === 'EntityNotFound' || /EntityExpired|EntityNotFound|expired at block|no entity 0x/i.test(message)) return 'expired'
 if (name === 'ExpiryNotExtended' || /ExpiryNotExtended|would shorten its life/i.test(message)) return 'at_cap'
}
export function walletErrorKind(error: unknown): WalletErrorKind {
 let current = error
 for (let depth = 0; depth <= 6 && current && typeof current === 'object'; depth++) {
  const kind = classify(current)
  if (kind) return kind
  current = (current as { cause?: unknown }).cause
 }
 if (error && typeof error === 'object' && 'walk' in error && typeof error.walk === 'function') {
  try { const found = error.walk((e: unknown) => classify(e) !== undefined); const kind = classify(found); if (kind) return kind } catch { /* Unrecognized provider errors use fixed copy. */ }
 }
 return 'wallet'
}
export function walletErrorMessage(kind: WalletErrorKind): string | null {
 return {
  rejected: null,
  not_owner: "Only the widget's owner can do this. It may have been transferred.",
  expired: 'This widget has expired. Arkiv no longer has it.',
  funds: `Not enough ${tiramisu.nativeCurrency.symbol} to pay the network fee. Fund your wallet and try again.`,
  at_cap: 'Already at the 90 day maximum',
  mismatch: 'Your wallet changed. Log out and log in again.',
  invalid_address: 'Enter a 0x address with 40 hex characters.',
  self: 'That is already your address.',
  wallet: "Your wallet couldn't sign. Try again.",
 }[kind]
}

export function canExtendWidget(w: { owner: string; expiresAt: number; official: boolean }, head: number | undefined, viewer: string | null, wallet: string): boolean {
  return viewer !== null && !w.official && w.owner.toLowerCase() !== wallet.toLowerCase() && (head === undefined || w.expiresAt > head)
}
