/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { schema } from '@kbn/config-schema';
import type { UiSettingsParams } from '@kbn/core-ui-settings-common';
import {
  DEFAULT_REGIONS_SETTING_KEY,
  DIAMOND_CONNECTOR_SETTING_KEY,
  DIAMOND_GATE_CONNECTOR_SETTING_KEY,
  TRIAGE_CONNECTOR_SETTING_KEY,
  SYNTHESIS_CONNECTOR_SETTING_KEY,
  TRIAGE_CONFIDENCE_FLOOR_SETTING_KEY,
  TRIAGE_TOP_N_SETTING_KEY,
  THREAT_REGIONS,
} from '../../common/threat_intelligence/hub';

/**
 * Per-space advanced setting for the dashboard's location-aware default
 * filter. When set, the Intelligence Hub app pre-fills its `regions`
 * filter from this value on first load. Per-space (not per-user) so an
 * operator can configure the whole space to default to the regions
 * relevant to that tenant — e.g. an APAC space defaults to
 * `["east-asia", "southeast-asia", "oceania"]`.
 *
 * Stored as an array of `ThreatRegion` keywords; the validator below
 * rejects unknown regions so the dashboard never has to handle long-tail
 * free-text input.
 */
export const threatIntelligenceUiSettings: Record<string, UiSettingsParams> = {
  [DEFAULT_REGIONS_SETTING_KEY]: {
    category: ['securitySolution'],
    name: i18n.translate(
      'xpack.securitySolution.threatIntelligence.uiSettings.defaultRegions.name',
      {
        defaultMessage: 'Threat Intelligence — default geographic regions',
      }
    ),
    description: i18n.translate(
      'xpack.securitySolution.threatIntelligence.uiSettings.defaultRegions.description',
      {
        defaultMessage:
          'Geographic regions to pre-fill on the Threat Intelligence dashboard. ' +
          'Per-space — set this to the macro regions relevant to the tenant in ' +
          'this space (e.g. ["east-asia", "southeast-asia"] for an APAC space).',
      }
    ),
    type: 'array',
    value: [],
    schema: schema.arrayOf(
      schema.string({
        validate: (value) =>
          (THREAT_REGIONS as readonly string[]).includes(value)
            ? undefined
            : `unknown region: ${value}`,
      })
    ),
    requiresPageReload: false,
  },

  [DIAMOND_GATE_CONNECTOR_SETTING_KEY]: {
    category: ['securitySolution'],
    name: i18n.translate(
      'xpack.securitySolution.threatIntelligence.uiSettings.diamondGateConnector.name',
      {
        defaultMessage: 'Threat Intelligence — taxonomy gate connector',
      }
    ),
    description: i18n.translate(
      'xpack.securitySolution.threatIntelligence.uiSettings.diamondGateConnector.description',
      {
        defaultMessage:
          'GenAI connector ID used for the per-report taxonomy enrichment step ' +
          '(enrich_taxonomy — categories, regions, relevance, detection_actionability, ' +
          'diamond_suitable). Defaults to the EIS-platform Haiku connector; override to ' +
          'pin a different connector for this space. Falls back to genAi:defaultAIConnector ' +
          'if the configured connector is unavailable on this deployment.',
      }
    ),
    type: 'string',
    // EIS-platform connector — non-UUID id = platform-provisioned, survives ci:cloud-deploy rebuilds.
    // resolveScopedModel falls back to genAi:defaultAIConnector if this id is absent.
    value: 'Anthropic-Claude-Haiku-4-5',
    schema: schema.string(),
    requiresPageReload: false,
  },

  [DIAMOND_CONNECTOR_SETTING_KEY]: {
    category: ['securitySolution'],
    name: i18n.translate(
      'xpack.securitySolution.threatIntelligence.uiSettings.diamondConnector.name',
      {
        defaultMessage: 'Threat Intelligence — Diamond extraction connector',
      }
    ),
    description: i18n.translate(
      'xpack.securitySolution.threatIntelligence.uiSettings.diamondConnector.description',
      {
        defaultMessage:
          'GenAI connector ID used for the heavy Diamond Model extraction step ' +
          '(extract_diamond — adversary/capability/infrastructure/victim summaries). ' +
          'Only called for threat-positive reports (diamond_suitable == true). ' +
          'Defaults to the EIS-platform Opus 4.7 connector; override to pin a different ' +
          'connector. Falls back to genAi:defaultAIConnector if the configured connector ' +
          'is unavailable on this deployment.',
      }
    ),
    type: 'string',
    // EIS-platform inference-endpoint-as-connector — dotted id = preconfigured, survives rebuilds.
    // resolveScopedModel falls back to genAi:defaultAIConnector if this id is absent.
    value: '.anthropic-claude-4.7-opus-chat_completion',
    schema: schema.string(),
    requiresPageReload: false,
  },

  [TRIAGE_CONNECTOR_SETTING_KEY]: {
    category: ['securitySolution'],
    name: i18n.translate(
      'xpack.securitySolution.threatIntelligence.uiSettings.triageConnector.name',
      { defaultMessage: 'Threat Intelligence — triage connector' }
    ),
    description: i18n.translate(
      'xpack.securitySolution.threatIntelligence.uiSettings.triageConnector.description',
      {
        defaultMessage:
          'GenAI connector ID used for the candidate-triage pass in correlate_threat (§5). ' +
          'Sonnet-class — cheaper than Opus but capable of ranked candidate analysis. ' +
          'Falls back to genAi:defaultAIConnector if the configured connector is unavailable.',
      }
    ),
    type: 'string',
    value: 'Anthropic-Claude-Sonnet-4-6',
    schema: schema.string(),
    requiresPageReload: false,
  },

  [SYNTHESIS_CONNECTOR_SETTING_KEY]: {
    category: ['securitySolution'],
    name: i18n.translate(
      'xpack.securitySolution.threatIntelligence.uiSettings.synthesisConnector.name',
      { defaultMessage: 'Threat Intelligence — synthesis connector' }
    ),
    description: i18n.translate(
      'xpack.securitySolution.threatIntelligence.uiSettings.synthesisConnector.description',
      {
        defaultMessage:
          'GenAI connector ID used for the §6 synthesis pass in correlate_threat. ' +
          'Opus-tier — the most expensive call in the correlation pipeline; tuned independently ' +
          'from the diamond and triage connectors. Defaults to the EIS-platform Opus 4.7 ' +
          'connector; override to pin a different connector. Falls back to ' +
          'genAi:defaultAIConnector if the configured connector is unavailable.',
      }
    ),
    type: 'string',
    value: '.anthropic-claude-4.7-opus-chat_completion',
    schema: schema.string(),
    requiresPageReload: false,
  },

  [TRIAGE_CONFIDENCE_FLOOR_SETTING_KEY]: {
    category: ['securitySolution'],
    name: i18n.translate(
      'xpack.securitySolution.threatIntelligence.uiSettings.triageConfidenceFloor.name',
      { defaultMessage: 'Threat Intelligence — triage confidence floor' }
    ),
    description: i18n.translate(
      'xpack.securitySolution.threatIntelligence.uiSettings.triageConfidenceFloor.description',
      {
        defaultMessage:
          'Minimum triage confidence (0.0–1.0) a candidate must reach to advance to ' +
          "synthesis. Default 0.65 matches Mustard's empirical floor; recalibrate in " +
          'Phase 6 evals if the score distribution on this corpus differs.',
      }
    ),
    type: 'number',
    value: 0.65,
    schema: schema.number({ min: 0, max: 1 }),
    requiresPageReload: false,
  },

  [TRIAGE_TOP_N_SETTING_KEY]: {
    category: ['securitySolution'],
    name: i18n.translate('xpack.securitySolution.threatIntelligence.uiSettings.triageTopN.name', {
      defaultMessage: 'Threat Intelligence — triage candidate cap (top-N)',
    }),
    description: i18n.translate(
      'xpack.securitySolution.threatIntelligence.uiSettings.triageTopN.description',
      {
        defaultMessage:
          'Maximum candidates ranked by (overlap, max_score) fed to the triage LLM. ' +
          "Default 75 fits Sonnet's ~180K usable context at full Mustard-budget summary " +
          'lengths. Phase 6 eval knob — increase if triage is starved at corpus scale.',
      }
    ),
    type: 'number',
    value: 75,
    schema: schema.number({ min: 1, max: 500 }),
    requiresPageReload: false,
  },
};
