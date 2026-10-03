import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Line } from '../types'

const EMPTY: Line = {
  model: '',
  dir: '',
  branch: null,
  isDirty: false,
  ctxPercent: null,
  ctxTokens: null,
  window: 200000,
  limits: [],
  usd: 0,
  startedAt: 0,
  now: 0,
  tokIn: 0,
  tokOut: 0,
  added: 0,
  removed: 0,
}

const line = atom({ plugin: 'statusline', key: 'line' } as const, EMPTY)

const LIMIT_LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: '$' }

const set = ($: EngineInterface, patch: Partial<Line>) => update($, line, l => ({ ...l, ...patch }))

const toLimits = (limits: SessionRateLimit[]) =>
  limits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percent: Math.floor(percentUsed), resetsAt }))

const countLines = (s: string) => (s === '' ? 0 : s.split('\n').length)

export const fmtTokens = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return `${n}`
}

export const fmtSpan = (ms: number) => {
  const mins = Math.max(0, Math.floor(ms / 60000))
  if (mins >= 1440) return `${Math.floor(mins / 1440)}d${Math.floor((mins % 1440) / 60)}h`
  if (mins >= 60) return `${Math.floor(mins / 60)}h${mins % 60}m`
  return `${mins}m`
}

export const level = (pct: number | null) =>
  pct === null ? 'gray' : pct >= 80 ? 'red' : pct >= 50 ? 'yellow' : 'green'

export const bar = (pct: number | null, width = 10) => {
  const filled = pct === null ? 0 : Math.min(width, Math.round((pct / 100) * width))
  return '▰'.repeat(filled) + '▱'.repeat(width - filled)
}

const refreshGit = async ($: EngineInterface) => {
  const cwd = await $.session.cwd()
  const git = (...args: string[]) => $.process.run(['git', '--no-optional-locks', '-C', cwd, ...args], { timeoutMs: 2000 })
  const head = await git('branch', '--show-current')
  if (head.exitCode !== 0) return set($, { branch: null, isDirty: false })
  const status = await git('status', '--porcelain')
  await set($, { branch: head.stdout.trim() || 'detached', isDirty: status.stdout.trim() !== '' })
}

const refreshSession = async ($: EngineInterface) => {
  const [model, cwd, home, usage, now] = await Promise.all([
    $.session.model(),
    $.session.cwd(),
    $.env.get('HOME'),
    $.session.usage(),
    $.clock.now(),
  ])
  await set($, {
    model,
    dir: home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd,
    ctxPercent: usage.context.percent ?? null,
    ctxTokens: usage.context.tokens ?? null,
    window: usage.context.window,
    limits: toLimits(usage.rateLimits),
    usd: usage.cost?.usd ?? 0,
    startedAt: usage.startedAt,
    now,
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await Promise.all([refreshSession($), refreshGit($)])
    $.clock.every(30_000, async () => set($, { now: await $.clock.now() }))
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await set($, {
      ctxPercent: e.context.percent ?? null,
      ctxTokens: e.context.tokens ?? null,
      window: e.context.window,
      limits: toLimits(e.rateLimits),
      usd: e.cost?.usd ?? 0,
    })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const u = e.usage
    if (u) {
      await update($, line, l => ({
        ...l,
        tokIn: l.tokIn + u.input_tokens + u.cache_creation_input_tokens,
        tokOut: l.tokOut + u.output_tokens,
      }))
    }
    if (e.agentId === undefined) await Promise.all([refreshSession($), refreshGit($)])
    return next(e)
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      await update($, line, l => ({
        ...l,
        added: l.added + countLines(e.new_string),
        removed: l.removed + countLines(e.old_string),
      }))
    }
    return ran
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      await update($, line, l => ({ ...l, added: l.added + countLines(e.content) }))
    }
    return ran
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (/\bgit\b/.test(e.command)) await refreshGit($)
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const l = await read($, line)
    if (l.model === '') return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const sep = <Text dimColor> │ </Text>
    const ctxLabel =
      l.ctxTokens === null ? `--/${fmtTokens(l.window)}` : `${fmtTokens(l.ctxTokens)}/${fmtTokens(l.window)}`

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="row">
            <Text color="cyan" bold>
              ◆ {l.model}
            </Text>
            <Text> </Text>
            <Text color="blueBright" wrap="truncate-start">
              {l.dir}
            </Text>
            {l.branch !== null && (
              <Text color="yellow">
                {'  '}⎇ {l.branch}
                {l.isDirty ? ' ●' : ''}
              </Text>
            )}
          </Box>
          <Box flexDirection="row">
            <Text color="magenta">
              ↑{fmtTokens(l.tokIn)} ↓{fmtTokens(l.tokOut)}
            </Text>
            {sep}
            <Text color="green">+{l.added}</Text>
            <Text> </Text>
            <Text color="red">−{l.removed}</Text>
            {sep}
            <Text color="blue">⏱ {fmtSpan(l.now - l.startedAt)}</Text>
          </Box>
        </Box>
        <Box flexDirection="row">
          <Text color={level(l.ctxPercent)}>
            {bar(l.ctxPercent)} {l.ctxPercent ?? '--'}%
          </Text>
          <Text dimColor> {ctxLabel}</Text>
          {l.limits.map(lim => (
            <Box flexDirection="row">
              {sep}
              <Text color={level(lim.percent)}>
                {LIMIT_LABELS[lim.kind] ?? lim.kind} {lim.percent}%
              </Text>
              {lim.resetsAt !== undefined && (
                <Text dimColor> ↻{fmtSpan(Date.parse(lim.resetsAt) - l.now)}</Text>
              )}
            </Box>
          ))}
          {sep}
          <Text color="cyan">${l.usd.toFixed(2)}</Text>
          {e.props.isWorking && <Text color="cyan"> ⋯</Text>}
        </Box>
      </Box>
    )
  })
}
