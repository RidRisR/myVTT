// plugins/daggerheart-core/rollTypes.ts

/** 单组骰子配置 */
export interface DiceGroup {
  /** 骰面数 */
  sides: number
  /** 骰子数量 */
  count: number
  /** 加/减 */
  operator: '+' | '-'
  /** 取高/取低 */
  keep?: { mode: 'high' | 'low'; count: number }
  /** UI 标签（如 "优势"） */
  label?: string
}

/** 修正值来源 */
export interface ModifierSource {
  /** 来源标识（如 'attribute:agility', 'experience:stealth'） */
  source: string
  /** 显示名（如 '敏捷', '潜行'） */
  label: string
  /** 数值（如 +3, -1） */
  value: number
}

/** 副作用（资源变动） */
export interface SideEffectEntry {
  /** 资源类型 */
  resource: 'hope' | 'hp' | 'stress' | 'armor'
  /** 变动量（正=增加, 负=减少） */
  delta: number
}

/** 二元骰配置 */
export interface DualityDiceConfig {
  /** 希望骰面数（默认 12） */
  hopeFace: number
  /** 恐惧骰面数（默认 12） */
  fearFace: number
}

/** Modifier 面板返回的完整掷骰配置 */
export interface RollConfig {
  /** 二元骰（null = 不投二元骰） */
  dualityDice: DualityDiceConfig | null
  /** 额外骰子组 */
  diceGroups: DiceGroup[]
  /** 修正值列表（属性、经验等） */
  modifiers: ModifierSource[]
  /** 常量修正 */
  constantModifier: number
  /** 副作用列表 */
  sideEffects: SideEffectEntry[]
  /** DC（可选，由 GM 设定或省略） */
  dc?: number
}

/** 掷骰结果中单组骰子的结果 */
export interface DiceGroupResult {
  group: DiceGroup
  /** 所有骰子的原始值 */
  allRolls: number[]
  /** 保留的骰子索引（keep 后） */
  keptIndices: number[]
  /** 该组的小计（含 operator） */
  subtotal: number
}

/** 完整的掷骰执行结果 */
export interface RollExecutionResult {
  /** 二元骰结果 [hopeDie, fearDie]（null if no duality dice） */
  dualityRolls: [number, number] | null
  /** 每组骰子的详细结果 */
  groupResults: DiceGroupResult[]
  /** 修正值总和 */
  modifierTotal: number
  /** 所有骰子 + 修正值的最终总计 */
  total: number
}

/** action-check workflow 的 vars 类型 */
export interface ActionCheckVars {
  actorId: string
  formula?: string
  rollType?: string
  /** 预选属性 key（从角色卡/底部面板传入） */
  preselectedAttribute?: string
  /** 是否跳过 modifier 面板（Shift+click） */
  skipModifier?: boolean
  /** modifier 面板返回的配置 */
  rollConfig?: RollConfig
  /** 掷骰执行结果 */
  rollResult?: RollExecutionResult
  /** 判定结果 */
  judgment?: import('../../src/rules/types').JudgmentResult | null
  dc?: number
}
