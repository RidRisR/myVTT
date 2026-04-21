// plugins/daggerheart/i18n.ts
import type { PluginI18n } from '@myvtt/sdk'

export const daggerheartI18n: PluginI18n = {
  resources: {
    'zh-CN': {
      // DaggerHeartCard
      'card.hp': 'HP',
      'card.stress': '压力',
      'card.hope': '希望',
      'card.fullSheet': '完整角色卡 →',

      // FullCharacterSheet — sections
      'sheet.noData': '无角色数据',
      'sheet.sectionIdentity': '身份',
      'sheet.sectionGrowth': '成长',
      'sheet.sectionAttributes': '核心属性',
      'sheet.sectionResources': '资源',
      'sheet.sectionNotes': '备注',
      'sheet.close': '关闭',

      // FullCharacterSheet — fields
      'sheet.class': '职业',
      'sheet.ancestry': '血统',
      'sheet.tier': '等级',
      'sheet.proficiency': '熟练值',
      'sheet.hp': '生命值 HP',
      'sheet.stress': '压力 Stress',
      'sheet.hope': '希望 Hope',
      'sheet.armor': '护甲 Armor',
      'sheet.notesPlaceholder': '角色背景、笔记...',

      // Attributes
      'attr.agility': '敏捷',
      'attr.strength': '力量',
      'attr.finesse': '精巧',
      'attr.instinct': '本能',
      'attr.presence': '临场',
      'attr.knowledge': '知识',

      // Dice — die labels
      'die.hope': '希望',
      'die.fear': '恐惧',

      // Dice — judgment displays
      'judgment.unknown': '未知判定',
      'judgment.critical': '命运临界！',
      'judgment.successHope': '乘希望而为',
      'judgment.successFear': '带着恐惧成功',
      'judgment.failureHope': '失败，但保有希望',
      'judgment.failureFear': '带着恐惧失败',

      // Dice — roll actions
      'roll.check': '{{attr}}检定',
      'roll.action.agility': '敏捷检定',
      'roll.action.strength': '力量检定',
      'roll.action.finesse': '精巧检定',
      'roll.action.instinct': '本能检定',
      'roll.action.presence': '风采检定',
      'roll.action.knowledge': '知识检定',

      // Fear Panel
      'fear.label': '恐惧',
      'fear.count': '{{current}} / {{max}}',
    },
    en: {
      // DaggerHeartCard
      'card.hp': 'HP',
      'card.stress': 'Stress',
      'card.hope': 'Hope',
      'card.fullSheet': 'Full Character Sheet →',

      // FullCharacterSheet — sections
      'sheet.noData': 'No character data',
      'sheet.sectionIdentity': 'Identity',
      'sheet.sectionGrowth': 'Growth',
      'sheet.sectionAttributes': 'Core Attributes',
      'sheet.sectionResources': 'Resources',
      'sheet.sectionNotes': 'Notes',
      'sheet.close': 'Close',

      // FullCharacterSheet — fields
      'sheet.class': 'Class',
      'sheet.ancestry': 'Ancestry',
      'sheet.tier': 'Tier',
      'sheet.proficiency': 'Proficiency',
      'sheet.hp': 'HP',
      'sheet.stress': 'Stress',
      'sheet.hope': 'Hope',
      'sheet.armor': 'Armor',
      'sheet.notesPlaceholder': 'Character background, notes...',

      // Attributes
      'attr.agility': 'Agility',
      'attr.strength': 'Strength',
      'attr.finesse': 'Finesse',
      'attr.instinct': 'Instinct',
      'attr.presence': 'Presence',
      'attr.knowledge': 'Knowledge',

      // Dice — die labels
      'die.hope': 'Hope',
      'die.fear': 'Fear',

      // Dice — judgment displays
      'judgment.unknown': 'Unknown judgment',
      'judgment.critical': 'Critical Success!',
      'judgment.successHope': 'Success with Hope',
      'judgment.successFear': 'Success with Fear',
      'judgment.failureHope': 'Failure with Hope',
      'judgment.failureFear': 'Failure with Fear',

      // Dice — roll actions
      'roll.check': '{{attr}} Check',
      'roll.action.agility': 'Agility Check',
      'roll.action.strength': 'Strength Check',
      'roll.action.finesse': 'Finesse Check',
      'roll.action.instinct': 'Instinct Check',
      'roll.action.presence': 'Presence Check',
      'roll.action.knowledge': 'Knowledge Check',

      // Fear Panel
      'fear.label': 'Fear',
      'fear.count': '{{current}} / {{max}}',
    },
  },
}
