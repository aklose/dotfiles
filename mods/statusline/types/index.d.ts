export type Limit = { kind: string; percent: number; resetsAt?: string }

export type Line = {
  model: string
  dir: string
  branch: string | null
  isDirty: boolean
  ahead: number | null
  behind: number | null
  stashes: number
  worktree: string | null
  agents: string[]
  ctxPercent: number | null
  ctxTokens: number | null
  window: number
  limits: Limit[]
  usd: number
  startedAt: number
  now: number
  tokIn: number
  tokOut: number
  added: number
  removed: number
}

declare module 'claude-code' {
  interface PluginState {
    statusline: { line: Line }
  }
}
