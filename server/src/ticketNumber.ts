/**
 * Ticket Number generation (BR-03, A-10). The year is the calendar year in
 * Asia/Bangkok, not UTC: a ticket created at 00:30 Bangkok on 1 January must not
 * carry the previous year just because UTC has not rolled over yet.
 */
const bangkokYearFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
})

export const bangkokYear = (instant: Date = new Date()) =>
  Number(bangkokYearFormat.format(instant))

/** `TKT-YYYY-NNNNNN`, zero-padded to six digits. */
export const formatTicketNumber = (year: number, sequence: number) =>
  `TKT-${year}-${String(sequence).padStart(6, '0')}`
