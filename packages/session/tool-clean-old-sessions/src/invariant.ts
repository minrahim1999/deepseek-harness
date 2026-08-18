/**
 * Package-owned runtime invariants. @module @deepseek-ai/dsh-tool-clean-old-sessions/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tool-clean-old-sessions'

/** Cordis companion plugin name. */
export const name = 'tool-clean-old-sessions-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * The clean_old_sessions tool deletes persisted sessions through the session
 * persistence backend; it appends no session events of its own and mutates no
 * session log shape. No durable event/data relation exists to validate, so the
 * installer registers an explained empty invariant.
 */
const install: InvariantInstaller = Object.assign((_ctx: Context) => {
  // No runtime invariant: this tool only removes already-persisted sessions
  // (SessionPersistence.delete) and detaches workspace accounting; it emits
  // no session events and defines no durable vocabulary of its own.
}, { inject: [] })

/**
 * Register the invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
