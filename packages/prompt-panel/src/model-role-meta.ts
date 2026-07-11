import { Eye, Image as ImageIcon, Type, type LucideIcon } from 'lucide-react'

import type { LandingModelRole } from './domain'

export const MODEL_ROLE_META: Record<
  LandingModelRole,
  { color: string; Icon: LucideIcon; label: string }
> = {
  image: { color: 'text-emerald-500', Icon: ImageIcon, label: 'Image' },
  text: { color: 'text-blue-500', Icon: Type, label: 'Text' },
  vision: { color: 'text-violet-500', Icon: Eye, label: 'Vision' },
}
