import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

export function ThinkingAnimation({ active = true }: { active?: boolean }) {
  // 11x11 grid
  const gridSize = 11
  const center = Math.floor(gridSize / 2) // 5

  const dots = Array.from({ length: gridSize * gridSize }, (_, i) => {
    const x = i % gridSize
    const y = Math.floor(i / gridSize)
    const manhattanDistance = Math.abs(x - center) + Math.abs(y - center)
    return { x, y, manhattanDistance, id: i }
  })

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <div 
        className="grid gap-[3px]"
        style={{ 
          gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
          width: 'max-content'
        }}
      >
        {dots.map(dot => {
          // Ring is max 4 according to their code, but we can just use manhattanDistance directly
          const ring = Math.min(4, dot.manhattanDistance)
          const delay = ring * 0.15
          
          return (
            <motion.div
              key={dot.id}
              className="w-1.5 h-1.5 rounded-full bg-[#4285f4]"
              animate={
                active 
                  ? { 
                      scale: [0.5, 1.2, 0.5],
                      opacity: [0.2, 1, 0.2]
                    } 
                  : {
                      scale: 0.5,
                      opacity: 0.2 + (1 - ring / 4) * 0.72
                    }
              }
              transition={
                active 
                  ? {
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: delay
                    }
                  : { duration: 0.3 }
              }
            />
          )
        })}
      </div>
      <div className="mt-4 text-xs font-mono text-[#a1a1aa] uppercase tracking-widest animate-pulse">
        Thinking
      </div>
    </div>
  )
}
