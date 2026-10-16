import {
  BookOpen,
  ChartNoAxesCombined,
  Feather,
  Palette,
  Film,
  AudioLines,
  Code2,
  Layers3,
  GraduationCap,
  MessagesSquare,
  Sparkles,
} from 'lucide-react'
import type { AssetId } from '../types/session'
export const assets = {
  research: BookOpen,
  analytics: ChartNoAxesCombined,
  writing: Feather,
  creativity: Palette,
  video: Film,
  audio: AudioLines,
  coding: Code2,
  productivity: Layers3,
  education: GraduationCap,
  communication: MessagesSquare,
  everyday: Sparkles,
} satisfies Record<AssetId, typeof BookOpen>
