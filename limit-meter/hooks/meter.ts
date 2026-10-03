import type { SessionRateLimit } from 'claude-code'

import type { LimitMeterReading as Reading, LimitMeterWindow as Window } from '../types'
import { partsOf } from './zone'
import type { Zone } from './zone'

/** A theme color the band draws a window's use in. */
export type Level = 'success' | 'warning' | 'error'

/** One run of the band's text, colored when it is a window's use. */
export type Piece = { text: string; color?: Level }

/** A toast to show once: `key` names the window, the threshold and the reset. */
export type Toast = { key: string; text: string }

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE
const BAR_CELLS = 8
/** The band draws bars from this many columns, and the weekly window from NARROW. */
const WIDE = 80
const NARROW = 62

/** The 5-hour window toasts at each of these percentages, the weekly one at its own. */
export const FIVE_HOUR_TOASTS = [80, 95] as const
export const WEEK_TOASTS = [90] as const
/** From these percentages, each prompt carries a note telling Claude the limit is near. */
export const FIVE_HOUR_NOTE_AT = 90
export const WEEK_NOTE_AT = 95

/** The window named `kind` (`five_hour`, `seven_day`), or null when none was reported. */
export function windowOf(limits: readonly SessionRateLimit[], kind: string): Window | null {
  const found = limits.find(limit => limit.kind === kind)
  if (found === undefined) return null
  const resetsAt = found.resetsAt === undefined ? NaN : Date.parse(found.resetsAt)

  return { percent: found.percentUsed, resetsAt: Number.isNaN(resetsAt) ? null : resetsAt }
}

/**
 * `LIMIT_METER_DEMO=92,40`: the 5-hour and weekly windows read as these
 * percentages instead of the real ones, to try how the band and the
 * warnings look. The reset times stay real.
 */
export function demoLimits(limits: readonly SessionRateLimit[], value: string | undefined): readonly SessionRateLimit[] {
  const match = value?.match(/^\s*(\d+(?:\.\d+)?)\s*(?:,\s*(\d+(?:\.\d+)?)\s*)?$/)
  if (match === null || match === undefined) return limits
  const percents: Record<string, number | undefined> = {
    five_hour: Number(match[1]),
    seven_day: match[2] === undefined ? undefined : Number(match[2]),
  }

  return limits.map(limit => ({ ...limit, percentUsed: percents[limit.kind] ?? limit.percentUsed }))
}

export function readingOf(limits: readonly SessionRateLimit[], usd?: number): Reading {
  return {
    five: windowOf(limits, 'five_hour'),
    week: windowOf(limits, 'seven_day'),
    usd: usd ?? null,
  }
}

/** Green below 70%, yellow below 90%, red from 90%. */
export function levelOf(percent: number): Level {
  if (percent >= 90) return 'error'
  if (percent >= 70) return 'warning'

  return 'success'
}

export function bar(percent: number, cells = BAR_CELLS): string {
  const used = Math.min(cells, Math.max(0, Math.round((percent / 100) * cells)))

  return '█'.repeat(used) + '░'.repeat(cells - used)
}

/** "3:30" for a reset within a day of `now`, "10/6 23:00" for a later one, in `zone`. */
export function clockText(at: number, now: number, zone: Zone): string {
  const { month, day, hour, minute } = partsOf(at, zone)
  const time = `${hour}:${String(minute).padStart(2, '0')}`
  const when = at - now < DAY ? time : `${month}/${day} ${time}`

  return 'isGuess' in zone ? `${when} UTC` : when
}

function windowPieces(name: string, window: Window, now: number, zone: Zone, withBar: boolean): Piece[] {
  const percent = `${Math.floor(window.percent)}%`
  const used = withBar ? `${bar(window.percent)} ${percent}` : percent
  const reset = window.resetsAt === null ? '' : `（${clockText(window.resetsAt, now, zone)}リセット）`

  return [{ text: `${name} ` }, { text: used, color: levelOf(window.percent) }, { text: reset }]
}

/**
 * The band's text for `columns` cells: both windows with bars when there is
 * room, the cost when the account reports no windows (an API key), else none.
 */
export function bandPieces(reading: Reading, now: number, zone: Zone, columns: number): Piece[] {
  const { five, week, usd } = reading
  if (five === null && week === null) {
    return usd === null || usd === 0 ? [] : [{ text: `このセッションの料金 $${usd.toFixed(2)}` }]
  }
  const withBar = columns >= WIDE
  const pieces: Piece[] = [{ text: '上限  ' }]
  if (five !== null) pieces.push(...windowPieces('5時間', five, now, zone, withBar))
  if (week !== null && (five === null || columns >= NARROW)) {
    if (five !== null) pieces.push({ text: '  ' })
    pieces.push(...windowPieces('週', week, now, zone, withBar))
  }

  return pieces
}

function toastFor(name: string, id: string, window: Window, thresholds: readonly number[], now: number, zone: Zone): Toast[] {
  const passed = thresholds.filter(at => window.percent >= at)
  if (passed.length === 0) return []
  const at = passed[passed.length - 1]
  const reset = window.resetsAt === null ? '' : `。${clockText(window.resetsAt, now, zone)}にリセットされます`

  return [{ key: `${id}:${at}:${window.resetsAt}`, text: `${name}の${at}%を超えました${reset}` }]
}

/** The highest threshold each window has passed, as a toast keyed to that window's reset. */
export function toastsFor(reading: Reading, now: number, zone: Zone): Toast[] {
  return [
    ...(reading.five === null ? [] : toastFor('5時間枠', 'five', reading.five, FIVE_HOUR_TOASTS, now, zone)),
    ...(reading.week === null ? [] : toastFor('週の枠', 'week', reading.week, WEEK_TOASTS, now, zone)),
  ]
}

function usedText(name: string, window: Window, now: number, zone: Zone): string {
  const reset = window.resetsAt === null ? '' : `、${clockText(window.resetsAt, now, zone)}にリセット`

  return `${name}は${Math.floor(window.percent)}%使用${reset}`
}

/** What Claude reads beside each prompt while a window is near its limit, or null. */
export function noteFor(reading: Reading, now: number, zone: Zone): string | null {
  const { five, week } = reading
  const near = [
    five !== null && five.percent >= FIVE_HOUR_NOTE_AT ? usedText('5時間枠', five, now, zone) : null,
    week !== null && week.percent >= WEEK_NOTE_AT ? usedText('週の枠', week, now, zone) : null,
  ].filter((part): part is string => part !== null)
  if (near.length === 0) return null

  return [
    `[limit-meter] 利用上限が近づいています（${near.join('／')}）。上限に達すると、作業は途中で止まります。`,
    'この依頼で2つ以上のファイルを書き換えるなら、書き換える前に、区切り方を短く提案して、ユーザーの返事を待ってください。',
    '1つのファイルで済む作業なら、そのまま進めてかまいません。',
  ].join('')
}
