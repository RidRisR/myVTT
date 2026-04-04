// plugins/daggerheart/index.ts
import type { RulePlugin } from '@myvtt/sdk'
import {
  dhGetMainResource,
  dhGetPortraitResources,
  dhGetStatuses,
  dhGetFormulaTokens,
} from './adapters'
import { createDefaultDHEntityData } from './templates'
import { DaggerHeartCard } from './DaggerHeartCard'
import { DHTeamPanel } from './ui/DHTeamPanel'
import { daggerheartI18n } from './i18n'

export const daggerheartPlugin: RulePlugin = {
  id: 'daggerheart',
  name: 'Daggerheart',
  sdkVersion: '1',
  i18n: daggerheartI18n,

  adapters: {
    getMainResource: dhGetMainResource,
    getPortraitResources: dhGetPortraitResources,
    getStatuses: dhGetStatuses,
    getFormulaTokens: dhGetFormulaTokens,
  },

  characterUI: { EntityCard: DaggerHeartCard },

  dataTemplates: { createDefaultEntityData: createDefaultDHEntityData },

  surfaces: {
    teamPanel: DHTeamPanel,
  },
}
