import type { RenderPropsOf } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { bar, etaToFull, fmtSpan, fmtTokens, level, shortModel } from '../hooks/register'

const HINT = {
  isDraft: false,
  isWorking: false,
  hint: '? for shortcuts',
} as unknown as RenderPropsOf['PromptHint']

test('formatters', async () => {
  expect(fmtTokens(950)).toBe('950')
  expect(fmtTokens(84000)).toBe('84k')
  expect(fmtTokens(1_000_000)).toBe('1m')
  expect(fmtTokens(1_250_000)).toBe('1.3m')
  expect(fmtSpan(80 * 60000)).toBe('1h20m')
  expect(bar(42)).toBe('▰▰▰▰▱▱▱▱▱▱')
  expect(bar(null)).toBe('▱▱▱▱▱▱▱▱▱▱')
  expect(level(85)).toBe('red')
  expect(shortModel('claude-haiku-5-5')).toBe('haiku')
  expect(shortModel('custom')).toBe('custom')
})

test('limit projection warns only before reset', async () => {
  const H = 3600_000
  const reset = new Date(4 * H).toISOString()
  expect(etaToFull(75, reset, 'five_hour', 2 * H)).toBe(H)
  expect(etaToFull(60, reset, 'five_hour', 2 * H)).toBe(null)
  expect(etaToFull(20, reset, 'five_hour', 2 * H)).toBe(null)
  expect(etaToFull(60, reset, 'spend_limit', 2 * H)).toBe(null)
  expect(etaToFull(5, reset, 'five_hour', 2 * H)).toBe(null)
})

const stub = (on: any) => {
  on('session.model', async () => ({ value: 'Opus 5.5' }))
  on('session.cwd', async () => ({ value: '/Users/a/dev/dotfiles' }))
  on('env.get', async () => ({ value: '/Users/a' }))
  on('clock.now', async () => ({ value: 12 * 60000 }))
  on('session.usage', async () => ({
    value: {
      startedAt: 0,
      context: { tokens: 84000, window: 200000, percent: 42 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 12.4 }],
      cost: { usd: 1.234 },
    },
  }))
  on('process.run', async (_$: unknown, e: { argv: string[] }) => {
    const out = e.argv.includes('branch')
      ? 'main\n'
      : e.argv.includes('rev-list')
        ? '2\t1\n'
        : e.argv.includes('stash')
          ? 'stash@{0}: wip\n'
          : e.argv.includes('rev-parse')
            ? '/r/wt-feature\n/r/main/.git/worktrees/wt-feature\n/r/main/.git\n'
            : ' M x\n'
    return { value: { exitCode: 0, stdout: out, stderr: '' } }
  })
  on('agent.list', async () => ({
    value: [
      { status: 'running', model: 'claude-haiku-5-5' },
      { status: 'completed', model: 'claude-opus-5-5' },
      { status: 'running', model: 'claude-sonnet-5-5' },
    ],
  }))
  on('turn.complete', async () => ({ text: '' }))
}

const TURN = {
  answer: '',
  durationMs: 0,
  isAborted: false,
  turnId: 't1',
  reason: 'answer',
  usage: { model: 'm', input_tokens: 12000, cache_creation_input_tokens: 345, cache_read_input_tokens: 0, output_tokens: 2100 },
} as never

test('hint line draws the figures on terminal and desktop', async ($, on) => {
  stub(on as never)
  await $.turn.complete(TURN)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'statusline', surface, component: 'PromptHint', props: HINT })
    expect(await ui.find({ type: 'Text', text: /Opus 5\.5/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '~/dev/dotfiles' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /⎇ main ●/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /▰▰▰▰▱▱▱▱▱▱ 42%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /5h 12%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\$1\.23/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /↑12k ↓2k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /⏱ 12m/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /🌳 wt-feature/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /↑2 ↓1 ≡1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /🤖 2 · haiku sonnet/ })).toBeDefined()
    await ui.unmount()
  }
})

test('edits count added and removed lines', async ($, on) => {
  stub(on as never)
  on('tool.call', { tool: 'Edit' }, async () => ({ result: {}, text: 'ok', isError: false }) as never)
  await $.turn.complete(TURN)
  await $.tool.call({ tool: 'Edit', file_path: '/x', old_string: 'a\nb', new_string: 'a\nb\nc' } as never)
  const ui = await $.ui.mount({ plugin: 'statusline', surface: 'terminal', component: 'PromptHint', props: HINT })
  expect(await ui.find({ type: 'Text', text: '+3' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '−2' })).toBeDefined()
})
