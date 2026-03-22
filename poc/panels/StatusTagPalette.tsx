import { makeDnDSDK } from '../../src/ui-system/dnd'

export interface SpellPayload {
  name: string
  damage: number
  damageType: string
}

const SPELLS: SpellPayload[] = [
  { name: 'Fire Arrow', damage: 10, damageType: 'fire' },
  { name: 'Ice Shard', damage: 8, damageType: 'ice' },
  { name: 'Lightning Bolt', damage: 15, damageType: 'lightning' },
]

const dnd = makeDnDSDK()

export function StatusTagPalette() {
  return (
    <div className="flex flex-col gap-2 p-3">
      <h3 className="text-sm font-semibold text-muted">Spells</h3>
      {SPELLS.map((spell) => (
        <div
          key={spell.name}
          {...dnd.makeDraggable({ type: 'spell', data: spell })}
          className="cursor-grab rounded bg-surface px-3 py-2 text-sm text-foreground hover:bg-surface-hover"
        >
          {spell.name} ({spell.damage} {spell.damageType})
        </div>
      ))}
    </div>
  )
}
