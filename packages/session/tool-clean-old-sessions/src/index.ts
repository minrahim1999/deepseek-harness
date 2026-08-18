/**
 * clean-old-sessions tool: delete persisted sessions older than a threshold,
 * scoped to a workspace or the ungrouped bucket. Host-side tool that rides on
 * the session.delete capability (SessionPersistence.delete + workspace detach).
 * @module @deepseek-ai/dsh-tool-clean-old-sessions
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { SessionHeader, SessionId } from '@deepseek-ai/dsh-session'
import type { Workspace } from '@deepseek-ai/dsh-workspace'
// Pull the Context merges so ctx.get types the services.
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-workspace'

export const name = 'clean-old-sessions'
export const inject = ['tools']

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Human-readable title from a session's cwd basename, falling back to its id. */
function titleOf(cwd: string | undefined, id: SessionId): string {
  return cwd !== undefined && cwd !== ''
    ? cwd.split(/[/\\]/).pop() ?? id
    : id
}

export interface CleanArgs {
  scope: string
  olderThanDays: number
  dryRun?: boolean
}
export interface CleanResult {
  deleted: { id: string; title: string }[]
  skipped: { id: string; title: string; reason: string }[]
  dryRun: boolean
}

/** All workspaces from the registry, or [] when no registry is composed. */
function workspacesOf(ctx: Context): Workspace[] {
  const registry = ctx.get('workspaceRegistry')
  return registry === undefined ? [] : [...registry.list()]
}

/**
 * Core clean-up logic, factored out so it is directly testable and reusable
 * (the tool's execute delegates to it). Shared by the registered tool.
 */
export async function executeCleanOldSessions(ctx: Context, args: CleanArgs): Promise<CleanResult> {
  const persistence = ctx.get('sessionPersistence')
  if (persistence === undefined) {
    throw new Error('session persistence is not configured; cannot clean sessions')
  }
  const workspaces = workspacesOf(ctx)
  const cutoff = Date.now() - args.olderThanDays * MS_PER_DAY

  const headers = await persistence.list()
  const byId = new Map<SessionId, SessionHeader>(headers.map(h => [h.id, h]))

  // Determine the target scope's session ids.
  let scopeIds: SessionId[]
  if (args.scope === 'ungrouped') {
    const accounted = new Set<string>()
    for (const workspace of workspaces) {
      for (const id of workspace.sessionIds) accounted.add(id)
    }
    scopeIds = headers.filter(h => !accounted.has(h.id)).map(h => h.id)
  } else {
    const workspace = workspaces.find(w => w.id === args.scope)
    if (workspace === undefined) throw new Error(`unknown workspace id "${args.scope}"`)
    scopeIds = [...workspace.sessionIds]
  }

  const deleted: CleanResult['deleted'] = []
  const skipped: CleanResult['skipped'] = []

  for (const id of scopeIds) {
    const header = byId.get(id)
    const title = titleOf(header?.cwd, id)
    if (header === undefined) {
      skipped.push({ id, title, reason: 'no persisted metadata' })
      continue
    }
    if (header.createdAt >= cutoff) {
      skipped.push({ id, title, reason: 'not old enough' })
      continue
    }
    if (ctx.get('agents')?.get(id) !== undefined) {
      skipped.push({ id, title, reason: 'is running' })
      continue
    }
    if (args.dryRun) {
      deleted.push({ id, title })
      continue
    }
    // Detach from workspace accounting, then remove the persisted log.
    for (const workspace of workspaces) {
      if (workspace.sessionIds.includes(id)) await workspace.detachSession(id)
    }
    await persistence.delete(id)
    deleted.push({ id, title })
  }

  return { deleted, skipped, dryRun: args.dryRun === true }
}

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'clean_old_sessions',
    description:
      'Delete sessions older than a given number of days, scoped to one workspace or the ungrouped bucket. '
      + 'Use this to reclaim disk space by removing stale session logs. '
      + 'Set dryRun=true to preview which sessions would be deleted without deleting anything. '
      + 'Running sessions are never deleted.',
    parameters: {
      scope: {
        type: 'string',
        required: true,
        description: 'Which sessions to target: a workspace id, or the literal "ungrouped" for the ungrouped bucket.',
      },
      olderThanDays: {
        type: 'number',
        required: true,
        description: 'Delete only sessions created more than this many days ago.',
      },
      dryRun: {
        type: 'boolean',
        description: 'When true, only report which sessions would be deleted; perform no deletion. Defaults to false.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          deleted: {
            type: 'array',
            items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, title: { type: 'string' } } },
          },
          skipped: {
            type: 'array',
            items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, title: { type: 'string' }, reason: { type: 'string' } } },
          },
          dryRun: { type: 'boolean' },
        },
      },
      render: (_args, value: CleanResult) => [
        { type: 'text', text: value.dryRun
          ? `Dry run: ${value.deleted.length} session(s) would be deleted; ${value.skipped.length} skipped.`
          : `Deleted ${value.deleted.length} session(s); ${value.skipped.length} skipped.` },
      ],
    },
    async execute(args: CleanArgs): Promise<CleanResult> {
      return executeCleanOldSessions(ctx, args)
    },
  }))
}
