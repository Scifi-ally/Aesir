import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

interface TypewriterHeaderProps {
  text: string
  subtitle?: string
  icon?: React.ReactNode
  speed?: number
  accentColor?: string
  resetKey?: any
}

export default function TypewriterHeader({
  text,
  subtitle,
  icon,
  speed = 40,
  resetKey
}: TypewriterHeaderProps): React.JSX.Element {
  const [displayedText, setDisplayedText] = useState('')

  useEffect(() => {
    setDisplayedText('')
    let i = 0

    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayedText(text.slice(0, i + 1))
        i++
      } else {
        clearInterval(timer)
      }
    }, speed)

    return () => clearInterval(timer)
  }, [text, speed, resetKey])

  return (
    <div className="flex items-center gap-4">
      {icon && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.1 }}
          className="w-8 h-8 flex items-center justify-center shrink-0"
        >
          {icon}
        </motion.div>
      )}
      <div className="flex flex-col overflow-hidden min-w-0">
        <h1 className="text-[#e4e4e7] text-[15px] font-medium tracking-wide whitespace-nowrap overflow-hidden flex items-center gap-1 font-sans">
          <span>{displayedText}</span>
        </h1>
        {subtitle && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="text-[#71717a] text-[11px] mt-0.5 font-mono uppercase tracking-widest opacity-80"
          >
            {subtitle}
          </motion.span>
        )}
      </div>
    </div>
  )
}
