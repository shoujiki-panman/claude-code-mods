/**
 * The person's time zone. A mod runs on UTC whatever the machine's zone, so
 * the band reads the machine's zone (an IANA name, or else its offset) and
 * formats each reset time in it.
 */
export type Zone = { name: string } | { offsetMinutes: number; isGuess?: true }

/** Where no zone could be read: UTC, and the band says so. */
export const UTC_GUESS: Zone = { offsetMinutes: 0, isGuess: true }

const MINUTE = 60 * 1000

/** The zone named `name` (`Asia/Tokyo`), or null when Intl does not know it. */
export function zoneFromName(name: string | undefined): Zone | null {
  if (name === undefined || name.trim() === '' || name.startsWith(':')) return null
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name.trim() })
  } catch {
    return null
  }

  return { name: name.trim() }
}

/**
 * The zone `/etc/localtime` points at: `/var/db/timezone/zoneinfo/Asia/Tokyo`
 * on macOS, `/usr/share/zoneinfo/Asia/Tokyo` on Linux.
 */
export function zoneFromPath(realPath: string | undefined): Zone | null {
  const match = realPath?.match(/zoneinfo(?:\.default)?\/(.+)$/)

  return match === null || match === undefined ? null : zoneFromName(match[1])
}

/** The zone `date +%z` printed (`+0900`, `-0330`), as a fixed offset. */
export function zoneFromOffset(text: string): Zone | null {
  const match = text.trim().match(/^([+-])(\d{2}):?(\d{2})$/)
  if (match === null) return null
  const minutes = Number(match[2]) * 60 + Number(match[3])

  return { offsetMinutes: match[1] === '-' ? -minutes : minutes }
}

/** Month, day, hour and minute of `at` in `zone`. */
export function partsOf(at: number, zone: Zone) {
  if ('name' in zone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone.name,
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(at))
    const part = (type: string) => Number(parts.find(each => each.type === type)?.value)

    return { month: part('month'), day: part('day'), hour: part('hour'), minute: part('minute') }
  }
  const shifted = new Date(at + zone.offsetMinutes * MINUTE)

  return {
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  }
}
