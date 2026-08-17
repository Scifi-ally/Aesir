import {
  Activity,
  AlertTriangle,
  Check,
  ChevronRight,
  Diamond,
  GitBranch,
  Mail,
  Play,
  Rocket,
  RotateCw,
  Settings,
  Sparkles,
  Square,
  Terminal,
  ThumbsDown,
  ThumbsUp,
  X,
  Zap,
  type LucideIcon
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  alert: AlertTriangle,
  check: Check,
  'chevron-right': ChevronRight,
  diamond: Diamond,
  github: GitBranch,
  inbox: Mail,
  play: Play,
  rocket: Rocket,
  refresh: RotateCw,
  settings: Settings,
  sparkles: Sparkles,
  square: Square,
  terminal: Terminal,
  'thumbs-down': ThumbsDown,
  'thumbs-up': ThumbsUp,
  x: X,
  zap: Zap
}

export type SvgIconName = keyof typeof ICONS

type SvgIconProps = {
  name?: string
  label?: string
  size?: number
  className?: string
  color?: string
  strokeWidth?: number
}

/**
 * Render a named Lucide icon, falling back to compact text for connector initials.
 * Connector initials are data from the manifest, not decorative Unicode symbols.
 */
export function SvgIcon({ name, label, size = 14, ...props }: SvgIconProps): React.JSX.Element {
  const Icon = name ? ICONS[name] : undefined
  if (!Icon) {
    return (
      <span aria-hidden={label ? undefined : true} aria-label={label} role={label ? 'img' : undefined} {...props}>
        {name ?? '›'}
      </span>
    )
  }

  return <Icon size={size} aria-hidden={label ? undefined : true} aria-label={label} role={label ? 'img' : undefined} {...props} />
}
