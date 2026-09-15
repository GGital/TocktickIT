import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Callout from './Callout'
import MessageComposer from './MessageComposer'
import MessageList, { type TicketMessage } from './MessageList'
import { SkeletonRows } from './Skeleton'
import { apiFetch } from '../lib/apiClient'

type ConversationProps = {
  ticketId: number
  visibility: 'PUBLIC' | 'INTERNAL'
  /** The landmark name, which carries the panel's meaning without relying on colour (ui-spec §11). */
  label: string
  heading: ReactNode
  emptyText: string
  loadingLabel: string
  loadFailure: string
  className?: string
  /** Changing it reloads the list — after an action that appends a message elsewhere, such as the resolution flag. */
  refreshKey?: unknown
  /** Rendered after the composer, inside the same panel. */
  children?: ReactNode
}

/**
 * One message thread for one visibility, with its own loading, failure, and composer (ui-spec §6.1, §8.3). Public
 * and Internal are always separate instances: they never share a container or a list.
 */
export default function Conversation({
  ticketId,
  visibility,
  label,
  heading,
  emptyText,
  loadingLabel,
  loadFailure,
  className = '',
  refreshKey,
  children,
}: ConversationProps) {
  const internal = visibility === 'INTERNAL'
  const path = internal ? `/staff/tickets/${ticketId}/internal-notes` : `/tickets/${ticketId}/comments`
  const [messages, setMessages] = useState<TicketMessage[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    setFailed(false)
    setMessages(null)
    apiFetch<TicketMessage[]>(path)
      .then(setMessages)
      .catch(() => setFailed(true))
  }, [path])

  useEffect(load, [load, refreshKey])

  const post = async (body: string) => {
    const created = await apiFetch<TicketMessage>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    setMessages((current) => [...(current ?? []), created])
  }

  return (
    <section className={`zen-card mt-4 ${className}`.trim()} aria-label={label}>
      <h2>{heading}</h2>

      {failed ? (
        <Callout variant="error" onRetry={load}>
          {loadFailure}
        </Callout>
      ) : messages === null ? (
        <SkeletonRows rows={3} label={loadingLabel} />
      ) : (
        <MessageList messages={messages} emptyText={emptyText} />
      )}

      <MessageComposer
        id={internal ? 'internalNote' : 'publicComment'}
        visibility={visibility}
        postLabel={internal ? 'Post note' : 'Post comment'}
        failureMessage={internal ? 'The note could not be posted.' : 'The comment could not be posted.'}
        disabled={messages === null}
        onPost={post}
      />

      {children}
    </section>
  )
}
