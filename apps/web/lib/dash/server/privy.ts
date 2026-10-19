import type { PrivyClient, User } from '@privy-io/node'
import { isHexAddress, type Login } from '../schema'

export type PrivyIdentity = { userId: string; wallets: string[]; login: Login | null }
export interface PrivyVerifier { verify(accessToken: string): Promise<PrivyIdentity> }
export function identityFromUser(user: Pick<User, 'id' | 'linked_accounts'>): PrivyIdentity {
  const wallets: string[] = []
  const providers: Record<string, Login> = { google_oauth: 'google', discord_oauth: 'discord', twitter_oauth: 'x', telegram: 'telegram' }
  let login: Login | null = null, latest = -Infinity
  for (const account of user.linked_accounts) {
    if (account.type === 'wallet' && account.wallet_client_type === 'privy' && account.connector_type === 'embedded' &&
      account.chain_type === 'ethereum' && isHexAddress(account.address)) wallets.push(account.address.toLowerCase())
    if (Object.hasOwn(providers, account.type) && 'latest_verified_at' in account) {
      const verified = account.latest_verified_at ?? 0
      if (verified > latest) { latest = verified; login = providers[account.type] }
    }
  }
  return { userId: user.id, wallets, login }
}
export function createPrivyVerifier(client: Pick<PrivyClient, 'utils' | 'users'>): PrivyVerifier {
  return { async verify(accessToken) {
    const { user_id } = await client.utils().auth().verifyAccessToken(accessToken)
    return identityFromUser(await client.users()._get(user_id))
  } }
}
