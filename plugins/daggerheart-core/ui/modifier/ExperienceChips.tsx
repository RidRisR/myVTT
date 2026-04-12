// plugins/daggerheart-core/ui/modifier/ExperienceChips.tsx
import type { DHExperiences } from '../../../daggerheart/types'

interface ExperienceChipsProps {
  experiences: DHExperiences
  selected: number | null // index into experiences.items
  onSelect: (index: number | null) => void
}

export function ExperienceChips({ experiences, selected, onSelect }: ExperienceChipsProps) {
  if (!experiences.items || experiences.items.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1">
      {experiences.items.map((exp, i) => {
        const isSel = selected === i
        return (
          <button
            key={i}
            onClick={() => onSelect(isSel ? null : i)}
            className={`flex items-center gap-1 h-[30px] px-2.5 rounded-full border text-[10px] transition-colors cursor-pointer ${
              isSel
                ? 'bg-accent/[0.08] border-accent/30 text-accent-bold'
                : 'bg-transparent border-border-glass text-text-muted hover:bg-white/[0.04]'
            }`}
          >
            <span
              className={`w-[5px] h-[5px] rounded-full ${
                isSel
                  ? 'bg-accent-bold border-accent-bold'
                  : 'border border-text-muted/30'
              }`}
            />
            <span>{exp.name}</span>
            <span className="font-semibold">
              {exp.modifier >= 0 ? `+${exp.modifier}` : exp.modifier}
            </span>
          </button>
        )
      })}
    </div>
  )
}
