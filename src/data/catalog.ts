import entries from './tools.json'
import type { Domain } from '../types/session'
export interface Tool {
  id: string
  name: string
  officialUrl: string
  category: string
  shortDescription: string
  supportedUseCases: Domain[]
  targetUsers: string[]
  requiredExperience: 'beginner' | 'intermediate' | 'advanced'
  supportedPlatforms: string[]
  knownLimitations: string[]
  lastVerifiedDate: string | null
  verificationStatus: string
  verificationSource: string
  firstAction: string
}
export const catalog = entries as Tool[]
export const verifiedCatalog = catalog.filter((t) => t.verificationStatus === 'verified')
export const toolById = (id: string) => catalog.find((t) => t.id === id)
