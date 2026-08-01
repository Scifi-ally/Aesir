import { useState } from 'react'
import type { MailProvider } from '@shared/types'
import { Button, InlineError, Input, Label } from '../../components/ui'

/**
 * Collects the user's *own* OAuth client. Nothing here fakes a connected
 * state: saving the client only stores it, and the next step runs the real
 * authorization-code flow in the system browser.
 */
export default function SetupWizard({
  provider,
  configured,
  onSaved,
  onConnect,
  busy
}: {
  provider: MailProvider
  configured: boolean
  onSaved: () => void
  onConnect: () => void
  busy: boolean
}): React.JSX.Element {
  const gmail = provider === 'gmail'
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [tenant, setTenant] = useState('common')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = (): void => {
    setError(null)
    if (!clientId.trim()) return setError('client id is required')
    setSaving(true)
    window.devhub.mail
      .saveClient(provider, {
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim() || undefined,
        tenant: gmail ? undefined : tenant.trim() || 'common'
      })
      .then(() => {
        setClientId('')
        setClientSecret('')
        onSaved()
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setSaving(false))
  }

  return (
    <div className="mx-auto max-w-[68ch] px-8 py-10">
      <div style={{ color: 'var(--fg-0)' }}>
        {gmail ? 'Gmail' : 'Outlook'} — one-time OAuth client setup
      </div>
      <p className="mt-2" style={{ color: 'var(--fg-2)' }}>
        DevHub has no cloud backend, so it cannot ship an OAuth client of its own. Create one in
        your{' '}
        <button
          className="underline"
          style={{ color: 'var(--accent)' }}
          onClick={() =>
            void window.devhub.app.openExternal(
              gmail
                ? 'https://console.cloud.google.com/apis/credentials'
                : 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade'
            )
          }
        >
          {gmail ? 'Google Cloud Console' : 'Azure Portal'}
        </button>{' '}
        and paste it here. It stays on this machine, encrypted by the OS.
      </p>

      <ol className="mt-4 flex flex-col gap-1" style={{ color: 'var(--fg-1)' }}>
        {gmail ? (
          <>
            <li>1 · APIs &amp; Services → Enable the Gmail API</li>
            <li>2 · OAuth consent screen → External → add your own address as a test user</li>
            <li>
              3 · Credentials → Create credentials → OAuth client ID → application type{' '}
              <span style={{ color: 'var(--accent)' }}>Desktop app</span>
            </li>
            <li>4 · Copy the client ID and client secret below</li>
          </>
        ) : (
          <>
            <li>1 · App registrations → New registration</li>
            <li>
              2 · Redirect URI → platform{' '}
              <span style={{ color: 'var(--accent)' }}>Mobile and desktop applications</span> → check
              the <code>http://localhost</code> entry
            </li>
            <li>3 · API permissions → Microsoft Graph → delegated → Mail.ReadWrite, Mail.Send</li>
            <li>4 · Copy the Application (client) ID below</li>
          </>
        )}
      </ol>

      <div className="mt-6 flex flex-col gap-3">
        <div>
          <Label>client id</Label>
          <Input
            value={clientId}
            onChange={setClientId}
            placeholder={gmail ? '…apps.googleusercontent.com' : '00000000-0000-0000-0000-…'}
          />
        </div>
        {gmail ? (
          <div>
            <Label>client secret</Label>
            <Input
              value={clientSecret}
              onChange={setClientSecret}
              type="password"
              placeholder="GOCSPX-…"
            />
            <div className="mt-1" style={{ color: 'var(--fg-2)' }}>
              Google desktop clients are issued a secret and the token endpoint requires it.
            </div>
          </div>
        ) : (
          <div>
            <Label>tenant</Label>
            <Input value={tenant} onChange={setTenant} placeholder="common" />
            <div className="mt-1" style={{ color: 'var(--fg-2)' }}>
              <code>common</code> works for personal and work accounts; use a tenant GUID if your
              registration is single-tenant.
            </div>
          </div>
        )}

        {error && <InlineError message={error} />}

        <div className="flex gap-2">
          <Button kind="accent" onClick={save} disabled={saving}>
            {saving ? 'saving…' : configured ? 'replace client' : 'save client'}
          </Button>
          {configured && (
            <Button onClick={onConnect} disabled={busy}>
              {busy ? 'waiting for the browser…' : 'connect an account'}
            </Button>
          )}
        </div>
        {configured && (
          <div style={{ color: 'var(--fg-2)' }}>
            A client is already stored for {gmail ? 'Gmail' : 'Outlook'}. Connecting opens your
            system browser and returns to <code>http://127.0.0.1:&lt;random port&gt;/callback</code>.
          </div>
        )}
      </div>
    </div>
  )
}
