import { ROLE_LABELS, type Role } from '../lib/roles'
import { formatBangkok } from '../lib/formatBangkok'

export type TicketMessage = {
  id: number
  visibility: 'PUBLIC' | 'INTERNAL'
  body: string
  isSystem: boolean
  author: { id: number; fullName: string; role: Role }
  createdAt: string
}


/**
 * Message cards for one visibility, oldest first as the API returns them (ui-spec §12). Bodies render as text with
 * pre-wrap, never as markup (BR-45). Every Internal Note carries a lock on its author line (ui-spec §8.3).
 */
export default function MessageList({ messages, emptyText }: { messages: TicketMessage[]; emptyText: string }) {
  if (messages.length === 0) return <p className="zen-help">{emptyText}</p>

  return (
    <ol className="list-unstyled mb-0">
      {messages.map((message) => (
        <li key={message.id} className="zen-message">
          <p className="zen-message-meta">
            {message.visibility === 'INTERNAL' && (
              <>
                <span aria-hidden="true">🔒 </span>
                <span className="visually-hidden">Internal note: </span>
              </>
            )}
            <strong>{message.author.fullName}</strong> · {ROLE_LABELS[message.author.role]} ·{' '}
            <time dateTime={message.createdAt}>{formatBangkok(message.createdAt)}</time>
            {message.isSystem && ' · System message'}
          </p>
          <p className="zen-message-body">{message.body}</p>
        </li>
      ))}
    </ol>
  )
}
