import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, test } from 'claude-code/testing'

import { noteLine } from '../hooks/secrets'

type Row = { type: string; [field: string]: unknown }

/**
 * Stands beneath the plugin, keeping each row as the plugin passed it on.
 * This build's test kit has no bottom for session.append, so the append
 * itself rejects once the row is kept (see `append`). Register it before the
 * test's first call on `$`.
 */
function transcript(on: On) {
  const stored: Row[][] = []
  const statuses: (string | undefined)[] = []
  on('session.append', (_, e, next) => {
    stored.push(e.message.content)

    return next(e)
  })
  on('ui.status', (_, e) => (statuses.push(e.text), { value: undefined }))

  return { stored, statuses }
}

const append = ($: Engine, row: Parameters<Engine['session']['append']>[0]) =>
  $.session.append(row).catch(() => undefined)

const toolResult = ($: Engine, output: string) =>
  append($, {
    door: 'tool-result',
    origin: { kind: 'tool', tool: 'Bash' },
    uuid: 'row-1',
    message: {
      type: 'user',
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: output }],
    },
  })

test('masks a secret in what a command printed, before it is stored', async ($, on) => {
  const { stored, statuses } = transcript(on)
  await toolResult($, 'DB_HOST=localhost\nDB_PASSWORD=hunter22\n')
  expect(stored[0]).toEqual([
    { type: 'tool_result', tool_use_id: 'toolu_1', content: `DB_HOST=localhost\nDB_PASSWORD=[MASKED]\n\n${noteLine(1)}` },
  ])
  expect(statuses).toEqual(['1件の秘密の値を伏せました'])
})

test('leaves a result with nothing secret as it was', async ($, on) => {
  const { stored, statuses } = transcript(on)
  await toolResult($, 'total 0\n')
  expect(stored[0]).toEqual([{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'total 0\n' }])
  expect(statuses).toEqual([])
})

test('leaves what the person typed alone', async ($, on) => {
  const { stored } = transcript(on)
  await append($, {
    door: 'prompt',
    origin: { kind: 'user' },
    uuid: 'row-2',
    message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'DB_PASSWORD=hunter22 を使って' }] },
  })
  expect(stored[0]).toEqual([{ type: 'text', text: 'DB_PASSWORD=hunter22 を使って' }])
})
