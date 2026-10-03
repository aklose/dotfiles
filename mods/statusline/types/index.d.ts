export type Limit = { kind: string; percent: number; resetsAt?: string }

export type Slice = { name: string; tokens: number }

export type Ctx = {
  max: number
  used: Slice[]
  free: number
  buffer: number
  deferred: number
  memory: Slice[]
  mcp: Slice[]
  plugins: Slice[]
  skills: Slice[]
  agents: Slice[]
}

export type Line = {
  model: string
  dir: string
  branch: string | null
  isDirty: boolean
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
    statusline: { line: Line; ctx: Ctx | null }
  }
}
