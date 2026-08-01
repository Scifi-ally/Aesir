import React, { useState } from 'react'
import { FileCode, Plus, Minus, FileText } from 'lucide-react'

export interface FileDiffItem {
  filename: string
  status: 'added' | 'removed' | 'modified' | 'renamed' | string
  additions: number
  deletions: number
  changes: number
  patch?: string
}

interface DiffViewerProps {
  files: FileDiffItem[]
  onAddInlineComment?: (filename: string, line: number) => void
}

export function DiffViewer({ files, onAddInlineComment }: DiffViewerProps): React.JSX.Element {
  const [splitView, setSplitView] = useState(false)

  if (!files || files.length === 0) {
    return <div className="p-8 text-center text-[#8b949e]">No file changes in this diff.</div>
  }

  return (
    <div className="flex flex-col gap-4 text-xs text-[#c9d1d9] font-sans">
      {/* Diff Controls Header */}
      <div className="flex items-center justify-between bg-[#161b22] px-4 py-2 rounded-lg border border-[#30363d]">
        <span className="font-semibold text-xs text-[#8b949e] uppercase tracking-wider">
          {files.length} changed {files.length === 1 ? 'file' : 'files'}
        </span>

        <div className="flex border border-[#30363d] rounded overflow-hidden">
          <button
            onClick={() => setSplitView(false)}
            className={`px-3 py-1 text-xs font-mono transition-colors ${!splitView ? 'bg-[#30363d] text-white' : 'text-[#8b949e] hover:text-white'}`}
          >
            Unified
          </button>
          <button
            onClick={() => setSplitView(true)}
            className={`px-3 py-1 text-xs font-mono transition-colors ${splitView ? 'bg-[#30363d] text-white' : 'text-[#8b949e] hover:text-white'}`}
          >
            Split
          </button>
        </div>
      </div>

      {/* File Diffs List */}
      <div className="space-y-4">
        {files.map((file) => (
          <div key={file.filename} className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden">
            {/* File Header */}
            <div className="bg-[#161b22] px-4 py-2.5 border-b border-[#30363d] flex items-center justify-between font-mono text-xs">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-[#58a6ff]" />
                <span className="font-semibold text-[#f0f6fc]">{file.filename}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono uppercase ${
                  file.status === 'added' ? 'bg-[#238636]/20 text-[#3fb950]' : file.status === 'removed' ? 'bg-[#da3633]/20 text-[#f85149]' : 'bg-[#d29922]/20 text-[#e3b341]'
                }`}>
                  {file.status}
                </span>
              </div>

              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-[#3fb950]">+{file.additions}</span>
                <span className="text-[#f85149]">-{file.deletions}</span>
              </div>
            </div>

            {/* Patch Lines Diff Render */}
            <div className="p-0 overflow-x-auto bg-[#000000] font-mono text-xs leading-relaxed">
              {file.patch ? (
                <PatchLines patch={file.patch} splitView={splitView} filename={file.filename} onAddInlineComment={onAddInlineComment} />
              ) : (
                <div className="p-4 text-center text-[#8b949e] italic">Binary or large file hidden.</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PatchLines({ patch, splitView, filename, onAddInlineComment }: { patch: string; splitView: boolean; filename: string; onAddInlineComment?: (filename: string, line: number) => void }) {
  const lines = patch.split('\n')
  let oldLine = 0
  let newLine = 0

  return (
    <div className="divide-y divide-[#30363d]/10">
      {lines.map((line, idx) => {
        if (line.startsWith('@@')) {
          const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
          if (match) {
            oldLine = parseInt(match[1], 10) - 1
            newLine = parseInt(match[2], 10) - 1
          }
          return (
            <div key={idx} className="bg-[#161b22]/70 px-4 py-1 text-[#8b949e] italic text-[11px] font-mono border-y border-[#30363d]/40">
              {line}
            </div>
          )
        }

        const isAdd = line.startsWith('+')
        const isDel = line.startsWith('-')

        if (isAdd) newLine++
        else if (isDel) oldLine++
        else {
          oldLine++
          newLine++
        }

        const currentLineNum = isDel ? oldLine : newLine

        return (
          <div
            key={idx}
            className={`flex items-start group hover:bg-[#161b22]/40 transition-colors ${
              isAdd ? 'bg-[#238636]/15 text-[#e6edf3]' : isDel ? 'bg-[#da3633]/15 text-[#e6edf3]' : 'text-[#c9d1d9]'
            }`}
          >
            {/* Line Numbers */}
            <div className="w-12 py-0.5 pr-2 text-right select-none text-[#484f58] bg-[#0d1117]/60 border-r border-[#30363d]/30 text-[11px]">
              {!isAdd ? oldLine : ''}
            </div>
            <div className="w-12 py-0.5 pr-2 text-right select-none text-[#484f58] bg-[#0d1117]/60 border-r border-[#30363d]/30 text-[11px]">
              {!isDel ? newLine : ''}
            </div>

            {/* Comment Trigger Button */}
            {onAddInlineComment && (
              <button
                onClick={() => onAddInlineComment(filename, currentLineNum)}
                className="opacity-0 group-hover:opacity-100 px-1 text-[#58a6ff] hover:text-white transition-opacity text-[10px]"
                title="Add comment on this line"
              >
                +
              </button>
            )}

            {/* Code Line */}
            <div className="px-4 py-0.5 whitespace-pre flex-1 font-mono text-[12px]">
              {line}
            </div>
          </div>
        )
      })}
    </div>
  )
}
