import { useMemo, useState } from 'react'
import { Pencil, Save, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import { rollConfigToFormula } from '../../rollConfigUtils'
import { materializeRollConfigFromTemplate } from '../../rollTemplateUtils'
import type {
  DHAttributes,
  DHExperiences,
  DHRollTemplate,
  DHRollTemplates,
} from '../../../daggerheart/types'

interface CustomTabProps {
  attributes: DHAttributes
  experiences: DHExperiences
  templates: DHRollTemplates
  onAdd: () => void
  onEditConfig: (templateId: string) => void
  onRemove: (templateId: string) => void
  onSaveMeta: (templateId: string, patch: { name: string; icon?: string }) => void
  onUse: (templateId: string, skipModifier: boolean) => void
}

function TemplateFormula({
  template,
  attributes,
  experiences,
}: {
  template: DHRollTemplate
  attributes: DHAttributes
  experiences: DHExperiences
}) {
  const formula = useMemo(() => {
    const runtimeConfig = materializeRollConfigFromTemplate(
      template.config,
      attributes,
      experiences,
    )
    return rollConfigToFormula(runtimeConfig)
  }, [attributes, experiences, template])

  return <span className="text-[8px] text-white/35 font-mono truncate">{formula || '未配置'}</span>
}

export function CustomTab({
  attributes,
  experiences,
  templates,
  onAdd,
  onEditConfig,
  onRemove,
  onSaveMeta,
  onUse,
}: CustomTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftIcon, setDraftIcon] = useState('')

  function startEdit(template: DHRollTemplate): void {
    setEditingId(template.id)
    setDraftName(template.name)
    setDraftIcon(template.icon ?? '')
  }

  function stopEdit(): void {
    setEditingId(null)
    setDraftName('')
    setDraftIcon('')
  }

  function saveMeta(template: DHRollTemplate): void {
    onSaveMeta(template.id, {
      name: draftName.trim() || template.name,
      icon: draftIcon.trim() || undefined,
    })
    stopEdit()
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5">
        {templates.items.map((template) => {
          if (editingId === template.id) {
            return (
              <div
                key={template.id}
                className="min-h-[64px] rounded-md border border-accent/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-2"
              >
                <div className="flex items-center gap-1.5">
                  <input
                    value={draftIcon}
                    onChange={(e) => { setDraftIcon(e.target.value); }}
                    placeholder="✨"
                    className="w-9 h-7 rounded border border-white/[0.10] bg-black/15 text-center text-[14px] text-white outline-none focus:border-accent/35"
                  />
                  <input
                    value={draftName}
                    onChange={(e) => { setDraftName(e.target.value); }}
                    placeholder="模板名称"
                    className="flex-1 min-w-0 h-7 rounded border border-white/[0.10] bg-black/15 px-2 text-[10px] text-white outline-none focus:border-accent/35"
                  />
                </div>
                <div className="mt-1.5 flex items-center gap-1">
                  <button
                    onClick={() => { onEditConfig(template.id); }}
                    className="flex-1 h-6 rounded border border-white/[0.08] bg-white/[0.04] text-[9px] text-white/70 cursor-pointer hover:border-accent/25 hover:text-white"
                  >
                    配置
                  </button>
                  <button
                    onClick={() => { saveMeta(template); }}
                    className="w-7 h-6 rounded border border-accent/35 bg-accent/[0.12] text-accent-bold flex items-center justify-center cursor-pointer"
                    aria-label="保存模板"
                  >
                    <Save size={10} />
                  </button>
                  <button
                    onClick={stopEdit}
                    className="w-7 h-6 rounded border border-white/[0.08] bg-transparent text-white/45 flex items-center justify-center cursor-pointer hover:text-white/75"
                    aria-label="取消编辑"
                  >
                    <X size={10} />
                  </button>
                </div>
              </div>
            )
          }

          return (
            <div
              key={template.id}
              onClick={() => { onUse(template.id, true); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onUse(template.id, true)
                }
              }}
              className="group relative flex items-start gap-2 px-2.5 py-2 min-h-[64px] rounded-md border border-white/[0.08] bg-white/[0.04] text-left cursor-pointer hover:border-accent/25 hover:bg-white/[0.06] transition-colors"
              role="button"
              tabIndex={0}
            >
              <div className="pt-0.5 text-[14px] leading-none">{template.icon || '✨'}</div>
              <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                <span className="text-[10px] text-white/75 font-medium truncate">
                  {template.name}
                </span>
                <TemplateFormula
                  template={template}
                  attributes={attributes}
                  experiences={experiences}
                />
                <div className="mt-1 flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                  <span className="inline-flex items-center gap-1 rounded border border-white/[0.07] bg-black/10 px-1.5 py-0.5 text-[8px] text-white/45">
                    <Sparkles size={8} />
                    直掷
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onUse(template.id, false)
                    }}
                    className="inline-flex items-center gap-1 rounded border border-white/[0.07] bg-black/10 px-1.5 py-0.5 text-[8px] text-white/55 cursor-pointer hover:text-white/80"
                  >
                    <Wand2 size={8} />
                    调整
                  </button>
                </div>
              </div>
              <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    startEdit(template)
                  }}
                  className="w-5 h-5 rounded border border-white/[0.08] bg-black/15 text-white/45 flex items-center justify-center cursor-pointer hover:text-white/75"
                  aria-label="编辑模板"
                >
                  <Pencil size={8} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove(template.id)
                    if (editingId === template.id) stopEdit()
                  }}
                  className="w-5 h-5 rounded border border-red-400/20 bg-red-500/10 text-red-200/70 flex items-center justify-center cursor-pointer hover:text-red-100"
                  aria-label="删除模板"
                >
                  <Trash2 size={8} />
                </button>
              </div>
            </div>
          )
        })}

        <button
          onClick={onAdd}
          className="flex min-h-[64px] items-center justify-center gap-1.5 rounded-md border border-dashed border-white/[0.14] bg-transparent text-[11px] text-white/35 cursor-pointer hover:border-accent/25 hover:text-white/70 transition-colors"
        >
          <span className="text-[16px] leading-none">+</span>
          <span>新建模板</span>
        </button>
      </div>

      <div className="mt-1.5 text-center text-[9px] text-white/22">
        点击模板直接掷骰；使用“调整”可带着模板配置进入 Modifier Panel。
      </div>
    </div>
  )
}
