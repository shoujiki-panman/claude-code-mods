/** What a masked value reads as, to Claude. */
export const MASK = '[MASKED]'

/** The line added under a tool result that had something masked. */
export const noteLine = (count: number) =>
  `[secret-mask] ${count}件の秘密の値を伏せました。値が必要なときは、値を読まずに使う方法（環境変数のまま渡すなど）を選んでください。`

/** A secret recognized by its shape: the match's first `keep` characters stay as a hint. */
type Token = { pattern: RegExp; keep: number }

// Each starts at a word boundary and is long enough that ordinary words never match.
const TOKENS: Token[] = [
  { pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g, keep: 7 }, // Anthropic
  { pattern: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g, keep: 3 }, // OpenAI
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}/g, keep: 4 }, // GitHub
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{30,}/g, keep: 11 }, // GitHub fine-grained
  { pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, keep: 4 }, // AWS access key ID
  { pattern: /\bxox[abeprs]-[A-Za-z0-9-]{10,}/g, keep: 5 }, // Slack
  { pattern: /\bAIza[0-9A-Za-z_-]{35}/g, keep: 4 }, // Google API key
  { pattern: /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}/g, keep: 8 }, // Stripe
  { pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, keep: 3 }, // JWT
]

const PRIVATE_KEY = /-----BEGIN ([A-Z ]*)PRIVATE KEY-----[\s\S]*?-----END \1PRIVATE KEY-----/g
const URL_PASSWORD = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)([^\s@/]+)(@)/gi
const BEARER = /\b(Bearer|Basic)(\s+)([A-Za-z0-9._~+/=-]{16,})/g

// A name that says it holds a secret, in an environment variable's capitals...
const UPPER_WORD = '(?:SECRETS?|TOKENS?|PASSW(?:OR)?DS?|PWD|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|CREDENTIALS?)'
// ...or in a config key or variable of any case: `apiKey`, `db_password`, not `tokenizer`.
const ANY_WORD =
  '(?:[Ss]ecrets?|SECRETS?|[Tt]okens?|TOKENS?|[Pp]assw(?:or)?ds?|PASSW(?:OR)?DS?|[Pp]wd|PWD|' +
  '[Aa]pi[_-]?[Kk]ey|API[_-]?KEY|[Aa]ccess[_-]?[Kk]ey|ACCESS[_-]?KEY|[Pp]rivate[_-]?[Kk]ey|PRIVATE[_-]?KEY|' +
  '[Cc]redentials?|CREDENTIALS?)(?![a-z])'
// `DB_PASSWORD=...` at the start of a line: a .env file, `env`, `export`, a compose list.
// The start may carry the line number the Read tool prints.
const ENV_SETTING = new RegExp(
  `^([ \\t]*(?:\\d+\\t)?[ \\t]*(?:export[ \\t]+|-[ \\t]+)?)([A-Z0-9_.]*${UPPER_WORD}[A-Z0-9_.]*)([ \\t]*[:=][ \\t]*)` +
    `(?:"([^"\\n]*)"|'([^'\\n]*)'|([^\\s"'#]+))`,
  'gm',
)
// `"password": "..."`, `api_key = '...'`: a quoted value under a secret's name.
const QUOTED_SETTING = new RegExp(
  `(["']?)([A-Za-z0-9_.-]*${ANY_WORD}[A-Za-z0-9_.-]*)\\1(\\s*[:=]\\s*)(["'])([^"'\\n]+)\\4`,
  'g',
)
// Names that say "secret" but hold none: the shell's working directories.
const NOT_SECRET_NAMES = new Set(['PWD', 'OLDPWD'])
// Values that are no secret: numbers, switches, references and placeholders.
const NOT_SECRET_VALUE =
  /^(?:\d+|true|false|null|none|yes|no|on|off|x+|\*+|changeme|your[-_].*|example.*|dummy.*|placeholder.*)$|^[$<%{]|\[MASKED\]/i

const isSecretValue = (value: string) => value.length >= 4 && !NOT_SECRET_VALUE.test(value)

/** `text` with every secret masked, and how many were. */
export function mask(text: string): { text: string; count: number } {
  let count = 0
  const hide = (shown: string) => {
    count += 1

    return `${shown}${MASK}`
  }
  let out = text.replace(PRIVATE_KEY, (_, kind: string) => hide(`-----BEGIN ${kind}PRIVATE KEY-----`))
  for (const { pattern, keep } of TOKENS) out = out.replace(pattern, match => hide(match.slice(0, keep)))
  out = out.replace(URL_PASSWORD, (_, head: string, _password: string, at: string) => `${hide(head)}${at}`)
  out = out.replace(BEARER, (_, scheme: string, gap: string) => hide(`${scheme}${gap}`))
  out = out.replace(ENV_SETTING, (match, lead: string, name: string, sep: string, ...values: unknown[]) => {
    const [double, single, bare] = values as (string | undefined)[]
    const value = double ?? single ?? bare ?? ''
    if (NOT_SECRET_NAMES.has(name) || !isSecretValue(value)) return match
    const quote = double !== undefined ? '"' : single !== undefined ? "'" : ''

    return `${lead}${name}${sep}${quote}${hide('')}${quote}`
  })
  out = out.replace(QUOTED_SETTING, (match, q1: string, name: string, sep: string, q2: string, value: string) =>
    isSecretValue(value) ? `${q1}${name}${q1}${sep}${q2}${hide('')}${q2}` : match,
  )

  return { text: out, count }
}

type Block = { type: string; [field: string]: unknown }

function withNote(text: string, count: number): string {
  return count === 0 ? text : `${text}\n${noteLine(count)}`
}

/** One content block with its text masked: a text block, or a tool result's text. */
export function maskBlock(block: Block): { block: Block; count: number } {
  if (block.type === 'text' && typeof block.text === 'string') {
    const masked = mask(block.text)

    return { block: { ...block, text: masked.text }, count: masked.count }
  }
  if (block.type !== 'tool_result') return { block, count: 0 }
  if (typeof block.content === 'string') {
    const masked = mask(block.content)

    return { block: { ...block, content: withNote(masked.text, masked.count) }, count: masked.count }
  }
  if (!Array.isArray(block.content)) return { block, count: 0 }
  const inner = block.content.map(each => maskBlock(each as Block))
  const count = inner.reduce((sum, each) => sum + each.count, 0)
  const content = inner.map(each => each.block)
  if (count > 0) content.push({ type: 'text', text: noteLine(count) })

  return { block: { ...block, content }, count }
}

/** A row's blocks with every secret masked, and how many were. */
export function maskContent(content: readonly Block[]): { content: Block[]; count: number } {
  const masked = content.map(maskBlock)

  return { content: masked.map(each => each.block), count: masked.reduce((sum, each) => sum + each.count, 0) }
}
