/**
 * The single timestamp formatter (ui-spec §9): "20 Oct 2026 09:15" in Asia/Bangkok, whatever the machine's zone.
 * Bangkok has no daylight saving, so the datetime-local helpers can use a fixed +07:00 offset.
 */
const FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Bangkok',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const OFFSET_MS = 7 * 60 * 60 * 1000

export function formatBangkok(iso: string) {
  const part = Object.fromEntries(FORMAT.formatToParts(new Date(iso)).map(({ type, value }) => [type, value]))
  return `${part.day} ${part.month} ${part.year} ${part.hour}:${part.minute}`
}

/** An instant as the value of an `<input type="datetime-local">` showing Bangkok time ("2026-10-20T00:15"). */
export const toBangkokInput = (iso: string) => new Date(new Date(iso).getTime() + OFFSET_MS).toISOString().slice(0, 16)

/** A datetime-local value back to ISO-8601 with the Bangkok offset the API requires (BR-06). */
export const fromBangkokInput = (local: string) => `${local}:00+07:00`

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' })

/** "2 hr. ago" — shown only beside the absolute time, never instead of it (ui-spec §9). */
export function timeAgo(iso: string) {
  const minutes = Math.round((Date.parse(iso) - Date.now()) / 60_000)
  if (Math.abs(minutes) < 60) return RELATIVE.format(minutes, 'minute')
  if (Math.abs(minutes) < 60 * 24) return RELATIVE.format(Math.round(minutes / 60), 'hour')
  return RELATIVE.format(Math.round(minutes / (60 * 24)), 'day')
}

/** "Updated 11:00 (Bangkok)": when a dashboard's numbers were counted (BR-49). */
export const updatedAt = (iso: string) => `Updated ${formatBangkok(iso).slice(-5)} (Bangkok)`

/** The date part of the same format, "20 Oct 2026", for list columns that show a day, not a moment. */
export function formatBangkokDate(iso: string) {
  const part = Object.fromEntries(FORMAT.formatToParts(new Date(iso)).map(({ type, value }) => [type, value]))
  return `${part.day} ${part.month} ${part.year}`
}
