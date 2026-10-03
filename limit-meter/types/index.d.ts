/** One rate-limit window: how much of it is used, and when it resets (ms). */
export type LimitMeterWindow = { percent: number; resetsAt: number | null }

/** The last reading: the 5-hour and weekly windows, or the cost off a subscription. */
export type LimitMeterReading = {
  five: LimitMeterWindow | null
  week: LimitMeterWindow | null
  usd: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'limit-meter': { reading: LimitMeterReading | null }
  }
}
