import { describe, expect, test } from 'claude-code/testing'

import type { Piece } from '../hooks/meter'
import { bandPieces, bar, clockText, demoLimits, levelOf, noteFor, readingOf, toastsFor } from '../hooks/meter'
import { UTC_GUESS, zoneFromName, zoneFromOffset, zoneFromPath } from '../hooks/zone'

// In Tokyo, now is 10/3 22:00, the 5-hour window resets at 3:30 the next
// morning and the week on 10/6 at 23:00.
const TOKYO = { name: 'Asia/Tokyo' }
const NOW = Date.parse('2026-10-03T13:00:00Z')
const FIVE_RESET = '2026-10-03T18:30:00.000Z'
const WEEK_RESET = '2026-10-06T14:00:00.000Z'

const limits = (five: number, week: number) => [
  { kind: 'five_hour', percentUsed: five, resetsAt: FIVE_RESET },
  { kind: 'seven_day', percentUsed: week, resetsAt: WEEK_RESET },
]
const textOf = (pieces: Piece[]) => pieces.map(piece => piece.text).join('')

describe('bar', () => {
  test('fills one cell in eight per 12.5%', () => {
    expect(bar(0)).toBe('░░░░░░░░')
    expect(bar(62)).toBe('█████░░░')
    expect(bar(100)).toBe('████████')
  })

  test('stays within its cells past 100%', () => {
    expect(bar(130)).toBe('████████')
  })
})

describe('levelOf', () => {
  test('turns yellow at 70% and red at 90%', () => {
    expect(levelOf(69.9)).toBe('success')
    expect(levelOf(70)).toBe('warning')
    expect(levelOf(90)).toBe('error')
  })
})

describe('clockText', () => {
  test('gives the time alone within a day, and the date after that', () => {
    expect(clockText(Date.parse(FIVE_RESET), NOW, TOKYO)).toBe('3:30')
    expect(clockText(Date.parse(WEEK_RESET), NOW, TOKYO)).toBe('10/6 23:00')
  })

  test('reads a fixed offset the same way', () => {
    expect(clockText(Date.parse(FIVE_RESET), NOW, { offsetMinutes: 540 })).toBe('3:30')
    expect(clockText(Date.parse(FIVE_RESET), NOW, { offsetMinutes: -240 })).toBe('14:30')
  })

  test('says UTC when no zone could be read', () => {
    expect(clockText(Date.parse(FIVE_RESET), NOW, UTC_GUESS)).toBe('18:30 UTC')
  })
})

describe('zones', () => {
  test('reads the zone /etc/localtime points at, on macOS and on Linux', () => {
    expect(zoneFromPath('/var/db/timezone/zoneinfo/Asia/Tokyo')).toEqual(TOKYO)
    expect(zoneFromPath('/usr/share/zoneinfo/America/New_York')).toEqual({ name: 'America/New_York' })
    expect(zoneFromPath('/etc/localtime')).toBeNull()
  })

  test('takes TZ only when it names a zone', () => {
    expect(zoneFromName('Asia/Tokyo')).toEqual(TOKYO)
    expect(zoneFromName('Not/AZone')).toBeNull()
    expect(zoneFromName(undefined)).toBeNull()
  })

  test('reads the offset date +%z prints', () => {
    expect(zoneFromOffset('+0900\n')).toEqual({ offsetMinutes: 540 })
    expect(zoneFromOffset('-0330')).toEqual({ offsetMinutes: -210 })
    expect(zoneFromOffset('JST')).toBeNull()
  })
})

describe('bandPieces', () => {
  test('draws both windows with bars when there is room', () => {
    expect(textOf(bandPieces(readingOf(limits(62, 17)), NOW, TOKYO, 100))).toBe(
      '上限  5時間 █████░░░ 62%（3:30リセット）  週 █░░░░░░░ 17%（10/6 23:00リセット）',
    )
  })

  test('drops the bars on a narrower terminal, then the weekly window', () => {
    expect(textOf(bandPieces(readingOf(limits(62, 17)), NOW, TOKYO, 70))).toBe(
      '上限  5時間 62%（3:30リセット）  週 17%（10/6 23:00リセット）',
    )
    expect(textOf(bandPieces(readingOf(limits(62, 17)), NOW, TOKYO, 50))).toBe('上限  5時間 62%（3:30リセット）')
  })

  test('colors each window by how much of it is used', () => {
    const colors = bandPieces(readingOf(limits(92, 17)), NOW, TOKYO, 100).map(piece => piece.color)
    expect(colors.filter(color => color !== undefined)).toEqual(['error', 'success'])
  })

  test('shows the cost when the account reports no windows, as with an API key', () => {
    expect(textOf(bandPieces(readingOf([], 0.4213), NOW, TOKYO, 100))).toBe('このセッションの料金 $0.42')
  })

  test('draws nothing before the first reading', () => {
    expect(bandPieces(readingOf([], 0), NOW, TOKYO, 100)).toEqual([])
  })
})

describe('toastsFor', () => {
  test('says nothing below 80%', () => {
    expect(toastsFor(readingOf(limits(79, 17)), NOW, TOKYO)).toEqual([])
  })

  test('names the highest threshold passed, with the reset time', () => {
    expect(toastsFor(readingOf(limits(85, 17)), NOW, TOKYO).map(toast => toast.text)).toEqual([
      '5時間枠の80%を超えました。3:30にリセットされます',
    ])
    expect(toastsFor(readingOf(limits(96, 91)), NOW, TOKYO).map(toast => toast.text)).toEqual([
      '5時間枠の95%を超えました。3:30にリセットされます',
      '週の枠の90%を超えました。10/6 23:00にリセットされます',
    ])
  })

  test('keys each toast to its reset, so a new window can toast again', () => {
    const [toast] = toastsFor(readingOf(limits(85, 17)), NOW, TOKYO)
    expect(toast.key).toBe(`five:80:${Date.parse(FIVE_RESET)}`)
  })
})

describe('noteFor', () => {
  test('stays quiet below 90% of the 5-hour window and 95% of the week', () => {
    expect(noteFor(readingOf(limits(89, 94)), NOW, TOKYO)).toBeNull()
  })

  test('tells Claude which window is near and when it resets', () => {
    const note = noteFor(readingOf(limits(92, 17)), NOW, TOKYO)
    expect(note).toContain('5時間枠は92%使用、3:30にリセット')
    expect(note).not.toContain('週の枠')
    expect(note).toContain('書き換える前に、区切り方を短く提案して、ユーザーの返事を待ってください')
  })

  test('lists both windows when both are near', () => {
    expect(noteFor(readingOf(limits(92, 96)), NOW, TOKYO)).toContain(
      '5時間枠は92%使用、3:30にリセット／週の枠は96%使用、10/6 23:00にリセット',
    )
  })
})

describe('demoLimits', () => {
  test('reads LIMIT_METER_DEMO as the two percentages, keeping the reset times', () => {
    expect(demoLimits(limits(3, 17), '92,40')).toEqual(limits(92, 40))
    expect(demoLimits(limits(3, 17), '85')).toEqual(limits(85, 17))
  })

  test('keeps the real figures when it is unset or unreadable', () => {
    expect(demoLimits(limits(3, 17), undefined)).toEqual(limits(3, 17))
    expect(demoLimits(limits(3, 17), 'high')).toEqual(limits(3, 17))
  })
})
