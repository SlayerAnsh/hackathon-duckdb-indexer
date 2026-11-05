import { expect, test } from 'bun:test'
import { ExpirationTime } from '@arkiv-network/sdk'
import { balanceLevel, formatGlm, readBalance, routeRpc, splitTransport, arkivChain, type UserWalletClient } from '../lib/dash/wallet'
import { deleteWidgetDirect, extendWidgetDirect, transferWidgetDirect, transferAddressError, WalletActionError, walletErrorKind, walletErrorMessage } from '../lib/dash/widget-actions'
import { extendTarget } from '../lib/dash/time'
import { K, U, OTHER } from './dash-fakes'
const url = 'https://r.example'
function fake() {
 const calls: unknown[] = []
 const send = async (args: unknown) => { calls.push(args); return { txHash: '0xt', entityKey: K } }
 const client = { account: { address: U }, getBlockNumber: async () => BigInt(1000), extendEntity: send, deleteEntity: send, changeOwnership: send } as unknown as UserWalletClient
 return { client, calls }
}
test('Rabdi uses the configured RPC and routes signing to the wallet', async () => {
 const chain = arkivChain(url)
 expect(chain.id).toBe(7794095); expect(chain.rpcUrls.default.http).toEqual([url]); expect(chain.nativeCurrency.symbol).toBe('GLM')
 for (const method of ['eth_sendTransaction', 'eth_signTransaction', 'eth_accounts', 'eth_requestAccounts', 'eth_chainId', 'wallet_switchEthereumChain', 'wallet_addEthereumChain', 'personal_sign', 'eth_sign', 'eth_signTypedData_v4']) expect(routeRpc(method)).toBe('wallet')
 for (const method of ['eth_blockNumber', 'eth_getTransactionReceipt', 'eth_call', 'eth_getBalance']) expect(routeRpc(method)).toBe('rpc')
 const calls: unknown[] = []
 const transport = splitTransport({ request: async args => { calls.push(['wallet', args]); return 'wallet' } }, { request: async args => { calls.push(['rpc', args]); return 'rpc' } })({ chain })
 await transport.request({ method: 'eth_blockNumber' })
 const args = { method: 'eth_sendTransaction', params: [{ to: U }] }
 await transport.request(args)
 expect(calls).toEqual([['rpc', { method: 'eth_blockNumber' }], ['wallet', args]])
})
test('direct extension reads the head, caps expiry and never sends expired or capped writes', async () => {
 const { client, calls } = fake()
 expect(await extendWidgetDirect(client, { key: K, expiresAt: 44200, lifetimeDays: 7 })).toEqual({ txHash: '0xt', afterBlock: 1000, expiresAt: 1000 + 8 * 43200 })
 expect(calls).toEqual([{ entityKey: K, expires: ExpirationTime.atBlock(BigInt(1000 + 8 * 43200)) }])
 for (const [expiresAt, kind] of [[1000 + 90 * 43200, 'at_cap'], [900, 'expired']] as const) {
  const f = fake()
  await expect(extendWidgetDirect(f.client, { key: K, expiresAt, lifetimeDays: 7 })).rejects.toMatchObject({ kind })
  expect(f.calls).toEqual([])
 }
})
test('delete and transfer use the head before sending and validate the recipient', async () => {
 const f = fake()
 expect(await deleteWidgetDirect(f.client, K)).toEqual({ txHash: '0xt', afterBlock: 1000 })
 expect(await transferWidgetDirect(f.client, K, OTHER)).toEqual({ txHash: '0xt', afterBlock: 1000 })
 expect(f.calls).toEqual([{ entityKey: K }, { entityKey: K, newOwner: OTHER.toLowerCase() }])
 for (const [to, kind] of [['0x123', 'invalid_address'], ['0x' + '0'.repeat(40), 'invalid_address'], [U.toUpperCase().replace('0X', '0x'), 'self']] as const) {
  const g = fake(); await expect(transferWidgetDirect(g.client, K, to)).rejects.toMatchObject({ kind }); expect(g.calls).toEqual([])
 }
 expect(transferAddressError(' ' + OTHER + ' ', U)).toBeNull()
})
test('wallet errors recognize nested reverts and return only fixed copy', () => {
 for (const [error, kind] of [
  [{ code: 4001 }, 'rejected'], [new Error('outer', { cause: { name: 'UserRejectedRequestError' } }), 'rejected'],
  [new Error('Transaction failed: entity 0x1111 is owned by 0xaaa, not 0xbbb'), 'not_owner'],
  [{ cause: { cause: { cause: { data: { errorName: 'EntityExpired' } } } } }, 'expired'],
  [new Error('Transaction failed: insufficient funds for gas * price + value'), 'funds'],
  [{ data: { errorName: 'EntityNotFound' } }, 'expired'], [new Error('would shorten its life'), 'at_cap'],
  [new Error('boom'), 'wallet'], [new WalletActionError('mismatch'), 'mismatch'],
  [{ walk: (fn: (e: unknown) => boolean) => { const e = { data: { errorName: 'NotOwner' } }; return fn(e) ? e : undefined } }, 'not_owner'],
 ] as const) expect(walletErrorKind(error)).toBe(kind)
 const messages = { rejected: null, not_owner: "Only the widget's owner can do this. It may have been transferred.", expired: 'This widget has expired. Arkiv no longer has it.', funds: 'Not enough GLM to pay the network fee. Fund your wallet and try again.', at_cap: 'Already at the 90 day maximum', mismatch: 'Your wallet changed. Log out and log in again.', wallet: "Your wallet couldn't sign. Try again.", invalid_address: 'Enter a 0x address with 40 hex characters.', self: 'That is already your address.' } as const
 for (const kind of Object.keys(messages) as (keyof typeof messages)[]) expect(walletErrorMessage(kind)).toBe(messages[kind])
 expect(new WalletActionError('funds').message).toBe('funds')
})
test('balance arithmetic and formatting stay in wei', async () => {
 expect([null, BigInt(0), BigInt('99999999999999999'), BigInt('100000000000000000')].map(balanceLevel)).toEqual(['unknown', 'empty', 'low', 'ok'])
 expect([BigInt('40000000000000000'), BigInt(0), BigInt('1234567890000000000')].map(formatGlm)).toEqual(['0.04 GLM', '0 GLM', '1.2345 GLM'])
 expect(await readBalance(url, U, { getBalance: async () => BigInt(5) })).toBe(BigInt(5))
 expect(await readBalance(url, U, { getBalance: async () => { throw Error('offline') } })).toBeNull()
 expect(await readBalance(url, 'nope', { getBalance: async () => { throw Error('must not call') } })).toBeNull()
})
test('extend target adds the lifetime but caps at 90 days remaining', () => {
 expect(extendTarget(1000 + 43200, 1000, 7)).toBe(1000 + 8 * 43200)
 expect(extendTarget(1000 + 89 * 43200, 1000, 7)).toBe(1000 + 90 * 43200)
})
