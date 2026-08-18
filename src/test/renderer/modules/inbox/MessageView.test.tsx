import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MessageView from '../../../../renderer/modules/inbox/MessageView'

vi.mock('../../../../renderer/state', () => ({
  useApp: () => ({ toast: vi.fn() }),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const body = (id: string, text: string) => ({
  id,
  threadId: id,
  accountId: 'gmail:user@example.com',
  subject: `Subject ${id}`,
  from: 'Sender <sender@example.com>',
  to: 'user@example.com',
  date: Date.now(),
  html: null,
  text,
})

describe('MessageView', () => {
  it('ignores a stale body response after the selected message changes', async () => {
    const first = deferred<ReturnType<typeof body>>()
    const second = deferred<ReturnType<typeof body>>()
    const bodyMock = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    window.devhub = {
      mail: {
        body: bodyMock,
        markRead: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as typeof window.devhub

    const { rerender } = render(
      <MessageView
        header={{ id: 'first', accountId: 'gmail:user@example.com', threadId: 'first', subject: 'First', from: 'Sender', to: 'User', snippet: '', date: Date.now(), unread: false, labels: [] }}
        accountColors={[]}
      />,
    )

    rerender(
      <MessageView
        header={{ id: 'second', accountId: 'gmail:user@example.com', threadId: 'second', subject: 'Second', from: 'Sender', to: 'User', snippet: '', date: Date.now(), unread: false, labels: [] }}
        accountColors={[]}
      />,
    )

    first.resolve(body('first', 'stale first body'))
    second.resolve(body('second', 'current second body'))

    await waitFor(() => expect(screen.getByText('current second body')).toBeInTheDocument())
    expect(screen.queryByText('stale first body')).not.toBeInTheDocument()
  })
})
