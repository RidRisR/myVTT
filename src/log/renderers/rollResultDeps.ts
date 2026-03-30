// Mutable dependency holder for RollResultRenderer.
// Breaks circular dep: registerBaseRenderers → RollResultRenderer → useRulePlugin → registry → useWorkflowSDK.
// Bound at runtime via _bindRollResultDeps() (called from registerBaseRenderers).
import type { RulePlugin } from '../../rules/types'

type UseRulePluginFn = () => RulePlugin
type UsePluginTranslationFn = () => { t: (key: string) => string }

let _useRulePlugin: UseRulePluginFn | null = null
let _usePluginTranslation: UsePluginTranslationFn | null = null

export function _bindRollResultDeps(
  useRulePlugin: UseRulePluginFn,
  usePluginTranslation: UsePluginTranslationFn,
): void {
  _useRulePlugin = useRulePlugin
  _usePluginTranslation = usePluginTranslation
}

export function _getUseRulePlugin(): UseRulePluginFn {
  if (!_useRulePlugin) throw new Error('RollResultRenderer deps not bound')
  return _useRulePlugin
}

export function _getUsePluginTranslation(): UsePluginTranslationFn {
  if (!_usePluginTranslation) throw new Error('RollResultRenderer deps not bound')
  return _usePluginTranslation
}
