import type { Register } from 'claude-code'

import { maskContent } from './secrets'

// Rows that carry what a tool or a file handed over: what Claude reads, not what you typed.
const DOORS = new Set(['tool-result', 'tool-message', 'attachment'])

export const register: Register = on => {
  on('session.append', ($, e, next) => {
    if (!DOORS.has(e.door)) return next(e)
    const { content, count } = maskContent(e.message.content)
    if (count === 0) return next(e)
    $.ui.status(`${count}件の秘密の値を伏せました`)

    return next({ ...e, message: { ...e.message, content } })
  })
}
