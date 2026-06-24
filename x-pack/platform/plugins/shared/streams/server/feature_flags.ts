/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { CoreSetup, Logger } from '@kbn/core/server';
import { i18n } from '@kbn/i18n';
import {
  OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS,
  OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS_DISCOVERY,
  OBSERVABILITY_STREAMS_ENABLE_CONTENT_PACKS,
  OBSERVABILITY_STREAMS_ENABLE_QUERY_STREAMS,
  OBSERVABILITY_STREAMS_ENABLE_WIRED_STREAM_VIEWS,
  OBSERVABILITY_STREAMS_ENABLE_DRAFT_STREAMS,
  OBSERVABILITY_STREAMS_ENABLE_CANVAS,
  OBSERVABILITY_STREAMS_CONTINUOUS_KI_EXTRACTION_ENABLED,
  OBSERVABILITY_STREAMS_CONTINUOUS_KI_EXTRACTION_INTERVAL_HOURS,
  OBSERVABILITY_STREAMS_CONTINUOUS_KI_EXTRACTION_EXCLUDED_STREAM_PATTERNS,
  OBSERVABILITY_STREAMS_SIG_EVENTS_INDEX_PATTERNS,
  OBSERVABILITY_STREAMS_SIG_EVENTS_TUNING_CONFIG,
  OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS_ALERTING_V2,
} from '@kbn/management-settings-ids';
import { DEFAULT_INDEX_PATTERNS } from '@kbn/streams-schema';
import type { StreamsPluginStartDependencies } from './types';
import { STREAMS_TIERED_SIGNIFICANT_EVENT_FEATURE } from '../common';
import { DEFAULT_EXTRACTION_INTERVAL_HOURS } from '../common/constants';
import { DEFAULT_SIG_EVENTS_TUNING_CONFIG } from '../common/sig_events_tuning_config';

const sigEventsTuningConfigSchema = schema.object(
  {
    sample_size: schema.number({ min: 1, max: 100 }),
    max_iterations: schema.number({ min: 1, max: 20 }),
    feature_ttl_days: schema.number({ min: 1 }),
    entity_filtered_ratio: schema.number({ min: 0, max: 1 }),
    diverse_ratio: schema.number({ min: 0, max: 1 }),
    max_excluded_features_in_prompt: schema.number({ min: 0, max: 50 }),
    max_entity_filters: schema.number({ min: 1, max: 50 }),
    semantic_min_score: schema.number({ min: 0, max: 1 }),
    rrf_rank_constant: schema.number({ min: 1, max: 100 }),
  },
  {
    validate: (value) => {
      if (value.entity_filtered_ratio + value.diverse_ratio > 1.0) {
        return (
          `entity_filtered_ratio (${value.entity_filtered_ratio}) + ` +
          `diverse_ratio (${value.diverse_ratio}) must not exceed 1.0 ` +
          `(remainder is used for random sampling)`
        );
      }
    },
  }
);

export function registerFeatureFlags(
  core: CoreSetup<StreamsPluginStartDependencies>,
  logger: Logger,
  { isAlertingV2PluginAvailable }: { isAlertingV2PluginAvailable: boolean }
) {
  core.pricing
    .isFeatureAvailable(STREAMS_TIERED_SIGNIFICANT_EVENT_FEATURE.id)
    .then((isSignificantEventsAvailable) => {
      if (isSignificantEventsAvailable) {
        core.uiSettings.register({
          [OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS]: {
            category: ['observability'],
            name: i18n.translate('xpack.streams.significantEventsSettingsName', {
              defaultMessage: 'Streams significant events',
            }) as string,
            value: false,
            description: i18n.translate('xpack.streams.significantEventsSettingsDescription', {
              defaultMessage: 'Enable streams significant events.',
            }),
            type: 'boolean',
            schema: schema.boolean(),
            requiresPageReload: true,
            solutionViews: ['classic', 'oblt'],
            technicalPreview: true,
          },
        });

        core.uiSettings.register({
          [OBSERVABILITY_STREAMS_SIG_EVENTS_INDEX_PATTERNS]: {
            category: ['observability'],
            name: i18n.translate('xpack.streams.sigEventsIndexPatternsSettingsName', {
              defaultMessage: 'Significant Events index patterns',
            }) as string,
            value: DEFAULT_INDEX_PATTERNS,
            description: i18n.translate('xpack.streams.sigEventsIndexPatternsSettingsDescription', {
              defaultMessage:
                'Comma-separated list of index patterns used for Significant Events stream filtering and analysis.',
            }),
            type: 'string',
            schema: schema.string(),
            requiresPageReload: false,
            solutionViews: ['classic', 'oblt'],
            technicalPreview: true,
            readonly: true,
            readonlyMode: 'ui',
          },
        });

        core.uiSettings.register({
          [OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS_DISCOVERY]: {
            category: ['observability'],
            name: i18n.translate('xpack.streams.significantEventsDiscoverySettingsName', {
              defaultMessage: 'Streams significant events discovery',
            }) as string,
            value: false,
            description: i18n.translate(
              'xpack.streams.significantEventsDiscoverySettingsDescription',
              {
                defaultMessage: 'Enable streams significant events discovery.',
              }
            ),
            type: 'boolean',
            schema: schema.boolean(),
            requiresPageReload: true,
            solutionViews: ['classic', 'oblt'],
            technicalPreview: true,
            readonly: true,
            readonlyMode: 'ui',
          },
        });

        if (isAlertingV2PluginAvailable) {
          core.uiSettings.register({
            [OBSERVABILITY_STREAMS_ENABLE_SIGNIFICANT_EVENTS_ALERTING_V2]: {
              category: ['observability'],
              name: i18n.translate('xpack.streams.significantEventsAlertingV2SettingsName', {
                defaultMessage: 'Streams significant events — Alerting v2',
              }) as string,
              value: false,
              description: i18n.translate(
                'xpack.streams.significantEventsAlertingV2SettingsDescription',
                {
                  defaultMessage:
                    'Back significant event queries with Alerting v2 (kind: signal) instead of the custom streams.rules.esql rule type. ' +
                    'Requires the alertingVTwo plugin and the write-alerting-v2-rules privilege. ' +
                    'SigEvents rules are stored in the default Kibana space regardless of the current space. ' +
                    'When disabled, rules are created via Alerting v1 (default). ' +
                    'Turning this ON does not migrate existing v1-backed queries — promote or change queries to create v2 rules. ' +
                    'Reads and writes both require the plugin; flag-on without alertingVTwo keeps v1 rules and v1 alert indices. ' +
                    'Under v2, the discovery histogram buckets on rule evaluation time, not source log time. ' +
                    'Switching this flag causes user-visible data gaps: the discovery view reads from a single index (.alerts-streams.* for v1 or .rule-events for v2) and does not union both, so events generated by the previous engine become invisible until the flag is restored. ' +
                    'Cleanup of orphaned rules on the previous engine relies on a write operation against a SigEvent query (promote, update, delete) — this triggers dual cleanup which removes the legacy rule. ' +
                    'If alertingVTwo is uninstalled while v2 rules exist, in-product cleanup becomes a no-op; to clean up, reinstall the plugin and trigger a write on each affected query, or delete the rules directly via the alerting v2 bulk_delete API.',
                }
              ),
              type: 'boolean',
              schema: schema.boolean(),
              requiresPageReload: false,
              solutionViews: ['classic', 'oblt'],
              technicalPreview: true,
              readonly: true,
              readonlyMode: 'ui',
            },
          });
        }

        core.uiSettings.registerGlobal({
          [OBSERVABILITY_STREAMS_CONTINUOUS_KI_EXTRACTION_ENABLED]: {
            category: ['observability'],
            name: i18n.translate('xpack.streams.continuousKiExtractionEnabledName', {
              defaultMessage: 'Continuous KI extraction enabled',
            }),
            value: false,
            description: i18n.translate('xpack.streams.continuousKiExtractionEnabledDescription', {
              defaultMessage:
                'When enabled, knowledge indicator extraction runs automatically on managed streams.',
            }),
            type: 'boolean',
            schema: schema.boolean(),
            scope: 'global',
            solutionViews: ['classic', 'oblt'],
            readonly: true,
            readonlyMode: 'ui',
          },
          [OBSERVABILITY_STREAMS_CONTINUOUS_KI_EXTRACTION_INTERVAL_HOURS]: {
            category: ['observability'],
            name: i18n.translate('xpack.streams.continuousKiExtractionIntervalHoursName', {
              defaultMessage: 'Continuous KI extraction interval (hours)',
            }),
            value: DEFAULT_EXTRACTION_INTERVAL_HOURS,
            description: i18n.translate(
              'xpack.streams.continuousKiExtractionIntervalHoursDescription',
              {
                defaultMessage:
                  'How often to run knowledge indicator extraction per stream, in hours.',
              }
            ),
            type: 'number',
            schema: schema.number({ min: 0 }),
            scope: 'global',
            solutionViews: ['classic', 'oblt'],
            readonly: true,
            readonlyMode: 'ui',
          },
          [OBSERVABILITY_STREAMS_CONTINUOUS_KI_EXTRACTION_EXCLUDED_STREAM_PATTERNS]: {
            category: ['observability'],
            name: i18n.translate('xpack.streams.continuousKiExtractionExcludedStreamPatternsName', {
              defaultMessage: 'Continuous KI extraction excluded streams',
            }),
            value: '',
            description: i18n.translate(
              'xpack.streams.continuousKiExtractionExcludedStreamPatternsDescription',
              {
                defaultMessage:
                  'Comma-separated list of stream names or glob patterns (e.g. logs.debug.*) to exclude from automatic knowledge indicator extraction.',
              }
            ),
            type: 'string',
            schema: schema.string(),
            scope: 'global',
            solutionViews: ['classic', 'oblt'],
            readonly: true,
            readonlyMode: 'ui',
          },
          [OBSERVABILITY_STREAMS_SIG_EVENTS_TUNING_CONFIG]: {
            category: ['observability'],
            name: i18n.translate('xpack.streams.sigEventsTuningConfigName', {
              defaultMessage: 'Significant Events tuning',
            }),
            value: JSON.stringify(DEFAULT_SIG_EVENTS_TUNING_CONFIG),
            description: i18n.translate('xpack.streams.sigEventsTuningConfigDescription', {
              defaultMessage:
                'JSON configuration for Significant Events tuning parameters including sample sizes, ratios, TTLs, and search thresholds.',
            }),
            type: 'json',
            schema: sigEventsTuningConfigSchema,
            scope: 'global',
            solutionViews: ['classic', 'oblt'],
            readonly: true,
            readonlyMode: 'ui',
          },
        });
      }
    })
    .catch((error) => {
      logger.error(`Failed to register significant events ui settings: ${error}`);
    });

  core.uiSettings.register({
    [OBSERVABILITY_STREAMS_ENABLE_CONTENT_PACKS]: {
      category: ['observability'],
      name: i18n.translate('xpack.streams.streamsContentPacksSettingsName', {
        defaultMessage: 'Streams content packs',
      }) as string,
      value: false,
      description: i18n.translate('xpack.streams.streamsContentPacksSettingsDescription', {
        defaultMessage: 'Enable Streams content packs.',
      }),
      type: 'boolean',
      schema: schema.boolean(),
      requiresPageReload: true,
      solutionViews: ['classic', 'oblt'],
      technicalPreview: true,
    },
    [OBSERVABILITY_STREAMS_ENABLE_QUERY_STREAMS]: {
      category: ['observability'],
      name: i18n.translate('xpack.streams.queryStreamsSettingsName', {
        defaultMessage: 'Query streams',
      }) as string,
      value: false,
      description: i18n.translate('xpack.streams.queryStreamsSettingsDescription', {
        defaultMessage: 'Enable Query streams.',
      }),
      type: 'boolean',
      schema: schema.boolean(),
      requiresPageReload: true,
      solutionViews: ['classic', 'oblt'],
      technicalPreview: true,
      readonly: true,
      readonlyMode: 'ui',
    },
    [OBSERVABILITY_STREAMS_ENABLE_WIRED_STREAM_VIEWS]: {
      category: ['observability'],
      name: i18n.translate('xpack.streams.wiredStreamViewsSettingsName', {
        defaultMessage: 'Wired stream views',
      }),
      value: false,
      description: i18n.translate('xpack.streams.wiredStreamViewsSettingsDescription', {
        defaultMessage: 'Enable ES|QL views for wired streams.',
      }),
      type: 'boolean',
      schema: schema.boolean(),
      requiresPageReload: true,
      solutionViews: ['classic', 'oblt'],
      technicalPreview: true,
      readonly: true,
      readonlyMode: 'ui',
    },
    [OBSERVABILITY_STREAMS_ENABLE_DRAFT_STREAMS]: {
      category: ['observability'],
      name: i18n.translate('xpack.streams.draftStreamsSettingsName', {
        defaultMessage: 'Draft streams',
      }),
      value: false,
      description: i18n.translate('xpack.streams.draftStreamsSettingsDescription', {
        defaultMessage:
          'Enable draft streams. Draft streams use ES|QL views for read-time processing and can be materialized to ingest pipelines.',
      }),
      type: 'boolean',
      schema: schema.boolean(),
      requiresPageReload: true,
      solutionViews: ['classic', 'oblt'],
      technicalPreview: true,
      readonly: true,
      readonlyMode: 'ui',
    },
    [OBSERVABILITY_STREAMS_ENABLE_CANVAS]: {
      category: ['observability'],
      name: i18n.translate('xpack.streams.canvasSettingsName', {
        defaultMessage: 'Streams Canvas',
      }),
      value: false,
      description: i18n.translate('xpack.streams.canvasSettingsDescription', {
        defaultMessage: 'Enable the Streams Canvas experience.',
      }),
      type: 'boolean',
      schema: schema.boolean(),
      requiresPageReload: true,
      solutionViews: ['classic', 'oblt'],
      technicalPreview: true,
      readonly: true,
      readonlyMode: 'ui',
    },
  });
}
