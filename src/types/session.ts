export const domains = [
  'research',
  'data',
  'writing',
  'design',
  'video',
  'audio',
  'coding',
  'productivity',
  'learning',
  'presentations',
  'communication',
  'everyday',
] as const
export type Domain = (typeof domains)[number]
export const assetIds = [
  'research',
  'analytics',
  'writing',
  'creativity',
  'video',
  'audio',
  'coding',
  'productivity',
  'education',
  'communication',
  'everyday',
] as const
export type AssetId = (typeof assetIds)[number]
export const componentTypes = [
  'VoiceTextQuestion',
  'ChoiceCards',
  'ThisOrThat',
  'SwipeCards',
  'AppRecognition',
  'ScenarioGame',
] as const
export type ComponentType = (typeof componentTypes)[number]
export type Action = 'ASK' | 'CLARIFY' | 'EXPLORE' | 'VALIDATE' | 'RECOMMEND'
export interface Option {
  id: string
  label: string
  description: string
  assetId: AssetId
}
export interface Question {
  id: string
  component: ComponentType
  title: string
  description: string
  options: Option[]
  multiple: boolean
  targetGap: Domain | 'familiarity' | 'constraints' | 'introduction'
}
export interface Interaction {
  id: string
  question: Question
  answer: string
  skipped: boolean
}
export interface Claim {
  kind: 'fact' | 'goal' | 'interest' | 'tool' | 'hypothesis'
  text: string
  quote: string
  sourceId: string
  domain: Domain
  negative: boolean
  toolId: string | null
}
export interface Memory {
  confirmedFacts: Claim[]
  goals: Claim[]
  interests: Claim[]
  toolsUsed: Claim[]
  hypotheses: Claim[]
  unknowns: string[]
  contradictions: { domain: Domain; sourceIds: string[] }[]
}
export interface Focus {
  currentGoal: string
  currentHypothesis: string
  missingEvidence: string[]
  candidateTools: string[]
  currentStep: number
  maxSteps: number
  completionStatus: 'collecting' | 'ready' | 'budget-reached'
}
export interface Recommendation {
  toolId: string
  score: number
  exploratory: boolean
  opportunity: string
  why: string
  firstAction: string
  sourceIds: string[]
  evidenceQuotes: string[]
}
export interface DirectorResult {
  action: Action
  memory: Memory
  focus: Focus
  question: Question | null
  recommendations: Recommendation[]
  mode: 'demo' | 'live'
}
export type Phase = 'WELCOME' | 'INTRODUCTION' | 'DISCOVERY' | 'EVALUATING' | 'RESULTS' | 'ERROR'
export interface Session {
  phase: Phase
  history: Interaction[]
  question: Question
  result: DirectorResult | null
  error: string | null
}
export const MAX_STEPS = 7
