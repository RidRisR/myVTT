// plugins/daggerheart/types.ts
// All fields optional — runtime ruleData may be partial (e.g. entity created by generic plugin)
export interface DHRuleData {
  agility: number
  strength: number
  finesse: number
  instinct: number
  presence: number
  knowledge: number
  tier: 1 | 2 | 3 | 4
  proficiency: number
  className: string
  ancestry: string
  hp?: { current: number; max: number }
  stress?: { current: number; max: number }
  hope?: number
  armor?: number
}
