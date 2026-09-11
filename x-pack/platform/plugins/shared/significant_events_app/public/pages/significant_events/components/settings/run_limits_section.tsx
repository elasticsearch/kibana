/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiConfirmModal,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiSplitPanel,
  EuiSwitch,
  EuiText,
  EuiTitle,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { RunQuotaGroup } from '@kbn/significant-events-plugin/common';
import {
  useRunQuotas,
  useUpdateRunQuotas,
} from '../../../../hooks/use_significant_events_run_quotas';
import { RunQuotaExhaustionCallout } from '../run_limits_banner';
import {
  buildRunQuotaSettingsUpdate,
  createRunQuotaDraftState,
  hasRunQuotaDraftChanges,
  isFiniteRunLimit,
  isLowerFiniteLimit,
  RUN_QUOTA_GROUPS,
  type RunLimitDraft,
  type RunQuotaDraftState,
} from './run_limit_draft';
import { RunLimitRow, RUN_QUOTA_GROUP_LABELS } from './run_limit_row';

interface SaveWarnings {
  disabling: boolean;
  enablingExhaustedGroups: RunQuotaGroup[];
  loweringGroups: RunQuotaGroup[];
}

const hasSaveWarnings = ({
  disabling,
  enablingExhaustedGroups,
  loweringGroups,
}: SaveWarnings): boolean =>
  disabling || enablingExhaustedGroups.length > 0 || loweringGroups.length > 0;

export const RunLimitsSection = () => {
  const quotas = useRunQuotas();
  const { save, isSaving } = useUpdateRunQuotas();
  const [draftState, setDraftState] = useState<RunQuotaDraftState>();
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [saveError, setSaveError] = useState<Error>();
  const confirmationModalTitleId = useGeneratedHtmlId({
    prefix: 'saveRunLimitsConfirmationModalTitle',
  });

  useEffect(() => {
    if (!quotas.data) {
      return;
    }
    setDraftState((current) =>
      current && hasRunQuotaDraftChanges(current) ? current : createRunQuotaDraftState(quotas.data)
    );
  }, [quotas.data]);

  const update = useMemo(
    () => (draftState ? buildRunQuotaSettingsUpdate(draftState) : undefined),
    [draftState]
  );

  const warnings = useMemo<SaveWarnings>(() => {
    if (!draftState || !quotas.data) {
      return {
        disabling: false,
        enablingExhaustedGroups: [],
        loweringGroups: [],
      };
    }
    const response = quotas.data;

    const enabling =
      !draftState.saved.enabled && draftState.draft.enabled
        ? RUN_QUOTA_GROUPS.filter((group) => {
            const limit = draftState.draft.limits[group];
            return isFiniteRunLimit(limit) && response.counts[group] >= limit;
          })
        : [];
    const lowering = RUN_QUOTA_GROUPS.filter((group) => {
      const next = draftState.draft.limits[group];
      return (
        next !== draftState.saved.limits[group] &&
        isLowerFiniteLimit(draftState.saved.limits[group], next) &&
        response.counts[group] >= next
      );
    });

    return {
      disabling: draftState.saved.enabled && !draftState.draft.enabled,
      enablingExhaustedGroups: enabling,
      loweringGroups: lowering,
    };
  }, [draftState, quotas.data]);

  const performSave = useCallback(async () => {
    if (!update) {
      return;
    }

    setSaveError(undefined);
    try {
      const response = await save(update);
      setDraftState(createRunQuotaDraftState(response));
      setShowConfirmation(false);
    } catch (error) {
      setShowConfirmation(false);
      setSaveError(error instanceof Error ? error : new Error(String(error)));
    }
  }, [save, update]);

  const handleSave = useCallback(() => {
    if (hasSaveWarnings(warnings)) {
      setShowConfirmation(true);
      return;
    }
    void performSave();
  }, [performSave, warnings]);

  const updateEnabledDraft = useCallback((enabled: boolean) => {
    setSaveError(undefined);
    setDraftState((current) =>
      current
        ? {
            ...current,
            draft: {
              ...current.draft,
              enabled,
            },
          }
        : current
    );
  }, []);

  const updateLimitDraft = useCallback((group: RunQuotaGroup, limit: RunLimitDraft) => {
    setSaveError(undefined);
    setDraftState((current) =>
      current
        ? {
            ...current,
            draft: {
              ...current.draft,
              limits: {
                ...current.draft.limits,
                [group]: limit,
              },
            },
          }
        : current
    );
  }, []);

  const canManage = quotas.data?.canManage === true;
  const isDirty = draftState ? hasRunQuotaDraftChanges(draftState) : false;
  const response = quotas.data;

  const confirmationTitle = warnings.disabling
    ? i18n.translate('xpack.significantEventsApp.settings.runLimits.disableConfirmTitle', {
        defaultMessage: 'Disable daily run limits?',
      })
    : warnings.enablingExhaustedGroups.length > 0
    ? i18n.translate('xpack.significantEventsApp.settings.runLimits.enableReachedConfirmTitle', {
        defaultMessage: 'Enable enforcement with reached limits?',
      })
    : i18n.translate('xpack.significantEventsApp.settings.runLimits.loweringConfirmTitle', {
        defaultMessage: 'Lower limits to values already reached?',
      });

  const confirmationButtonText = warnings.disabling
    ? i18n.translate('xpack.significantEventsApp.settings.runLimits.disableConfirmButtonLabel', {
        defaultMessage: 'Disable and save changes',
      })
    : warnings.enablingExhaustedGroups.length > 0
    ? i18n.translate('xpack.significantEventsApp.settings.runLimits.enableConfirmButtonLabel', {
        defaultMessage: 'Enable and save changes',
      })
    : i18n.translate('xpack.significantEventsApp.settings.runLimits.loweringConfirmButtonLabel', {
        defaultMessage: 'Save lower limits',
      });

  return (
    <>
      <EuiSplitPanel.Outer hasBorder hasShadow={false} css={{ flexShrink: 0 }}>
        <EuiSplitPanel.Inner color="subdued">
          <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
            <EuiFlexItem>
              <EuiTitle size="xs">
                <h3>
                  {i18n.translate('xpack.significantEventsApp.settings.runLimits.sectionTitle', {
                    defaultMessage: 'Daily run limits',
                  })}
                </h3>
              </EuiTitle>
            </EuiFlexItem>
            {draftState && quotas.data && (
              <EuiFlexItem grow={false}>
                <EuiSwitch
                  data-test-subj="significantEventsRunLimitsEnforcementSwitch"
                  label={i18n.translate(
                    'xpack.significantEventsApp.settings.runLimits.enforcementSwitchLabel',
                    {
                      defaultMessage: 'Enforce daily limits',
                    }
                  )}
                  checked={draftState.draft.enabled}
                  disabled={!canManage || isSaving}
                  onChange={(event) => updateEnabledDraft(event.target.checked)}
                />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiSplitPanel.Inner>
        <EuiSplitPanel.Inner hasBorder={false}>
          <EuiText size="s">
            <p>
              {i18n.translate('xpack.significantEventsApp.settings.runLimits.sectionDescription', {
                defaultMessage:
                  'These deployment-wide limits apply only to Significant Events scheduled automation. Manual runs are not limited.',
              })}
            </p>
          </EuiText>

          {quotas.isLoading && <EuiLoadingSpinner size="m" />}

          {quotas.isError && (
            <EuiCallOut
              announceOnMount
              color="danger"
              iconType="error"
              title={i18n.translate(
                'xpack.significantEventsApp.settings.runLimits.loadErrorMessage',
                {
                  defaultMessage: 'Could not load daily run limits',
                }
              )}
            >
              <EuiButton size="s" onClick={() => void quotas.refetch()}>
                {i18n.translate('xpack.significantEventsApp.settings.runLimits.retryButtonLabel', {
                  defaultMessage: 'Retry',
                })}
              </EuiButton>
            </EuiCallOut>
          )}

          {!quotas.isLoading && !quotas.isError && response && draftState && (
            <>
              <EuiText size="s" color="subdued">
                <p data-test-subj="significantEventsRunLimitsEnforcementDescription">
                  {draftState.draft.enabled
                    ? i18n.translate(
                        'xpack.significantEventsApp.settings.runLimits.enabledDescription',
                        {
                          defaultMessage:
                            'Enforcement is on. Finite limits can deny new scheduled admissions after their count reaches the limit.',
                        }
                      )
                    : i18n.translate(
                        'xpack.significantEventsApp.settings.runLimits.disabledDescription',
                        {
                          defaultMessage:
                            'Enforcement is off. Successfully recorded scheduled admissions are still counted, but finite limits do not deny new work.',
                        }
                      )}
                </p>
              </EuiText>

              {draftState.draft.enabled && (
                <>
                  <RunQuotaExhaustionCallout
                    enabled={response.enabled}
                    limits={response.limits}
                    counts={response.counts}
                  />

                  <EuiSpacer />
                  {RUN_QUOTA_GROUPS.map((group, index) => (
                    <React.Fragment key={group}>
                      {index > 0 && <EuiHorizontalRule margin="l" />}
                      <RunLimitRow
                        group={group}
                        count={response.counts[group]}
                        limit={draftState.draft.limits[group]}
                        enforcementEnabled
                        disabled={!canManage || isSaving}
                        onChange={(limit) => updateLimitDraft(group, limit)}
                      />
                    </React.Fragment>
                  ))}

                  <EuiHorizontalRule margin="l" />
                  <EuiText size="xs" color="subdued">
                    <p data-test-subj="significantEventsRunLimitsResetTime">
                      {i18n.translate(
                        'xpack.significantEventsApp.settings.runLimits.counterResetDescription',
                        {
                          defaultMessage: 'The current {timezone} day resets at {resetsAt}.',
                          values: {
                            timezone: response.window.timezone,
                            resetsAt: response.window.resetsAt,
                          },
                        }
                      )}
                    </p>
                  </EuiText>
                </>
              )}

              {!canManage && (
                <>
                  <EuiSpacer />
                  <EuiCallOut
                    announceOnMount
                    color="primary"
                    iconType="lock"
                    title={i18n.translate(
                      'xpack.significantEventsApp.settings.runLimits.readOnlyTitle',
                      {
                        defaultMessage: 'Deployment-wide privilege required',
                      }
                    )}
                  >
                    <p>
                      {i18n.translate(
                        'xpack.significantEventsApp.settings.runLimits.readOnlyDescription',
                        {
                          defaultMessage:
                            'Changing enforcement or daily limits requires the Streams manage privilege in every space.',
                        }
                      )}
                    </p>
                  </EuiCallOut>
                </>
              )}

              {saveError && (
                <>
                  <EuiSpacer />
                  <EuiCallOut
                    announceOnMount
                    color="danger"
                    iconType="error"
                    title={i18n.translate(
                      'xpack.significantEventsApp.settings.runLimits.saveErrorTitle',
                      {
                        defaultMessage: 'Could not save daily run limits',
                      }
                    )}
                  >
                    <p>
                      {i18n.translate(
                        'xpack.significantEventsApp.settings.runLimits.saveErrorDescription',
                        {
                          defaultMessage:
                            'Your changes were kept. Review them and try again. Error: {error}',
                          values: { error: saveError.message },
                        }
                      )}
                    </p>
                    <EuiButton color="danger" size="s" onClick={handleSave}>
                      {i18n.translate(
                        'xpack.significantEventsApp.settings.runLimits.saveRetryButtonLabel',
                        {
                          defaultMessage: 'Try again',
                        }
                      )}
                    </EuiButton>
                  </EuiCallOut>
                </>
              )}

              {isDirty && (
                <>
                  <EuiSpacer />
                  <EuiFlexGroup justifyContent="flexEnd" gutterSize="s">
                    <EuiFlexItem grow={false}>
                      <EuiButtonEmpty
                        onClick={() => {
                          setDraftState(createRunQuotaDraftState(response));
                          setSaveError(undefined);
                        }}
                        isDisabled={isSaving}
                      >
                        {i18n.translate(
                          'xpack.significantEventsApp.settings.runLimits.cancelButtonLabel',
                          {
                            defaultMessage: 'Cancel',
                          }
                        )}
                      </EuiButtonEmpty>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiButton
                        fill
                        onClick={handleSave}
                        isLoading={isSaving}
                        isDisabled={!canManage || !update}
                        data-test-subj="significantEventsSaveRunLimitsButton"
                      >
                        {i18n.translate(
                          'xpack.significantEventsApp.settings.runLimits.saveButtonLabel',
                          {
                            defaultMessage: 'Save run limits',
                          }
                        )}
                      </EuiButton>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </>
              )}
            </>
          )}
        </EuiSplitPanel.Inner>
      </EuiSplitPanel.Outer>

      {showConfirmation && draftState && response && (
        <EuiConfirmModal
          aria-labelledby={confirmationModalTitleId}
          data-test-subj="significantEventsRunLimitsConfirmationModal"
          titleProps={{ id: confirmationModalTitleId }}
          title={confirmationTitle}
          onCancel={() => setShowConfirmation(false)}
          onConfirm={() => void performSave()}
          cancelButtonText={i18n.translate(
            'xpack.significantEventsApp.settings.runLimits.confirmCancelButtonLabel',
            {
              defaultMessage: 'Keep editing',
            }
          )}
          confirmButtonText={confirmationButtonText}
          buttonColor={warnings.disabling ? 'danger' : 'warning'}
        >
          {warnings.disabling && (
            <p>
              {i18n.translate(
                'xpack.significantEventsApp.settings.runLimits.disableConfirmDescription',
                {
                  defaultMessage:
                    'Finite limits will stop denying new scheduled admissions. Successfully recorded scheduled admissions will continue to be counted.',
                }
              )}
            </p>
          )}
          {warnings.enablingExhaustedGroups.length > 0 && (
            <p>
              {i18n.translate(
                'xpack.significantEventsApp.settings.runLimits.enableReachedConfirmDescription',
                {
                  defaultMessage:
                    'Enabling enforcement will immediately allow these reached limits to deny new scheduled admissions: {groups}.',
                  values: {
                    groups: i18n.formatList(
                      'conjunction',
                      warnings.enablingExhaustedGroups.map((group) => RUN_QUOTA_GROUP_LABELS[group])
                    ),
                  },
                }
              )}
            </p>
          )}
          {warnings.loweringGroups.map((group) => {
            const limit = draftState.draft.limits[group];
            return isFiniteRunLimit(limit) ? (
              <p key={group}>
                {draftState.draft.enabled
                  ? i18n.translate(
                      'xpack.significantEventsApp.settings.runLimits.loweringEnabledGroupWarningDescription',
                      {
                        defaultMessage:
                          '{group} has {count} counted scheduled admissions today. Saving the lower limit of {limit} can deny new scheduled admissions until {resetsAt}.',
                        values: {
                          group: RUN_QUOTA_GROUP_LABELS[group],
                          count: response.counts[group],
                          limit,
                          resetsAt: response.window.resetsAt,
                        },
                      }
                    )
                  : i18n.translate(
                      'xpack.significantEventsApp.settings.runLimits.loweringDisabledGroupWarningDescription',
                      {
                        defaultMessage:
                          '{group} has {count} counted scheduled admissions today. If enforcement is enabled before {resetsAt}, the lower limit of {limit} can immediately deny new scheduled admissions.',
                        values: {
                          group: RUN_QUOTA_GROUP_LABELS[group],
                          count: response.counts[group],
                          limit,
                          resetsAt: response.window.resetsAt,
                        },
                      }
                    )}
              </p>
            ) : null;
          })}
        </EuiConfirmModal>
      )}
    </>
  );
};
