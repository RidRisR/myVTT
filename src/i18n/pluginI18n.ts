import { useTranslation } from 'react-i18next'
import { useWorldStore } from '../stores/worldStore'

/**
 * Translation hook for plugin components.
 * Reads from the i18next namespace `plugin-{ruleSystemId}`.
 * Translations are loaded by each VTTPlugin in its onActivate().
 */
export function usePluginTranslation() {
  const ruleSystemId = useWorldStore((s) => s.room.ruleSystemId)
  const ns = `plugin-${ruleSystemId}`
  const { t, i18n } = useTranslation(ns)
  return { t, language: i18n.language }
}
