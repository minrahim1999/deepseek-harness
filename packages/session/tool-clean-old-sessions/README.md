# @deepseek-ai/dsh-tool-clean-old-sessions

English | [中文](README.zh.md)

Model-facing `clean_old_sessions` tool that deletes persisted sessions older than a threshold, scoped to one workspace or the ungrouped bucket. The opt-in package depends only on the session persistence and workspace registry seams and is not mounted by default host compositions.

## Configuration

This package takes no configuration.

## Behavior

The tool deletes only persisted (cold) sessions — a session with a live Agent is skipped. For each target scope it lists persisted session headers, applies the age cutoff to `header.createdAt`, and for every candidate detaches the session from its workspace accounting (via the workspace entity's `detachSession`) before removing the durable log (via `SessionPersistence.delete`). A `dryRun` call performs no deletion and reports exactly what a real call would remove.

Scoping is either a named workspace id or the literal `ungrouped` bucket. `ungrouped` is every persisted session not accounted to any workspace. An unknown workspace id is a hard error. Running sessions and sessions with no persisted metadata are skipped and reported.

## Model Experience

### Tool schemas

#### What the model sees

The model sees the generated `clean_old_sessions` schema. It exposes `scope` (workspace id or `ungrouped`), `olderThanDays` (age cutoff), and optional `dryRun`.

#### Token effect

One fixed read-only schema is sent on each request while visible.

#### KV Cache effect

Prefix-stable while tool visibility and definitions are unchanged.

### Tool results

#### What the model sees

Each successful call emits one plain-text block: either a dry-run summary (`Dry run: N session(s) would be deleted; M skipped.`) or a deletion summary (`Deleted N session(s); M skipped.`). The canonical value carries `deleted` and `skipped` id/title arrays plus the `dryRun` flag.

#### Token effect

Results are data-dependent and remain in logged tool history until compaction.

#### KV Cache effect

Append-only result text follows the reusable request prefix and does not invalidate earlier cache entries.

## Known Limitations and Deferred Work

- Deletion is permanent and does not move sessions to an archive; the caller should prefer a `dryRun` pass first.
- Age is judged by the durable `createdAt` header only; there is no per-session "last activity" cutoff.
- The tool performs no byte/character bounds on its result; a very large scope could produce a long result list.
