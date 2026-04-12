import type { WorkflowContext } from '@myvtt/sdk'
import { DH_KEYS } from '../daggerheart/types'
import type { DHRollTemplate, DHRollTemplateConfig, DHRollTemplates } from '../daggerheart/types'
import {
  cloneTemplateConfig,
  createDefaultRollTemplateConfig,
  createRollTemplateId,
} from './rollTemplateUtils'

function readRollTemplates(prev: unknown): DHRollTemplates {
  if (prev && typeof prev === 'object' && 'items' in prev && Array.isArray(prev.items)) {
    return prev as DHRollTemplates
  }
  return { items: [] }
}

export interface RollTemplateAddData {
  [key: string]: unknown
  entityId: string
  name?: string
  icon?: string
  config?: DHRollTemplateConfig
}

export interface RollTemplateUpdateData {
  [key: string]: unknown
  entityId: string
  templateId: string
  patch: Partial<Pick<DHRollTemplate, 'name' | 'icon' | 'config'>>
}

export interface RollTemplateRemoveData {
  [key: string]: unknown
  entityId: string
  templateId: string
}

export interface RollTemplateReorderData {
  [key: string]: unknown
  entityId: string
  fromIndex: number
  toIndex: number
}

export class RollTemplateManager {
  listTemplates(ctx: WorkflowContext, entityId: string): DHRollTemplate[] {
    const component = ctx.read.component<DHRollTemplates>(entityId, DH_KEYS.rollTemplates)
    return component?.items ?? []
  }

  getTemplate(ctx: WorkflowContext, entityId: string, templateId: string): DHRollTemplate | null {
    return this.listTemplates(ctx, entityId).find((template) => template.id === templateId) ?? null
  }

  addTemplate(
    ctx: WorkflowContext,
    entityId: string,
    input: Omit<RollTemplateAddData, 'entityId'> = {},
  ): void {
    ctx.updateComponent(entityId, DH_KEYS.rollTemplates, (prev: unknown) => {
      const p = readRollTemplates(prev)
      const now = Date.now()
      const name = typeof input.name === 'string' ? input.name.trim() : ''
      const icon = typeof input.icon === 'string' ? input.icon.trim() : ''
      const config = input.config ?? createDefaultRollTemplateConfig()
      const next: DHRollTemplate = {
        id: createRollTemplateId(),
        name: name || '新模板',
        icon: icon || '✨',
        config: cloneTemplateConfig(config),
        createdAt: now,
        updatedAt: now,
      }
      return {
        ...p,
        items: [...p.items, next],
      }
    })
  }

  updateTemplate(
    ctx: WorkflowContext,
    entityId: string,
    templateId: string,
    patch: Partial<Pick<DHRollTemplate, 'name' | 'icon' | 'config'>>,
  ): void {
    ctx.updateComponent(entityId, DH_KEYS.rollTemplates, (prev: unknown) => {
      const p = readRollTemplates(prev)
      return {
        ...p,
        items: p.items.map((template) => {
          if (template.id !== templateId) return template
          return {
            ...template,
            name: patch.name !== undefined ? patch.name : template.name,
            icon: patch.icon !== undefined ? patch.icon : template.icon,
            config: patch.config
              ? cloneTemplateConfig(patch.config)
              : cloneTemplateConfig(template.config),
            updatedAt: Date.now(),
          }
        }),
      }
    })
  }

  removeTemplate(ctx: WorkflowContext, entityId: string, templateId: string): void {
    ctx.updateComponent(entityId, DH_KEYS.rollTemplates, (prev: unknown) => {
      const p = readRollTemplates(prev)
      return {
        ...p,
        items: p.items.filter((template) => template.id !== templateId),
      }
    })
  }

  reorderTemplates(
    ctx: WorkflowContext,
    entityId: string,
    fromIndex: number,
    toIndex: number,
  ): void {
    ctx.updateComponent(entityId, DH_KEYS.rollTemplates, (prev: unknown) => {
      const p = readRollTemplates(prev)
      if (
        fromIndex < 0 ||
        fromIndex >= p.items.length ||
        toIndex < 0 ||
        toIndex >= p.items.length ||
        fromIndex === toIndex
      ) {
        return p
      }

      const items = [...p.items]
      const [moved] = items.splice(fromIndex, 1)
      if (!moved) return p
      items.splice(toIndex, 0, moved)
      return { ...p, items }
    })
  }
}
