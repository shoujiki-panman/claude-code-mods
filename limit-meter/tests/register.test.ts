import type { On, RenderElement, SessionRateLimit } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

// TZ names Tokyo, where now is 10/3 22:00.
const NOW = Date.parse('2026-10-03T13:00:00Z')
const WEEK_RESET = '2026-10-06T14:00:00.000Z'

const limits = (five: number, week: number, fiveReset = '2026-10-03T18:30:00.000Z'): SessionRateLimit[] => [
  { kind: 'five_hour', percentUsed: five, resetsAt: fiveReset },
  { kind: 'seven_day', percentUsed: week, resetsAt: WEEK_RESET },
]

/**
 * Stands beneath the plugin for the events it passes on, keeping the toasts
 * and each prompt's context. Register it before the test's first call on `$`.
 */
function engine(on: On, atStart: SessionRateLimit[] = []) {
  const toasts: string[] = []
  const contexts: (readonly string[] | undefined)[] = []
  mock.clock(on, { now: NOW })
  mock.env(on, { TZ: 'Asia/Tokyo' })
  on('ui.toast', (_, e) => (toasts.push(e.text), { value: undefined }))
  on('session.usage', () => ({
    value: { startedAt: NOW, context: { window: 200000 }, rateLimits: atStart, cost: { usd: 0 } },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('prompt.submit', (_, e) => {
    contexts.push(e.context)

    return { text: e.text, context: e.context }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return h(Text, null, 'the engine band') as RenderElement
  })

  return { toasts, contexts }
}

const measure = ($: Engine, rateLimits: SessionRateLimit[], usd = 1.25) =>
  $.session.measure({ context: { window: 200000 }, rateLimits, cost: { usd }, changed: ['rateLimits'] })

const band = async ($: Engine, bodyColumns = 100) => {
  const drawn = await $.ui.mount({
    plugin: 'limit-meter',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 10,
      bodyColumns,
      scroll: { offset: 0, bodyRows: 10 },
      view: {},
    },
  })

  return (await drawn.findAll({ type: 'Text' })).map(text => text.text).join('')
}

test('draws both windows above the prompt after a measurement', async ($, on) => {
  engine(on)
  await measure($, limits(62, 17))
  expect(await band($)).toBe('上限  5時間 █████░░░ 62%（3:30リセット）  週 █░░░░░░░ 17%（10/6 23:00リセット）')
})

test('leaves the band to the engine before the first reading', async ($, on) => {
  engine(on)
  expect(await band($)).toBe('the engine band')
})

test('toasts once as the 5-hour window passes 80%, and again at 95%', async ($, on) => {
  const { toasts } = engine(on)
  await measure($, limits(79, 17))
  await measure($, limits(81, 17))
  await measure($, limits(83, 17))
  await measure($, limits(95.5, 17))
  expect(toasts).toEqual([
    '5時間枠の80%を超えました。3:30にリセットされます',
    '5時間枠の95%を超えました。3:30にリセットされます',
  ])
})

test('reads the windows when the session starts', async ($, on) => {
  const { toasts } = engine(on, limits(96, 17, '2026-10-03T19:30:00.000Z'))
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  expect(toasts).toEqual(['5時間枠の95%を超えました。4:30にリセットされます'])
  expect(await band($)).toContain('96%（4:30リセット）')
})

test('adds a note for Claude to each prompt from 90% of the 5-hour window', async ($, on) => {
  const { contexts } = engine(on)
  await measure($, limits(50, 17))
  await $.prompt.submit({ text: 'ログイン画面を直して', wait: false })
  await measure($, limits(92, 17))
  await $.prompt.submit({ text: 'ログイン画面を直して', wait: false })
  expect(contexts[0]).toBeUndefined()
  expect(contexts[1]?.[0]).toContain('[limit-meter] 利用上限が近づいています（5時間枠は92%使用、3:30にリセット）。')
})

test('shows the cost instead when the account reports no windows', async ($, on) => {
  engine(on)
  await measure($, [], 0.4213)
  expect(await band($)).toBe('このセッションの料金 $0.42')
})
