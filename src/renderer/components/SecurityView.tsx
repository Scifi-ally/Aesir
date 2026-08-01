import React, { useState } from 'react'
import { Shield, AlertTriangle, Lock, FileCode, CheckCircle2, Info } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Loading, Empty, ErrorState } from './ui'

interface SecurityViewProps {
  owner: string
  repo: string
}

export function SecurityView({ owner, repo }: SecurityViewProps): React.JSX.Element {
  const [subTab, setSubTab] = useState<'dependabot' | 'code' | 'secret'>('dependabot')

  // Dependabot Alerts Query
  const { data: dependabotAlerts = [], isLoading: loadingDep, error: errDep } = useQuery({
    queryKey: ['github', 'dependabotAlerts', owner, repo],
    queryFn: async () => {
      try {
        const res = await window.devhub.github.request(`/repos/${owner}/${repo}/dependabot/alerts?state=open&per_page=50`)
        return res.data || []
      } catch (err: any) {
        if (err.message?.includes('404') || err.message?.includes('403')) return null
        throw err
      }
    }
  })

  // Code Scanning Alerts Query
  const { data: codeScanningAlerts = [], isLoading: loadingCode } = useQuery({
    queryKey: ['github', 'codeScanningAlerts', owner, repo],
    queryFn: async () => {
      try {
        const res = await window.devhub.github.request(`/repos/${owner}/${repo}/code-scanning/alerts?state=open&per_page=50`)
        return res.data || []
      } catch (err: any) {
        return null
      }
    }
  })

  // Secret Scanning Alerts Query
  const { data: secretScanningAlerts = [], isLoading: loadingSecret } = useQuery({
    queryKey: ['github', 'secretScanningAlerts', owner, repo],
    queryFn: async () => {
      try {
        const res = await window.devhub.github.request(`/repos/${owner}/${repo}/secret-scanning/alerts?state=open&per_page=50`)
        return res.data || []
      } catch (err: any) {
        return null
      }
    }
  })

  return (
    <div className="flex flex-col gap-6 text-xs text-[#c9d1d9] font-sans pb-16">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#30363d] pb-3">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-[#3fb950]" />
          <h2 className="text-base font-semibold text-[#f0f6fc]">Security & Vulnerabilities</h2>
        </div>

        <div className="flex border border-[#30363d] rounded overflow-hidden">
          <button
            onClick={() => setSubTab('dependabot')}
            className={`px-3 py-1 text-xs transition-colors font-mono ${subTab === 'dependabot' ? 'bg-[#30363d] text-white' : 'text-[#8b949e]'}`}
          >
            Dependabot Alerts
          </button>
          <button
            onClick={() => setSubTab('code')}
            className={`px-3 py-1 text-xs transition-colors font-mono ${subTab === 'code' ? 'bg-[#30363d] text-white' : 'text-[#8b949e]'}`}
          >
            Code Scanning
          </button>
          <button
            onClick={() => setSubTab('secret')}
            className={`px-3 py-1 text-xs transition-colors font-mono ${subTab === 'secret' ? 'bg-[#30363d] text-white' : 'text-[#8b949e]'}`}
          >
            Secret Scanning
          </button>
        </div>
      </div>

      {/* Dependabot Tab */}
      {subTab === 'dependabot' && (
        <div>
          {loadingDep ? (
            <Loading what="Checking Dependabot Alerts..." />
          ) : dependabotAlerts === null ? (
            <Empty title="Dependabot Alerts Not Enabled" hint="Dependabot alerts are either disabled or require administrative privileges on this repository." />
          ) : dependabotAlerts.length === 0 ? (
            <div className="p-8 bg-[#0d1117] border border-[#238636]/40 rounded-lg text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-[#3fb950] mx-auto" />
              <div className="font-semibold text-sm text-[#f0f6fc]">0 Open Vulnerabilities</div>
              <div className="text-xs text-[#8b949e]">Dependabot found no open security advisories for your dependencies.</div>
            </div>
          ) : (
            <div className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden divide-y divide-[#30363d]/40">
              {dependabotAlerts.map((alert: any) => {
                const severity = alert.security_advisory?.severity || 'medium'
                return (
                  <div key={alert.number} className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${
                        severity === 'critical' || severity === 'high' ? 'text-[#f85149]' : 'text-[#e3b341]'
                      }`} />
                      <div>
                        <div className="font-semibold text-xs text-[#f0f6fc]">
                          {alert.security_advisory?.summary || alert.dependency?.package?.name}
                        </div>
                        <div className="text-[11px] text-[#8b949e] font-mono mt-1">
                          Package: {alert.dependency?.package?.name} · Ecosystem: {alert.dependency?.package?.ecosystem}
                        </div>
                      </div>
                    </div>

                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-mono uppercase font-semibold border ${
                      severity === 'critical' ? 'bg-[#da3633]/20 border-[#f85149] text-[#f85149]' : 'bg-[#d29922]/20 border-[#e3b341] text-[#e3b341]'
                    }`}>
                      {severity}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Code Scanning Tab */}
      {subTab === 'code' && (
        <div>
          {codeScanningAlerts === null ? (
            <Empty title="GitHub Advanced Security Code Scanning Unavailable" hint="Code scanning requires GitHub Advanced Security to be configured for this repository." />
          ) : codeScanningAlerts.length === 0 ? (
            <Empty title="No Code Scanning Alerts" hint="CodeQL or third-party code scanners report no open alerts." />
          ) : (
            <div className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden divide-y divide-[#30363d]/40">
              {codeScanningAlerts.map((alt: any) => (
                <div key={alt.number} className="p-4 flex items-center justify-between font-mono text-xs">
                  <div>
                    <div className="font-semibold text-[#f0f6fc]">{alt.rule?.description || alt.rule?.id}</div>
                    <div className="text-[11px] text-[#8b949e]">{alt.most_recent_instance?.location?.path}</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#30363d] text-[#c9d1d9]">
                    {alt.rule?.severity || 'warning'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Secret Scanning Tab */}
      {subTab === 'secret' && (
        <div>
          {secretScanningAlerts === null ? (
            <Empty title="Secret Scanning Unavailable" hint="Secret scanning requires GitHub Advanced Security or repository owner permissions." />
          ) : secretScanningAlerts.length === 0 ? (
            <Empty title="No Secrets Leaked" hint="No exposed API keys or tokens detected in the codebase." />
          ) : (
            <div className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden divide-y divide-[#30363d]/40">
              {secretScanningAlerts.map((sec: any) => (
                <div key={sec.number} className="p-4 flex items-center justify-between font-mono text-xs">
                  <div>
                    <div className="font-semibold text-[#f85149]">{sec.secret_type_display_name}</div>
                    <div className="text-[11px] text-[#8b949e]">Exposed on {new Date(sec.created_at).toLocaleDateString()}</div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#da3633]/20 text-[#f85149] border border-[#f85149]/40 font-semibold">
                    {sec.state}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
