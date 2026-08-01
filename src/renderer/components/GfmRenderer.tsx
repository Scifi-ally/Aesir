import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { Copy, Check } from 'lucide-react'

interface GfmRendererProps {
  content: string
  owner?: string
  repo?: string
  defaultBranch?: string
  className?: string
}

export function GfmRenderer({ content, owner, repo, defaultBranch = 'main', className = '' }: GfmRendererProps): React.JSX.Element {
  const processMentionsAndIssues = (text: string) => {
    // We handle markdown image alignment sanitization first
    return text.replace(/valign=/gi, 'data-valign=').replace(/align=/gi, 'data-align=')
  }

  const processedContent = processMentionsAndIssues(content || '')

  return (
    <div className={`prose prose-invert prose-sm max-w-none text-[#c9d1d9] font-sans ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          img: ({ node, src, alt, ...props }: any) => {
            let fullSrc = src || ''
            if (fullSrc && !fullSrc.startsWith('http') && !fullSrc.startsWith('data:') && owner && repo) {
              const cleanPath = fullSrc.replace(/^\.\//, '')
              fullSrc = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${cleanPath}`
            }
            return (
              <img
                src={fullSrc}
                alt={alt || ''}
                className="max-w-full rounded border border-[#30363d]/50 my-2 inline-block"
                {...props}
              />
            )
          },
          a: ({ node, href, children, ...props }: any) => {
            const isExternal = href?.startsWith('http') || href?.startsWith('https')
            const handleClick = (e: React.MouseEvent) => {
              if (isExternal && window.devhub?.app?.openExternal) {
                e.preventDefault()
                window.devhub.app.openExternal(href)
              }
            }
            return (
              <a
                href={href}
                onClick={handleClick}
                className="text-[#58a6ff] hover:underline cursor-pointer"
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                {...props}
              >
                {children}
              </a>
            )
          },
          pre: ({ node, children, ...props }: any) => {
            return (
              <div className="relative group my-3 rounded-md overflow-hidden border border-[#30363d] bg-[#0d1117]">
                <pre className="p-4 overflow-x-auto font-mono text-[12.5px] leading-relaxed text-[#c9d1d9] bg-[#0d1117] m-0" {...props}>
                  {children}
                </pre>
              </div>
            )
          },
          code: ({ node, inline, className: codeClassName, children, ...props }: any) => {
            if (inline) {
              return (
                <code className="bg-[#161b22] border border-[#30363d]/60 px-1.5 py-0.5 rounded text-[12px] font-mono text-[#e6edf3]" {...props}>
                  {children}
                </code>
              )
            }
            return <code className={codeClassName} {...props}>{children}</code>
          },
          table: ({ node, children, ...props }: any) => {
            return (
              <div className="overflow-x-auto my-4 border border-[#30363d] rounded-md">
                <table className="w-full border-collapse text-left text-xs" {...props}>
                  {children}
                </table>
              </div>
            )
          },
          thead: ({ node, children, ...props }: any) => {
            return <thead className="bg-[#161b22] border-b border-[#30363d] text-[#c9d1d9] font-semibold" {...props}>{children}</thead>
          },
          th: ({ node, children, ...props }: any) => {
            return <th className="px-4 py-2 border-r border-[#30363d] last:border-r-0 font-semibold" {...props}>{children}</th>
          },
          td: ({ node, children, ...props }: any) => {
            return <td className="px-4 py-2 border-t border-[#30363d]/50 border-r border-[#30363d]/50 last:border-r-0 text-[#c9d1d9]" {...props}>{children}</td>
          },
          blockquote: ({ node, children, ...props }: any) => {
            return (
              <blockquote className="border-l-4 border-[#30363d] pl-4 py-1 my-3 text-[#8b949e] italic" {...props}>
                {children}
              </blockquote>
            )
          },
          hr: ({ node, ...props }: any) => {
            return <hr className="border-t border-[#30363d] my-6" {...props} />
          }
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  )
}
