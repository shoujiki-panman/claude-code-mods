import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import { bandPieces, demoLimits, noteFor, readingOf, toastsFor } from './meter'
import { UTC_GUESS, zoneFromName, zoneFromOffset, zoneFromPath } from './zone'
import type { Zone } from './zone'

const reading = atom({ plugin: 'limit-meter', key: 'reading' } as const, null)
const TOAST_MS = 8000
// Toasts already shown, by window, threshold and reset: each shows once.
const shown = new Set<string>()
// The machine's time zone, read once per load of the module.
let zone: Zone | null = null

/** TZ when it names a zone, else where /etc/localtime points, else `date +%z`, else UTC. */
async function readZone($: EngineInterface): Promise<Zone> {
  const fromEnv = zoneFromName(await $.env.get('TZ'))
  if (fromEnv !== null) return fromEnv
  const fromFile = await $.fs.stat('/etc/localtime', { resolve: true }).then(
    stat => zoneFromPath(stat.realPath),
    () => null,
  )
  if (fromFile !== null) return fromFile
  const fromDate = await $.process.run(['date', '+%z']).then(
    run => (run.exitCode === 0 ? zoneFromOffset(run.stdout) : null),
    () => null,
  )

  return fromDate ?? UTC_GUESS
}

async function measure($: EngineInterface, limits: readonly SessionRateLimit[], usd?: number) {
  zone ??= await readZone($)
  const latest = readingOf(demoLimits(limits, await $.env.get('LIMIT_METER_DEMO')), usd)
  await update($, reading, () => latest)
  for (const toast of toastsFor(latest, await $.clock.now(), zone)) {
    if (shown.has(toast.key)) continue
    shown.add(toast.key)
    $.ui.toast(toast.text, { timeoutMs: TOAST_MS })
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const usage = await $.session.usage()
    await measure($, usage.rateLimits, usage.cost?.usd)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await measure($, e.rateLimits, e.cost?.usd)

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const latest = await read($, reading)
    const note = latest === null ? null : noteFor(latest, await $.clock.now(), zone ?? UTC_GUESS)

    return note === null ? next(e) : next({ ...e, context: [...(e.context ?? []), note] })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const latest = await read($, reading)
    if (e.props.hasSurvey || latest === null) return next(e)
    const pieces = bandPieces(latest, await $.clock.now(), zone ?? UTC_GUESS, e.props.bodyColumns)
    if (pieces.length === 0) return next(e)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        {pieces.map(piece =>
          piece.color === undefined ? (
            <Text dimColor>{piece.text}</Text>
          ) : (
            <Text color={piece.color} bold>
              {piece.text}
            </Text>
          ),
        )}
      </Box>
    )
  })
}
