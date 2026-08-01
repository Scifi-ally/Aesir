import React, { useEffect, useState } from 'react'
import { Activity, ShieldAlert } from 'lucide-react'

export function RateLimitBadge(): React.JSX.Element {
  const [rateLimit, setRateLimit] = useState<{ rest: any; graphql: any } | null>(null)

  const fetchQuota = async () => {
    try {
      if (window.devhub?.github?.getRateLimit) {
        const info = await window.devhub.github.getRateLimit()
        setRateLimit(info)
      }
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    fetchQuota()
    const timer = setInterval(fetchQuota, 10000)
    return () => clearInterval(timer)
  }, [])

  if (!rateLimit) return <div className="text-xs text-[#8b949e]">Quota: --</div>

  const restRemaining = rateLimit.rest?.remaining ?? 5000
  const restLimit = rateLimit.rest?.limit ?? 5000
  const isLow = restRemaining < 100

  return (
    <div className={`flex items-center gap-2 px-2.5 py-1 rounded text-xs border font-mono ${
      isLow ? 'bg-[#3d1308] border-[#f78166] text-[#f78166]' : 'bg-[#161b22] border-[#30363d] text-[#8b949e]'
    }`}>
      {isLow ? <ShieldAlert className="w-3.5 h-3.5 text-[#f78166]" /> : <Activity className="w-3.5 h-3.5 text-[#58a6ff]" />}
      <span>REST: <strong className={isLow ? 'text-[#f78166]' : 'text-[#c9d1d9]'}>{restRemaining}</strong>/{restLimit}</span>
      <span className="text-[#30363d]">|</span>
      <span>GQL: <strong className="text-[#c9d1d9]">{rateLimit.graphql?.remaining ?? 5000}</strong></span>
    </div>
  )
}
