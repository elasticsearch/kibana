/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import useObservable from 'react-use/lib/useObservable';
import {
  EuiBadge,
  EuiBottomBar,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiConfirmModal,
  EuiFieldNumber,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiLink,
  EuiSpacer,
  EuiSplitPanel,
  EuiSwitch,
  EuiText,
  EuiTextArea,
  EuiTextColor,
  EuiTitle,
  EuiToolTip,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import {
  OBSERVABILITY_STREAMS_ENABLE_QUERY_STREAMS,
  OBSERVABILITY_STREAMS_SIGNIFICANT_EVENTS_INDEX_PATTERNS,
  OBSERVABILITY_STREAMS_SIGNIFICANT_EVENTS_TUNING_CONFIG,
} from '@kbn/management-settings-ids';
import { DEFAULT_INDEX_PATTERNS, parseIndexPatterns } from '@kbn/streams-schema';
import {
  DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG,
  type SignificantEventsTuningConfig,
} from '@kbn/significant-events-schema';
import {
  MIN_EXTRACTION_INTERVAL_HOURS,
  STREAMS_SIGNIFICANT_EVENTS_APPS_ENABLED_FLAG,
  MAX_SIG_EVENTS_SCHEDULED_BATCH_SIZE,
  MAX_SIG_EVENTS_SCHEDULED_REVIEW_PASSES,
  MIN_SIG_EVENTS_SCHEDULED_BATCH_SIZE,
  MIN_SIG_EVENTS_SCHEDULED_INTERVAL_MINUTES,
  MIN_SIG_EVENTS_SCHEDULED_REVIEW_PASSES,
} from '@kbn/significant-events-plugin/common';
import { useKibana } from '../../../../hooks/use_kibana';
import { useModelSettingsUrl } from '../../../../hooks/use_model_settings_url';
import { getFormattedError } from '../../../../util/errors';
import { useBlocksNewActivity } from '../../../../hooks/use_significant_events_maintenance';
import { useFetchStreams } from '../../hooks/use_fetch_streams';
import { useContinuousExtractionSettings } from './use_continuous_extraction_settings';
import { useScheduledDiscoverySettings } from './use_scheduled_discovery_settings';
import { summarizeIndexPatternsMatch } from './index_patterns_feedback';
import {
  SignificantEventsTuningConfigEditor,
  configToAnnotatedYaml,
} from './significant_events_tuning_config_editor';
import { AppsSection } from './apps_section';
import { MaintenanceSection } from './maintenance_section';
import { StaleEventCleanupSection } from './stale_event_cleanup_section';
import { RunLimitsSection } from './run_limits_section';
import { CostEstimate } from './cost_estimate';

const clampNumber = (value: string, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return min;
  }
  return Math.min(max, Math.max(min, parsed));
};

export function SettingsTab() {
  const { core } = useKibana();
  const modelSettingsUrl = useModelSettingsUrl();

  // Saving these settings hits two routes with different privileges: the streams
  // settings route (requires the streams `manage` privilege) and core's UI
  // settings routes used by `core.settings.client`/`globalClient` (require
  // `advancedSettings.save`). Gate the whole form on both so the user never
  // triggers a partial save that 403s halfway through.
  const canManageStreams = core.application.capabilities.streams?.manage === true;
  const canSaveAdvancedSettings = core.application.capabilities.advancedSettings?.save === true;
  const canEditSettings = canManageStreams && canSaveAdvancedSettings;

  // Pause turns these Settings toggles off (and Resume restores only those that
  // were previously on). While paused, the toggles are not editable.
  // `blocksActivity` is also true while status is loading (pessimistic).
  const {
    blocksActivity,
    isBlocked,
    status: maintenanceStatus,
    activityBlockTooltip,
  } = useBlocksNewActivity();
  const isActivityToggleDisabled = !canEditSettings || blocksActivity;
  const isActivityConfigDisabled = (draftEnabled: boolean) =>
    !canEditSettings || !draftEnabled || blocksActivity;

  // getBooleanValue$ builds a new observable on every call, so memoize it —
  // otherwise useObservable re-subscribes (and re-evaluates the flag) on every
  // render of this settings tab, not just when the flag actually changes.
  const isAppsEnabledObservable = useMemo(
    () => core.featureFlags.getBooleanValue$(STREAMS_SIGNIFICANT_EVENTS_APPS_ENABLED_FLAG, false),
    [core.featureFlags]
  );
  const isAppsEnabled = useObservable(isAppsEnabledObservable, false);

  const [savedIndexPatterns, setSavedIndexPatterns] = useState<string>(() =>
    core.settings.client.get<string>(
      OBSERVABILITY_STREAMS_SIGNIFICANT_EVENTS_INDEX_PATTERNS,
      DEFAULT_INDEX_PATTERNS
    )
  );
  const [indexPatterns, setIndexPatterns] = useState<string>(savedIndexPatterns);

  const isQueryStreamsEnabled = useMemo(
    () => core.settings.client.get<boolean>(OBSERVABILITY_STREAMS_ENABLE_QUERY_STREAMS, false),
    [core.settings.client]
  );

  const { data: streamsData } = useFetchStreams();
  const indexPatternsMatch = useMemo(() => {
    if (!streamsData) {
      return undefined;
    }
    return summarizeIndexPatternsMatch(
      parseIndexPatterns(indexPatterns),
      streamsData.streams.map((item) => item.stream)
    );
  }, [indexPatterns, streamsData]);

  const continuousExtraction = useContinuousExtractionSettings({
    globalClient: core.settings.globalClient,
    http: core.http,
    enabledFromStatus: maintenanceStatus?.featureSettings?.continuousOnboardingEnabled,
  });
  const scheduledDiscovery = useScheduledDiscoverySettings({
    client: core.settings.client,
    http: core.http,
    enabledFromStatus: maintenanceStatus?.featureSettings?.scheduledDiscoveryEnabled,
  });

  // Dirty continuous/scheduled changes are blocked while paused (server 409).
  const activitySettingsDirty = scheduledDiscovery.hasChanged || continuousExtraction.hasChanged;
  const saveBlockedByPause = blocksActivity && activitySettingsDirty;

  const savedConfigYaml = useMemo(() => {
    try {
      const raw = core.settings.globalClient.get<unknown>(
        OBSERVABILITY_STREAMS_SIGNIFICANT_EVENTS_TUNING_CONFIG,
        DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG
      );
      const parsed =
        typeof raw === 'string'
          ? (JSON.parse(raw) as Partial<SignificantEventsTuningConfig>)
          : (raw as Partial<SignificantEventsTuningConfig>);
      return configToAnnotatedYaml({ ...DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG, ...parsed });
    } catch {
      return configToAnnotatedYaml(DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [draftConfigYaml, setDraftConfigYaml] = useState<string>(savedConfigYaml);
  const [parsedTuningConfig, setParsedTuningConfig] =
    useState<SignificantEventsTuningConfig | null>(null);
  const [savedConfigYamlState, setSavedConfigYamlState] = useState<string>(savedConfigYaml);

  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmingZeroMatch, setIsConfirmingZeroMatch] = useState(false);
  const zeroMatchConfirmModalTitleId = useGeneratedHtmlId({ prefix: 'zeroMatchConfirmModalTitle' });

  const hasTuningConfigChanges = draftConfigYaml !== savedConfigYamlState;
  const hasChanges =
    indexPatterns !== savedIndexPatterns ||
    continuousExtraction.hasChanged ||
    scheduledDiscovery.hasChanged ||
    hasTuningConfigChanges;

  const handleCancel = useCallback(() => {
    setIndexPatterns(savedIndexPatterns);
    continuousExtraction.reset();
    scheduledDiscovery.reset();
    setDraftConfigYaml(savedConfigYamlState);
    setParsedTuningConfig(null);
  }, [savedIndexPatterns, savedConfigYamlState, continuousExtraction, scheduledDiscovery]);

  const performSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const normalizedIndexPatterns = parseIndexPatterns(indexPatterns).join(', ');
      setIndexPatterns(normalizedIndexPatterns);
      if (normalizedIndexPatterns !== savedIndexPatterns) {
        await core.settings.client.set(
          OBSERVABILITY_STREAMS_SIGNIFICANT_EVENTS_INDEX_PATTERNS,
          normalizedIndexPatterns
        );
        setSavedIndexPatterns(normalizedIndexPatterns);
      }

      if (continuousExtraction.hasChanged) {
        await continuousExtraction.save();
      }

      if (scheduledDiscovery.hasChanged) {
        await scheduledDiscovery.save();
      }

      if (hasTuningConfigChanges && parsedTuningConfig) {
        const fullConfig = { ...DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG, ...parsedTuningConfig };
        await core.settings.globalClient.set(
          OBSERVABILITY_STREAMS_SIGNIFICANT_EVENTS_TUNING_CONFIG,
          JSON.stringify(fullConfig)
        );
        const newSavedYaml = configToAnnotatedYaml(fullConfig);
        setSavedConfigYamlState(newSavedYaml);
        setDraftConfigYaml(newSavedYaml);
        setParsedTuningConfig(null);
      }
    } catch (err) {
      core.notifications.toasts.addDanger({
        title: i18n.translate('xpack.significantEventsApp.settings.saveErrorTitle', {
          defaultMessage: 'Failed to save settings',
        }),
        text: getFormattedError(err).message,
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    core.settings.client,
    core.settings.globalClient,
    core.notifications.toasts,
    indexPatterns,
    savedIndexPatterns,
    continuousExtraction,
    scheduledDiscovery,
    hasTuningConfigChanges,
    parsedTuningConfig,
  ]);

  const handleSave = useCallback(() => {
    // Index patterns are forward-looking (they may match streams that don't
    // exist yet), so zero current matches is a confirmable nudge, not a hard
    // block. Only prompt when the patterns actually changed and the stream list
    // has loaded, so a failed/pending fetch can't wrongly block a valid save.
    // Query streams are always eligible independent of patterns, so don't prompt
    // when enabled query streams mean something will still be onboarded.
    const patternsChanged = parseIndexPatterns(indexPatterns).join(', ') !== savedIndexPatterns;
    const queryStreamsEligible =
      isQueryStreamsEnabled && (indexPatternsMatch?.queryStreamCount ?? 0) > 0;
    if (
      patternsChanged &&
      indexPatternsMatch &&
      indexPatternsMatch.matchedStreamCount === 0 &&
      !queryStreamsEligible
    ) {
      setIsConfirmingZeroMatch(true);
      return;
    }
    void performSave();
  }, [indexPatterns, savedIndexPatterns, indexPatternsMatch, isQueryStreamsEnabled, performSave]);

  const handleConfirmZeroMatch = useCallback(() => {
    setIsConfirmingZeroMatch(false);
    void performSave();
  }, [performSave]);

  return (
    <>
      {!canEditSettings && (
        <>
          <EuiCallOut
            title={i18n.translate('xpack.significantEventsApp.settings.noPermissionCalloutTitle', {
              defaultMessage: 'You need additional privileges to edit these settings',
            })}
            color="warning"
            iconType="lock"
            data-test-subj="streams-settings-no-permission-callout"
            announceOnMount={false}
          >
            <p>
              {i18n.translate(
                'xpack.significantEventsApp.settings.noPermissionCalloutDescription',
                {
                  defaultMessage:
                    'Editing these settings requires both the Streams "Manage" privilege and the Advanced Settings "All" privilege. Contact your administrator if you need to make changes.',
                }
              )}
            </p>
          </EuiCallOut>
          <EuiSpacer />
        </>
      )}
      <MaintenanceSection canManage={canManageStreams} />

      <EuiSpacer />

      <StaleEventCleanupSection canManage={canManageStreams} />

      <CostEstimate />

      <EuiSpacer />

      <RunLimitsSection />

      <EuiSpacer />

      <EuiSplitPanel.Outer hasBorder hasShadow={false} css={{ flexShrink: 0 }}>
        <EuiSplitPanel.Inner color="subdued">
          <EuiTitle size="xs">
            <h3>
              {i18n.translate('xpack.significantEventsApp.settings.llmSectionTitle', {
                defaultMessage: 'LLM selection',
              })}
            </h3>
          </EuiTitle>
        </EuiSplitPanel.Inner>
        <EuiSplitPanel.Inner>
          <EuiText size="s">
            <p>
              {i18n.translate('xpack.significantEventsApp.settings.modelSettingsDescription', {
                defaultMessage:
                  'LLM models for Significant Events features are managed centrally in the Model Settings page under Stack Management.',
              })}
            </p>
          </EuiText>
          {modelSettingsUrl && (
            <>
              <EuiSpacer size="s" />
              <EuiLink href={modelSettingsUrl} external>
                {i18n.translate('xpack.significantEventsApp.settings.modelSettingsLink', {
                  defaultMessage: 'Go to Model Settings',
                })}
              </EuiLink>
            </>
          )}
        </EuiSplitPanel.Inner>
      </EuiSplitPanel.Outer>

      <EuiSpacer />

      <EuiSplitPanel.Outer hasBorder hasShadow={false} css={{ flexShrink: 0 }}>
        <EuiSplitPanel.Inner color="subdued">
          <EuiTitle size="xs">
            <h3>
              {i18n.translate('xpack.significantEventsApp.settings.scheduledDiscoveryTitle', {
                defaultMessage: 'Scheduled discovery',
              })}
            </h3>
          </EuiTitle>
        </EuiSplitPanel.Inner>
        <EuiSplitPanel.Inner>
          <EuiFlexGroup alignItems="flexStart" gutterSize="l">
            <EuiFlexItem grow={2}>
              <EuiFlexGroup direction="column" gutterSize="xs">
                <EuiFlexItem>
                  <EuiTitle size="xxs">
                    <h4>
                      {i18n.translate(
                        'xpack.significantEventsApp.settings.scheduledDiscoveryLabel',
                        { defaultMessage: 'Scheduled discovery' }
                      )}
                    </h4>
                  </EuiTitle>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText color="subdued" size="s">
                    {isBlocked
                      ? i18n.translate(
                          'xpack.significantEventsApp.settings.scheduledDiscoveryPausedHelp',
                          {
                            defaultMessage:
                              'Turned off while Significant Events activity is paused. Resume above to restore scheduled discovery if it was enabled before pause.',
                          }
                        )
                      : i18n.translate(
                          'xpack.significantEventsApp.settings.scheduledDiscoveryHelp',
                          {
                            defaultMessage:
                              'When enabled, Significant Events detection and discovery run automatically in the current Kibana space.',
                          }
                        )}
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem grow={5}>
              <EuiForm component="div">
                <EuiFormRow>
                  <EuiToolTip content={activityBlockTooltip}>
                    <EuiSwitch
                      data-test-subj="streams-settings-scheduled-discovery-toggle"
                      label={i18n.translate(
                        'xpack.significantEventsApp.settings.enableScheduledDiscovery',
                        { defaultMessage: 'Enable scheduled discovery' }
                      )}
                      checked={scheduledDiscovery.draft.enabled}
                      onChange={(e) =>
                        scheduledDiscovery.setDraft((prev) => ({
                          ...prev,
                          enabled: e.target.checked,
                        }))
                      }
                      disabled={isActivityToggleDisabled}
                    />
                  </EuiToolTip>
                </EuiFormRow>
                {scheduledDiscovery.draft.enabled && (
                  <>
                    <EuiFormRow
                      label={i18n.translate(
                        'xpack.significantEventsApp.settings.detectionIntervalLabel',
                        { defaultMessage: 'Detection interval (minutes)' }
                      )}
                      helpText={i18n.translate(
                        'xpack.significantEventsApp.settings.detectionIntervalHelp',
                        { defaultMessage: 'How often scheduled detection runs.' }
                      )}
                    >
                      <EuiFieldNumber
                        data-test-subj="streams-settings-scheduled-detection-interval"
                        value={scheduledDiscovery.draft.detectionIntervalMinutes}
                        onChange={(e) =>
                          scheduledDiscovery.setDraft((prev) => ({
                            ...prev,
                            detectionIntervalMinutes: clampNumber(
                              e.target.value,
                              MIN_SIG_EVENTS_SCHEDULED_INTERVAL_MINUTES,
                              Number.MAX_SAFE_INTEGER
                            ),
                          }))
                        }
                        min={MIN_SIG_EVENTS_SCHEDULED_INTERVAL_MINUTES}
                        disabled={isActivityConfigDisabled(scheduledDiscovery.draft.enabled)}
                      />
                    </EuiFormRow>
                    <EuiFormRow
                      label={i18n.translate(
                        'xpack.significantEventsApp.settings.targetCoverageLabel',
                        { defaultMessage: 'Target coverage (minutes)' }
                      )}
                      helpText={i18n.translate(
                        'xpack.significantEventsApp.settings.targetCoverageHelp',
                        {
                          defaultMessage:
                            'Every active rule is scanned at least once within this window. Must exceed the detection interval to spread the fleet across runs.',
                        }
                      )}
                    >
                      <EuiFieldNumber
                        data-test-subj="streams-settings-scheduled-target-coverage"
                        value={scheduledDiscovery.draft.targetCoverageMinutes}
                        onChange={(e) =>
                          scheduledDiscovery.setDraft((prev) => ({
                            ...prev,
                            targetCoverageMinutes: clampNumber(
                              e.target.value,
                              MIN_SIG_EVENTS_SCHEDULED_INTERVAL_MINUTES,
                              Number.MAX_SAFE_INTEGER
                            ),
                          }))
                        }
                        min={MIN_SIG_EVENTS_SCHEDULED_INTERVAL_MINUTES}
                        disabled={isActivityConfigDisabled(scheduledDiscovery.draft.enabled)}
                      />
                    </EuiFormRow>
                    <EuiFormRow
                      label={i18n.translate(
                        'xpack.significantEventsApp.settings.reviewIntervalLabel',
                        { defaultMessage: 'Review interval (minutes)' }
                      )}
                      helpText={i18n.translate(
                        'xpack.significantEventsApp.settings.reviewIntervalHelp',
                        { defaultMessage: 'How often scheduled discovery review runs.' }
                      )}
                    >
                      <EuiFieldNumber
                        data-test-subj="streams-settings-scheduled-review-interval"
                        value={scheduledDiscovery.draft.reviewIntervalMinutes}
                        onChange={(e) =>
                          scheduledDiscovery.setDraft((prev) => ({
                            ...prev,
                            reviewIntervalMinutes: clampNumber(
                              e.target.value,
                              MIN_SIG_EVENTS_SCHEDULED_INTERVAL_MINUTES,
                              Number.MAX_SAFE_INTEGER
                            ),
                          }))
                        }
                        min={MIN_SIG_EVENTS_SCHEDULED_INTERVAL_MINUTES}
                        disabled={isActivityConfigDisabled(scheduledDiscovery.draft.enabled)}
                      />
                    </EuiFormRow>
                    <EuiFormRow
                      label={i18n.translate(
                        'xpack.significantEventsApp.settings.discoveryBatchSizeLabel',
                        { defaultMessage: 'Discovery batch size' }
                      )}
                      helpText={i18n.translate(
                        'xpack.significantEventsApp.settings.discoveryBatchSizeHelp',
                        {
                          defaultMessage:
                            'Maximum detections sent to each scheduled discovery pass.',
                        }
                      )}
                    >
                      <EuiFieldNumber
                        data-test-subj="streams-settings-scheduled-discovery-batch-size"
                        value={scheduledDiscovery.draft.discoveryBatchSize}
                        onChange={(e) =>
                          scheduledDiscovery.setDraft((prev) => ({
                            ...prev,
                            discoveryBatchSize: clampNumber(
                              e.target.value,
                              MIN_SIG_EVENTS_SCHEDULED_BATCH_SIZE,
                              MAX_SIG_EVENTS_SCHEDULED_BATCH_SIZE
                            ),
                          }))
                        }
                        min={MIN_SIG_EVENTS_SCHEDULED_BATCH_SIZE}
                        max={MAX_SIG_EVENTS_SCHEDULED_BATCH_SIZE}
                        disabled={isActivityConfigDisabled(scheduledDiscovery.draft.enabled)}
                      />
                    </EuiFormRow>
                    <EuiFormRow
                      label={i18n.translate(
                        'xpack.significantEventsApp.settings.maxReviewPassesLabel',
                        { defaultMessage: 'Review passes' }
                      )}
                      helpText={i18n.translate(
                        'xpack.significantEventsApp.settings.maxReviewPassesHelp',
                        {
                          defaultMessage: 'Maximum discovery passes per scheduled review run.',
                        }
                      )}
                    >
                      <EuiFieldNumber
                        data-test-subj="streams-settings-scheduled-max-review-passes"
                        value={scheduledDiscovery.draft.maxReviewPasses}
                        onChange={(e) =>
                          scheduledDiscovery.setDraft((prev) => ({
                            ...prev,
                            maxReviewPasses: clampNumber(
                              e.target.value,
                              MIN_SIG_EVENTS_SCHEDULED_REVIEW_PASSES,
                              MAX_SIG_EVENTS_SCHEDULED_REVIEW_PASSES
                            ),
                          }))
                        }
                        min={MIN_SIG_EVENTS_SCHEDULED_REVIEW_PASSES}
                        max={MAX_SIG_EVENTS_SCHEDULED_REVIEW_PASSES}
                        disabled={isActivityConfigDisabled(scheduledDiscovery.draft.enabled)}
                      />
                    </EuiFormRow>
                  </>
                )}
              </EuiForm>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiSplitPanel.Inner>
      </EuiSplitPanel.Outer>

      <EuiSpacer />

      <EuiSplitPanel.Outer hasBorder hasShadow={false} css={{ flexShrink: 0 }}>
        <EuiSplitPanel.Inner color="subdued">
          <EuiTitle size="xs">
            <h3>
              {i18n.translate('xpack.significantEventsApp.settings.dataSourcesSectionTitle', {
                defaultMessage: 'Data sources',
              })}
            </h3>
          </EuiTitle>
        </EuiSplitPanel.Inner>
        <EuiSplitPanel.Inner>
          <EuiFlexGroup alignItems="flexStart" gutterSize="l">
            <EuiFlexItem grow={2}>
              <EuiFlexGroup direction="column" gutterSize="xs">
                <EuiFlexItem>
                  <EuiTitle size="xxs">
                    <h4>
                      {i18n.translate('xpack.significantEventsApp.settings.indexPatternsLabel', {
                        defaultMessage: 'Index patterns',
                      })}
                    </h4>
                  </EuiTitle>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText color="subdued" size="s">
                    {i18n.translate('xpack.significantEventsApp.settings.indexPatternsHelp', {
                      defaultMessage:
                        'Comma-separated list of index patterns to use for feature detection and analysis.',
                    })}{' '}
                    {i18n.translate('xpack.significantEventsApp.settings.indexPatternsDefault', {
                      defaultMessage: 'Default:',
                    })}{' '}
                    <EuiBadge color="hollow">{DEFAULT_INDEX_PATTERNS}</EuiBadge>
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem grow={5}>
              <EuiForm component="div">
                <EuiFormRow>
                  <EuiTextArea
                    data-test-subj="streams-settings-index-patterns"
                    value={indexPatterns}
                    onChange={(e) => setIndexPatterns(e.target.value)}
                    placeholder={DEFAULT_INDEX_PATTERNS}
                    rows={2}
                    disabled={!canEditSettings}
                  />
                </EuiFormRow>
                {indexPatternsMatch && (
                  <EuiText size="xs" data-test-subj="streams-settings-index-patterns-feedback">
                    {indexPatternsMatch.matchedStreamCount > 0 && (
                      <p>
                        {i18n.translate(
                          'xpack.significantEventsApp.settings.indexPatternsMatchCount',
                          {
                            defaultMessage:
                              'Matches {count, plural, one {# stream} other {# streams}}.',
                            values: { count: indexPatternsMatch.matchedStreamCount },
                          }
                        )}
                      </p>
                    )}
                    {indexPatternsMatch.unmatchedPatterns.length > 0 && (
                      <p>
                        <EuiTextColor color="warning">
                          {i18n.translate(
                            'xpack.significantEventsApp.settings.indexPatternsNoMatch',
                            {
                              defaultMessage:
                                '{count, plural, one {# pattern matches} other {# patterns match}} no current streams: {patterns}',
                              values: {
                                count: indexPatternsMatch.unmatchedPatterns.length,
                                patterns: indexPatternsMatch.unmatchedPatterns.join(', '),
                              },
                            }
                          )}
                        </EuiTextColor>
                      </p>
                    )}
                  </EuiText>
                )}
              </EuiForm>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiSplitPanel.Inner>
      </EuiSplitPanel.Outer>

      <EuiSpacer />

      <EuiSplitPanel.Outer hasBorder hasShadow={false} css={{ flexShrink: 0 }}>
        <EuiSplitPanel.Inner color="subdued">
          <EuiTitle size="xs">
            <h3>
              {i18n.translate('xpack.significantEventsApp.settings.continuousKiOnboardingTitle', {
                defaultMessage: 'Continuous KI onboarding',
              })}
            </h3>
          </EuiTitle>
        </EuiSplitPanel.Inner>
        <EuiSplitPanel.Inner>
          <EuiFlexGroup alignItems="flexStart" gutterSize="l">
            <EuiFlexItem grow={2}>
              <EuiFlexGroup direction="column" gutterSize="xs">
                <EuiFlexItem>
                  <EuiTitle size="xxs">
                    <h4>
                      {i18n.translate(
                        'xpack.significantEventsApp.settings.continuousKiOnboardingLabel',
                        { defaultMessage: 'Automatic onboarding' }
                      )}
                    </h4>
                  </EuiTitle>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText color="subdued" size="s">
                    {isBlocked
                      ? i18n.translate(
                          'xpack.significantEventsApp.settings.continuousKiOnboardingPausedHelp',
                          {
                            defaultMessage:
                              'Turned off while Significant Events activity is paused. Resume above to restore continuous onboarding if it was enabled before pause.',
                          }
                        )
                      : i18n.translate(
                          'xpack.significantEventsApp.settings.continuousKiOnboardingHelp',
                          {
                            defaultMessage:
                              'When enabled, knowledge indicator onboarding runs automatically on managed streams at the configured interval.',
                          }
                        )}
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem grow={5}>
              <EuiForm component="div">
                <EuiFormRow>
                  <EuiToolTip content={activityBlockTooltip}>
                    <EuiSwitch
                      data-test-subj="streams-settings-continuous-onboarding-toggle"
                      label={i18n.translate(
                        'xpack.significantEventsApp.settings.enableContinuousKiOnboarding',
                        { defaultMessage: 'Enable continuous KI onboarding' }
                      )}
                      checked={continuousExtraction.draft.enabled}
                      onChange={(e) =>
                        continuousExtraction.setDraft((prev) => ({
                          ...prev,
                          enabled: e.target.checked,
                        }))
                      }
                      disabled={isActivityToggleDisabled}
                    />
                  </EuiToolTip>
                </EuiFormRow>
                {continuousExtraction.draft.enabled && (
                  <>
                    <EuiFormRow>
                      <EuiText color="subdued" size="xs">
                        <p>
                          {i18n.translate(
                            'xpack.significantEventsApp.settings.continuousKiOnboardingScopeHelp',
                            {
                              defaultMessage:
                                'Onboards the streams matching your index patterns in the Data sources section above.',
                            }
                          )}
                        </p>
                        {isQueryStreamsEnabled &&
                          indexPatternsMatch &&
                          indexPatternsMatch.queryStreamCount > 0 && (
                            <p data-test-subj="streams-settings-onboarding-query-streams-note">
                              {i18n.translate(
                                'xpack.significantEventsApp.settings.continuousKiOnboardingQueryStreamsNote',
                                {
                                  defaultMessage:
                                    'Also onboards {count, plural, one {# query stream} other {# query streams}}, which are always eligible regardless of index patterns.',
                                  values: { count: indexPatternsMatch.queryStreamCount },
                                }
                              )}
                            </p>
                          )}
                      </EuiText>
                    </EuiFormRow>
                    <EuiFormRow
                      label={i18n.translate(
                        'xpack.significantEventsApp.settings.onboardingIntervalLabel',
                        { defaultMessage: 'Onboarding interval (hours)' }
                      )}
                      helpText={i18n.translate(
                        'xpack.significantEventsApp.settings.onboardingIntervalHelp',
                        {
                          defaultMessage:
                            'Minimum period in hours between onboarding runs for a given stream. Set to 0 for no cooldown between runs.',
                        }
                      )}
                    >
                      <EuiFieldNumber
                        data-test-subj="streams-settings-onboarding-interval"
                        value={continuousExtraction.draft.intervalHours}
                        onChange={(e) =>
                          continuousExtraction.setDraft((prev) => ({
                            ...prev,
                            intervalHours: Math.max(
                              MIN_EXTRACTION_INTERVAL_HOURS,
                              Number(e.target.value) || 0
                            ),
                          }))
                        }
                        min={MIN_EXTRACTION_INTERVAL_HOURS}
                        disabled={isActivityConfigDisabled(continuousExtraction.draft.enabled)}
                      />
                    </EuiFormRow>
                  </>
                )}
              </EuiForm>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiSplitPanel.Inner>
      </EuiSplitPanel.Outer>

      <EuiSpacer />

      <EuiSplitPanel.Outer hasBorder hasShadow={false} css={{ flexShrink: 0 }}>
        <EuiSplitPanel.Inner color="subdued">
          <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiTitle size="xs">
                <h3>
                  {i18n.translate('xpack.significantEventsApp.settings.tuningTitle', {
                    defaultMessage: 'Significant Events tuning',
                  })}
                </h3>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                size="s"
                iconType="refresh"
                isDisabled={!canEditSettings}
                onClick={() => {
                  const defaultYaml = configToAnnotatedYaml(
                    DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG
                  );
                  setDraftConfigYaml(defaultYaml);
                  setParsedTuningConfig(DEFAULT_SIGNIFICANT_EVENTS_TUNING_CONFIG);
                }}
              >
                {i18n.translate('xpack.significantEventsApp.settings.resetToDefaults', {
                  defaultMessage: 'Reset to defaults',
                })}
              </EuiButtonEmpty>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiSplitPanel.Inner>
        <EuiSplitPanel.Inner>
          <EuiCallOut
            size="s"
            color="warning"
            iconType="warning"
            title={i18n.translate('xpack.significantEventsApp.settings.tuningInfo', {
              defaultMessage:
                'These are advanced settings that control how features are discovered and queries are searched. Incorrect values may degrade onboarding quality or cause unexpected behavior. Changes take effect on the next run.',
            })}
          />
          <EuiSpacer size="m" />
          <SignificantEventsTuningConfigEditor
            value={draftConfigYaml}
            isReadOnly={!canEditSettings}
            onChange={(yaml, parsed) => {
              setDraftConfigYaml(yaml);
              setParsedTuningConfig(parsed);
            }}
          />
        </EuiSplitPanel.Inner>
      </EuiSplitPanel.Outer>

      {isAppsEnabled && <AppsSection canEdit={canEditSettings} />}

      {isConfirmingZeroMatch && (
        <EuiConfirmModal
          aria-labelledby={zeroMatchConfirmModalTitleId}
          data-test-subj="streams-settings-zero-match-confirm"
          title={i18n.translate('xpack.significantEventsApp.settings.zeroMatchConfirmTitle', {
            defaultMessage: 'No streams match these patterns',
          })}
          titleProps={{ id: zeroMatchConfirmModalTitleId }}
          onCancel={() => setIsConfirmingZeroMatch(false)}
          onConfirm={handleConfirmZeroMatch}
          cancelButtonText={i18n.translate(
            'xpack.significantEventsApp.settings.zeroMatchConfirmCancel',
            { defaultMessage: 'Keep editing' }
          )}
          confirmButtonText={i18n.translate(
            'xpack.significantEventsApp.settings.zeroMatchConfirmConfirm',
            { defaultMessage: 'Save anyway' }
          )}
          buttonColor="warning"
        >
          <p>
            {i18n.translate('xpack.significantEventsApp.settings.zeroMatchConfirmBody', {
              defaultMessage:
                'None of your index patterns match any current stream, so Significant Events will not detect or onboard anything yet. Patterns can match streams created later. Save anyway?',
            })}
          </p>
        </EuiConfirmModal>
      )}

      {hasChanges && (
        <EuiBottomBar data-test-subj="streams-significant-events-settings-bottom-bar">
          <EuiFlexGroup justifyContent="flexEnd">
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="s">
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty
                    data-test-subj="streams-settings-cancel-button"
                    color="text"
                    size="s"
                    onClick={handleCancel}
                    isDisabled={isSaving}
                  >
                    {i18n.translate('xpack.significantEventsApp.settings.cancelButton', {
                      defaultMessage: 'Cancel',
                    })}
                  </EuiButtonEmpty>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiToolTip content={saveBlockedByPause ? activityBlockTooltip : undefined}>
                    <EuiButton
                      data-test-subj="streams-settings-save-button"
                      color="primary"
                      fill
                      size="s"
                      onClick={handleSave}
                      isLoading={isSaving}
                      isDisabled={
                        !canEditSettings ||
                        saveBlockedByPause ||
                        (hasTuningConfigChanges && parsedTuningConfig === null)
                      }
                      hasAriaDisabled={saveBlockedByPause}
                    >
                      {i18n.translate('xpack.significantEventsApp.settings.saveChangesButton', {
                        defaultMessage: 'Save changes',
                      })}
                    </EuiButton>
                  </EuiToolTip>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiBottomBar>
      )}
    </>
  );
}
