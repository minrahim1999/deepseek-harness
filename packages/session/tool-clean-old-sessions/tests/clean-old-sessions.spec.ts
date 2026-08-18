import { describe, it, expect, afterEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionStore } from '@deepseek-ai/dsh-session'
import { JsonlSessionPersistence } from '@deepseek-ai/dsh-session-persistence-jsonl'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { executeCleanOldSessions } from '../src/index.ts'

const roots: string[] = []
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-clean-test-'))
  roots.push(root)
  const ctx = new Context()
  await ctx.plugin(JsonlSessionPersistence, { root })
  await ctx.plugin(SessionStore)
  return { ctx, root }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(r => rm(r, { recursive: true, force: true })))
})

const S = (s: string) => s as SessionId

describe('executeCleanOldSessions (ungrouped, no workspace registry)', () => {
  it('dry-runs and deletes only sessions older than the cutoff', async () => {
    const { ctx } = await setup()
    const now = Date.now()
    const day = 24 * 60 * 60 * 1000

    const create = async (id: string, cwd: string | undefined, daysAgo: number) => {
      await ctx.sessionPersistence.create({
        version: 0,
        id: S(id),
        createdAt: now - daysAgo * day,
        ...(cwd === undefined ? {} : { cwd }),
      })
      // Materialize with a real event (lazy materialization otherwise).
      await ctx.sessionPersistence.append(S(id), [{ type: 'turn/start', seq: 0, time: now, data: { turn: 1 } }])
    }

    await create('session-old-1', '/tmp/x', 100)
    await create('session-old-2', '/tmp/x', 90)
    await create('session-recent', '/tmp/current', 2)

    // Dry run: finds the 2 old, skips the recent.
    const dry = await executeCleanOldSessions(ctx, { scope: 'ungrouped', olderThanDays: 30, dryRun: true })
    expect(dry.dryRun).toBe(true)
    expect(dry.deleted.map(d => d.id).sort()).toEqual(['session-old-1', 'session-old-2'])
    expect(dry.skipped.map(s => s.id)).toEqual(['session-recent'])

    // Real delete: old removed from persistence, recent retained.
    const real = await executeCleanOldSessions(ctx, { scope: 'ungrouped', olderThanDays: 30 })
    expect(real.deleted.length).toBe(2)
    const remaining = (await ctx.sessionPersistence.list()).map(h => h.id)
    expect(remaining).toContain('session-recent')
    expect(remaining).not.toContain('session-old-1')
    expect(remaining).not.toContain('session-old-2')
  })
})
