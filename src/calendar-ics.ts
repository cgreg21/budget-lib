/*
 * calendar-ics.ts — a transaction as an iCalendar event, and back.
 *
 * Each transaction is one all-day VEVENT, so it shows up in any calendar
 * application. The budget-specific fields travel in X-BUDGET-* properties; an
 * event without them is not ours and is ignored.
 */
import type { Transaction, TransactionKind } from './transaction.js'

export const UID_SUFFIX = '@budget'

const FOLD_AT = 70
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c))
}

function fold(line: string): string {
  const chars = Array.from(line)
  if (chars.length <= FOLD_AT) return line
  const parts: string[] = []
  for (let i = 0; i < chars.length; i += FOLD_AT) parts.push(chars.slice(i, i + FOLD_AT).join(''))
  return parts.join('\r\n ')
}

function compactDate(isoDate: string): string {
  return isoDate.replace(/-/g, '')
}

function nextDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1))
  return next.toISOString().slice(0, 10)
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** The iCalendar text of a transaction. `now` only feeds DTSTAMP. */
export function transactionToIcs(transaction: Transaction, now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Budget//Transactions//FR',
    'BEGIN:VEVENT',
    `UID:${escapeText(transaction.id)}${UID_SUFFIX}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;VALUE=DATE:${compactDate(transaction.date)}`,
    `DTEND;VALUE=DATE:${compactDate(nextDay(transaction.date))}`,
    `SUMMARY:${escapeText(transaction.description)}`,
    `CATEGORIES:${escapeText(transaction.category)}`,
    `DESCRIPTION:${transaction.kind === 'income' ? '+' : '-'}${transaction.amount}`,
    'TRANSP:TRANSPARENT',
    `X-BUDGET-KIND:${transaction.kind}`,
    `X-BUDGET-AMOUNT:${transaction.amount}`,
  ]
  if (transaction.recurrenceId !== undefined) {
    lines.push(`X-BUDGET-RECURRENCE:${escapeText(transaction.recurrenceId)}`)
  }
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return `${lines.map(fold).join('\r\n')}\r\n`
}

interface Property {
  name: string
  params: string
  value: string
}

function unfold(text: string): string[] {
  return text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)
}

function parseLine(line: string): Property | null {
  const colon = line.indexOf(':')
  if (colon < 1) return null
  const head = line.slice(0, colon)
  const semi = head.indexOf(';')
  return {
    name: (semi < 0 ? head : head.slice(0, semi)).toUpperCase(),
    params: semi < 0 ? '' : head.slice(semi + 1).toUpperCase(),
    value: line.slice(colon + 1),
  }
}

function isoFromCompact(value: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(value)
  if (match === null) return null
  const iso = `${match[1]}-${match[2]}-${match[3]}`
  return ISO_DATE.test(iso) ? iso : null
}

/** The transaction an iCalendar text holds, or `null` when the event is not one of ours. */
export function icsToTransaction(ics: string): Transaction | null {
  let inEvent = false
  const props = new Map<string, Property>()
  for (const line of unfold(ics)) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true
      continue
    }
    if (line === 'END:VEVENT') break
    if (!inEvent) continue
    const prop = parseLine(line)
    if (prop !== null && !props.has(prop.name)) props.set(prop.name, prop)
  }

  const uid = props.get('UID')?.value
  const kind = props.get('X-BUDGET-KIND')?.value.trim()
  const amountText = props.get('X-BUDGET-AMOUNT')?.value.trim()
  const start = props.get('DTSTART')?.value.trim()
  if (uid === undefined || kind === undefined || amountText === undefined || start === undefined) return null
  if (kind !== 'income' && kind !== 'expense') return null

  const amount = Number(amountText)
  const date = isoFromCompact(start)
  if (!Number.isFinite(amount) || date === null) return null

  const rawId = unescapeText(uid)
  const id = rawId.endsWith(UID_SUFFIX) ? rawId.slice(0, -UID_SUFFIX.length) : rawId
  if (id === '') return null

  const recurrence = props.get('X-BUDGET-RECURRENCE')?.value
  const transaction: Transaction = {
    id,
    date,
    description: unescapeText(props.get('SUMMARY')?.value ?? ''),
    category: unescapeText(props.get('CATEGORIES')?.value ?? ''),
    kind: kind as TransactionKind,
    amount,
  }
  if (recurrence !== undefined && recurrence !== '') transaction.recurrenceId = unescapeText(recurrence)
  return transaction
}
