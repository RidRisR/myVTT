// plugins/daggerheart/index.ts
import type { RulePlugin } from '@myvtt/sdk'
import {
  dhGetMainResource,
  dhGetPortraitResources,
  dhGetStatuses,
  dhGetFormulaTokens,
} from './adapters'
import {
  dhGetRollActions,
  dhEvaluateRoll,
  dhGetDieStylesFromTerms,
  dhGetJudgmentDisplay,
  rollCommands,
} from './diceSystem'
import { createDefaultDHEntityData } from './templates'
import { DaggerHeartCard } from './DaggerHeartCard'
import { DHRollCard } from './ui/DHRollCard'
import { FullCharacterSheet } from './ui/FullCharacterSheet'
import { DHTeamPanel } from './ui/DHTeamPanel'

export const daggerheartPlugin: RulePlugin = {
  id: 'daggerheart',
  name: 'Daggerheart',
  sdkVersion: '1',

  adapters: {
    getMainResource: dhGetMainResource,
    getPortraitResources: dhGetPortraitResources,
    getStatuses: dhGetStatuses,
    getFormulaTokens: dhGetFormulaTokens,
  },

  characterUI: { EntityCard: DaggerHeartCard },

  diceSystem: {
    getRollActions: dhGetRollActions,
    evaluateRoll: dhEvaluateRoll,
    getDieStyles: dhGetDieStylesFromTerms,
    getJudgmentDisplay: dhGetJudgmentDisplay,
    getModifierOptions: () => [],
    rollCommands,
  },

  dataTemplates: { createDefaultEntityData: createDefaultDHEntityData },

  surfaces: {
    panels: [
      {
        id: 'dh-full-sheet',
        component: FullCharacterSheet,
        placement: 'fullscreen-overlay' as const,
      },
    ],
    rollCardRenderers: {
      'daggerheart:dd': DHRollCard,
    },
    teamPanel: DHTeamPanel,
  },
}
