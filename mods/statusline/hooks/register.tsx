import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextBreakdown, SessionRateLimit } from 'claude-code'

import type { Ctx, Line, Slice } from '../types'

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

const ctx = atom({ plugin: 'statusline', key: 'ctx' } as const, null)

const PANE = 'ctx'

const SHORT: Record<string, string> = {
  'System prompt': 'system',
  'System tools': 'tools',
  'MCP tools': 'mcp',
  'Memory files': 'memory',
  'Custom agents': 'agents',
  'Slash commands': 'commands',
  Skills: 'skills',
  Messages: 'msgs',
}

const PALETTE = ['magenta', 'cyan', 'yellow', 'green', 'blue', 'red', 'white']

const LIMIT_LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: '$' }

const set = ($: EngineInterface, patch: Partial<Line>) => update($, line, l => ({ ...l, ...patch }))

const toLimits = (limits: SessionRateLimit[]) =>
  limits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percent: Math.floor(percentUsed), resetsAt }))

const tilde = (path: string, home?: string) => (home && path.startsWith(home) ? `~${path.slice(home.length)}` : path)

const byTokens = (a: Slice, b: Slice) => b.tokens - a.tokens

const sumBy = <T,>(items: T[], name: (t: T) => string, tokens: (t: T) => number): Slice[] => {
  const totals = new Map<string, number>()
  for (const item of items) totals.set(name(item), (totals.get(name(item)) ?? 0) + tokens(item))
  return [...totals].map(([n, t]) => ({ name: n, tokens: t })).sort(byTokens)
}

export const toCtx = (b: SessionContextBreakdown, home?: string): Ctx => {
  const total = (kind: string) => b.categories.filter(c => c.kind === kind).reduce((n, c) => n + c.tokens, 0)
  const skills = b.skills?.skillFrontmatter ?? []
  return {
    max: b.rawMaxTokens,
    used: b.categories.filter(c => c.kind === 'used' && c.tokens > 0).map(({ name, tokens }) => ({ name, tokens })),
    free: total('free'),
    buffer: total('buffer'),
    deferred: total('deferred'),
    memory: b.memoryFiles.map(f => ({ name: tilde(f.path, home), tokens: f.tokens })).sort(byTokens),
    mcp: sumBy(b.mcpTools.filter(t => t.isLoaded), t => t.serverName, t => t.tokens),
    plugins: sumBy(skills.filter(sk => sk.pluginName !== undefined), sk => sk.pluginName ?? '', sk => sk.tokens),
    skills: sumBy(skills, sk => sk.source, sk => sk.tokens),
    agents: sumBy(b.agents, a => a.source, a => a.tokens),
  }
}

const colorOf = (c: Ctx, slice: Slice) => PALETTE[c.used.indexOf(slice) % PALETTE.length] ?? 'white'

export const segments = (c: Ctx, width: number) => {
  let left = width
  const cells = c.used.map((slice, i) => {
    const n = Math.min(left, Math.max(1, Math.round((slice.tokens / c.max) * width)))
    left -= n
    return { color: PALETTE[i % PALETTE.length] ?? 'white', n }
  })
  return { cells, rest: left }
}

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

const refreshCtx = async ($: EngineInterface) => {
  const [usage, home] = await Promise.all([$.session.usage({ breakdown: 'summary' }), $.env.get('HOME')])
  const b = usage.context.breakdown
  await update($, ctx, () => (b ? toCtx(b, home) : null))
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
    dir: tilde(cwd, home),
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
    await $.command.register({ name: 'ctx', description: 'Show what is filling the context window' })
    await Promise.all([refreshSession($), refreshGit($), refreshCtx($)])
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
    if (e.changed.includes('context')) await refreshCtx($)
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
    if (e.agentId === undefined) await Promise.all([refreshSession($), refreshGit($), refreshCtx($)])
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
    const c = await read($, ctx)
    const stack = c === null ? { cells: [], rest: 0 } : segments(c, 10)

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
        {c !== null && (
          <Box flexDirection="row">
            {stack.cells.map(cell => (
              <Text color={cell.color}>{'█'.repeat(cell.n)}</Text>
            ))}
            <Text dimColor>{'░'.repeat(stack.rest)}</Text>
            {[...c.used].sort(byTokens).map(slice => (
              <Text color={colorOf(c, slice)} wrap="truncate">
                {'  '}
                {SHORT[slice.name] ?? slice.name.toLowerCase()} {fmtTokens(slice.tokens)}
              </Text>
            ))}
            <Text dimColor wrap="truncate">
              {'  '}/ctx
            </Text>
          </Box>
        )}
      </Box>
    )
  })

  on('command.run', { command: 'ctx' }, async $ => {
    await refreshCtx($)
    await $.ui.open({ id: PANE, title: 'Context' })
    return { text: 'Context breakdown opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const c = await read($, ctx)
    if (c === null) return <Text dimColor>No context reading yet.</Text>

    const used = c.used.reduce((n, slice) => n + slice.tokens, 0)
    const pct = (n: number) => `${Math.round((n / c.max) * 100)}%`.padStart(4)
    const row = (name: string, tokens: number, color?: string) => (
      <Box flexDirection="row" justifyContent="space-between">
        <Text color={color} wrap="truncate-middle">
          {name}
        </Text>
        <Text dimColor={color === undefined}>
          {' '}
          {fmtTokens(tokens).padStart(5)} {pct(tokens)}
        </Text>
      </Box>
    )
    const section = (title: string, slices: Slice[]) =>
      slices.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>{title}</Text>
          {slices.map(slice => row(`  ${slice.name}`, slice.tokens))}
        </Box>
      )
    const stack = segments(c, 40)

    return (
      <Box flexDirection="column">
        <Text bold>
          {fmtTokens(used)} / {fmtTokens(c.max)} ({pct(used).trim()})
        </Text>
        <Box flexDirection="row">
          {stack.cells.map(cell => (
            <Text color={cell.color}>{'█'.repeat(cell.n)}</Text>
          ))}
          <Text dimColor>{'░'.repeat(stack.rest)}</Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {c.used.map(slice => row(`■ ${slice.name}`, slice.tokens, colorOf(c, slice)))}
          {row('□ Free space', c.free)}
          {c.buffer > 0 && row('□ Autocompact buffer', c.buffer)}
          {c.deferred > 0 && <Text dimColor>  + {fmtTokens(c.deferred)} of tools loaded on demand (outside the window)</Text>}
        </Box>
        {section('CLAUDE.md & memory files', c.memory)}
        {section('MCP servers', c.mcp)}
        {section('Plugins (skill listings)', c.plugins)}
        {section('Skills by source', c.skills)}
        {section('Agents by source', c.agents)}
      </Box>
    )
  })
}
