// Random RPG-themed room name generator

const ADJECTIVES = [
  '迷雾',
  '燃烬',
  '暗影',
  '星辉',
  '碎骨',
  '银月',
  '深渊',
  '血色',
  '翡翠',
  '黄昏',
  '寒霜',
  '烈焰',
  '幽灵',
  '雷鸣',
  '荆棘',
  '琥珀',
  '苍穹',
  '铁锈',
  '幻梦',
  '孤影',
]

const NOUNS = [
  '酒馆',
  '密窟',
  '圣殿',
  '深林',
  '要塞',
  '渡口',
  '古塔',
  '矿坑',
  '废墟',
  '龙巢',
  '王座',
  '地窖',
  '集市',
  '营地',
  '港湾',
  '裂隙',
  '回廊',
  '祭坛',
  '书阁',
  '岔路',
]

export function generateRoomName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)] as string
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)] as string
  return `${adj}${noun}`
}
