import { useTranslation } from 'react-i18next'
import { useRulePlugin } from '../rules/useRulePlugin'

/**
 * Translation hook for plugin components.
 * Reads from the active RulePlugin's i18n.resources.
 * Falls back to key itself if no translation found.
 */
export function usePluginTranslation() {
  const { i18n } = useTranslation()
  const plugin = useRulePlugin()
  const lng = i18n.language

  const t = (key: string, params?: Record<string, string | number>): string => {
    const resources = plugin.i18n?.resources
    if (!resources) return key

    const dict = resources[lng] ?? resources['zh-CN'] ?? {}
    let result = dict[key] ?? key

    if (params) {
      for (const [k, v] of Object.entries(params)) {
        result = result.replaceAll(`{{${k}}}`, String(v))
      }
    }
    return result
  }

  return { t, language: lng }
}
