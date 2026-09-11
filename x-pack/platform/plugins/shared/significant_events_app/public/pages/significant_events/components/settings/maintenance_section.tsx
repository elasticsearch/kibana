/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiButton,
  EuiCallOut,
  EuiConfirmModal,
  EuiSpacer,
  EuiSplitPanel,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { SignificantEventsMaintenanceStatus } from '@kbn/significant-events-plugin/common';
import {
  useMaintenanceStatus,
  useSignificantEventsMaintenanceActions,
} from '../../../../hooks/use_significant_events_maintenance';

const SECTION_TITLE = i18n.translate('xpack.significantEventsApp.settings.maintenance.title', {
  defaultMessage: 'Significant Events activity',
});

const SECTION_DESCRIPTION = i18n.translate(
  'xpack.significantEventsApp.settings.maintenance.description',
  {
    defaultMessage:
      'Pause all Significant Events activity across the entire deployment (every Kibana space), not only this space: scheduled discovery, continuous onboarding, detections, memory, investigations, and the alerting rules backing knowledge indicator queries. Existing data is kept. Resume restores managed workflows and rules that Pause disabled, and turns scheduled discovery / continuous onboarding back on only if they were enabled before pause.',
  }
);

function PausedCallout({ status }: { status: SignificantEventsMaintenanceStatus }) {
  const { updatedBy, lastSummary } = status;
  const workflowsDisabled = lastSummary?.workflowsDisabled ?? 0;
  const rulesDisabled = lastSummary?.rulesDisabled ?? 0;
  const failureCount = lastSummary?.partialFailures.length ?? 0;
  const hasCounts = workflowsDisabled > 0 || rulesDisabled > 0;
  return (
    <EuiCallOut
      announceOnMount
      size="s"
      color="warning"
      iconType="pause"
      data-test-subj="streams-settings-maintenance-paused-status"
      title={i18n.translate('xpack.significantEventsApp.settings.maintenance.pausedTitle', {
        defaultMessage: 'Significant Events activity is paused',
      })}
    >
      {updatedBy && (
        <p>
          <FormattedMessage
            id="xpack.significantEventsApp.settings.maintenance.pausedBy"
            defaultMessage="Paused by {pausedBy}."
            values={{ pausedBy: <strong>{updatedBy}</strong> }}
          />
        </p>
      )}
      {hasCounts && (
        <p>
          <FormattedMessage
            id="xpack.significantEventsApp.settings.maintenance.pausedSummary"
            defaultMessage="Disabled {workflowsDisabled} workflow(s) and {rulesDisabled} rule(s)."
            values={{ workflowsDisabled, rulesDisabled }}
          />
        </p>
      )}
      {failureCount > 0 && (
        <p data-test-subj="streams-settings-maintenance-partial-failures">
          <FormattedMessage
            id="xpack.significantEventsApp.settings.maintenance.partialFailures"
            defaultMessage="{failureCount, plural, one {# maintenance operation} other {# maintenance operations}} could not be completed. Check the Kibana server logs for details. Pause again while paused re-sweeps disable/cancel."
            values={{ failureCount }}
          />
        </p>
      )}
    </EuiCallOut>
  );
}

export function MaintenanceSection({ canManage }: { canManage: boolean }) {
  const { data: status, isLoading, isError, refetch } = useMaintenanceStatus();
  const { pause, resume, isPausing, isResuming } = useSignificantEventsMaintenanceActions();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const paused = status?.state === 'paused';
  const isMutating = isPausing || isResuming;
  const statusReady = !isLoading && !isError && status !== undefined;

  const onConfirm = () => {
    setIsModalOpen(false);
    if (paused) {
      resume();
    } else {
      pause();
    }
  };

  return (
    <EuiSplitPanel.Outer hasBorder hasShadow={false} css={{ flexShrink: 0 }}>
      <EuiSplitPanel.Inner color="subdued">
        <EuiTitle size="xs">
          <h3>{SECTION_TITLE}</h3>
        </EuiTitle>
      </EuiSplitPanel.Inner>
      <EuiSplitPanel.Inner>
        <EuiText size="s">
          <p>{SECTION_DESCRIPTION}</p>
        </EuiText>
        <EuiSpacer />
        {isError && (
          <>
            <EuiCallOut
              announceOnMount
              size="s"
              color="danger"
              iconType="error"
              data-test-subj="streams-settings-maintenance-status-error"
              title={i18n.translate(
                'xpack.significantEventsApp.settings.maintenance.statusErrorTitle',
                { defaultMessage: 'Could not load maintenance status' }
              )}
            >
              <p>
                {i18n.translate('xpack.significantEventsApp.settings.maintenance.statusErrorBody', {
                  defaultMessage:
                    'Pause and Resume are unavailable until status can be loaded. Activity controls stay disabled while status is unknown.',
                })}
              </p>
              <EuiButton
                size="s"
                onClick={() => refetch()}
                data-test-subj="streams-settings-maintenance-status-retry"
              >
                {i18n.translate('xpack.significantEventsApp.settings.maintenance.statusRetry', {
                  defaultMessage: 'Retry',
                })}
              </EuiButton>
            </EuiCallOut>
            <EuiSpacer />
          </>
        )}
        {paused && status && (
          <>
            <PausedCallout status={status} />
            <EuiSpacer />
          </>
        )}
        {status?.featureSettingsUnavailable && (
          <>
            <EuiCallOut
              announceOnMount
              size="s"
              color="warning"
              iconType="warning"
              data-test-subj="streams-settings-maintenance-feature-settings-unavailable"
              title={i18n.translate(
                'xpack.significantEventsApp.settings.maintenance.featureSettingsUnavailableTitle',
                { defaultMessage: 'Some activity settings could not be loaded' }
              )}
            >
              <p>
                {i18n.translate(
                  'xpack.significantEventsApp.settings.maintenance.featureSettingsUnavailableBody',
                  {
                    defaultMessage:
                      'Scheduled discovery and continuous onboarding status may be incomplete. Pause and Resume still work; refresh or retry if those toggles look wrong.',
                  }
                )}
              </p>
            </EuiCallOut>
            <EuiSpacer />
          </>
        )}
        {!canManage && statusReady && (
          <>
            <EuiCallOut
              announceOnMount
              size="s"
              color="primary"
              iconType="lock"
              data-test-subj="streams-settings-maintenance-no-manage"
              title={i18n.translate(
                'xpack.significantEventsApp.settings.maintenance.noManageTitle',
                { defaultMessage: 'Administrator access required' }
              )}
            >
              <p>
                {i18n.translate('xpack.significantEventsApp.settings.maintenance.noManageBody', {
                  defaultMessage:
                    'You can view pause status, but pausing or resuming Significant Events activity requires the Streams manage privilege.',
                })}
              </p>
            </EuiCallOut>
            <EuiSpacer />
          </>
        )}
        <EuiButton
          data-test-subj="streams-settings-maintenance-toggle-button"
          color={paused ? 'primary' : 'warning'}
          iconType={paused ? 'play' : 'pause'}
          isLoading={isMutating || isLoading}
          isDisabled={!canManage || !statusReady || isMutating}
          onClick={() => setIsModalOpen(true)}
        >
          {isLoading
            ? i18n.translate('xpack.significantEventsApp.settings.maintenance.loadingButton', {
                defaultMessage: 'Checking status…',
              })
            : paused
            ? i18n.translate('xpack.significantEventsApp.settings.maintenance.resumeButton', {
                defaultMessage: 'Resume Significant Events activity',
              })
            : i18n.translate('xpack.significantEventsApp.settings.maintenance.pauseButton', {
                defaultMessage: 'Pause Significant Events activity',
              })}
        </EuiButton>
      </EuiSplitPanel.Inner>

      {isModalOpen && statusReady && (
        <EuiConfirmModal
          data-test-subj="streams-settings-maintenance-confirm-modal"
          aria-label={i18n.translate(
            'xpack.significantEventsApp.settings.maintenance.confirmAriaLabel',
            { defaultMessage: 'Confirm Significant Events activity change' }
          )}
          title={
            paused
              ? i18n.translate(
                  'xpack.significantEventsApp.settings.maintenance.resumeConfirmTitle',
                  { defaultMessage: 'Resume Significant Events activity?' }
                )
              : i18n.translate(
                  'xpack.significantEventsApp.settings.maintenance.pauseConfirmTitle',
                  { defaultMessage: 'Pause Significant Events activity?' }
                )
          }
          onCancel={() => setIsModalOpen(false)}
          onConfirm={onConfirm}
          cancelButtonText={i18n.translate(
            'xpack.significantEventsApp.settings.maintenance.confirmCancel',
            { defaultMessage: 'Cancel' }
          )}
          confirmButtonText={
            paused
              ? i18n.translate(
                  'xpack.significantEventsApp.settings.maintenance.resumeConfirmButton',
                  { defaultMessage: 'Resume' }
                )
              : i18n.translate(
                  'xpack.significantEventsApp.settings.maintenance.pauseConfirmButton',
                  { defaultMessage: 'Pause' }
                )
          }
          buttonColor={paused ? 'primary' : 'warning'}
          defaultFocusedButton="confirm"
        >
          <p>
            {paused
              ? i18n.translate(
                  'xpack.significantEventsApp.settings.maintenance.resumeConfirmBody',
                  {
                    defaultMessage:
                      'This re-enables the managed workflows and alerting rules that Pause disabled, and restores scheduled discovery / continuous onboarding only if they were enabled before pause. It does not restart executions that were cancelled.',
                  }
                )
              : i18n.translate('xpack.significantEventsApp.settings.maintenance.pauseConfirmBody', {
                  defaultMessage:
                    'This disables all Significant Events managed workflows, cancels their in-flight executions, and disables the alerting rules backing knowledge indicator queries. No data is deleted.',
                })}
          </p>
        </EuiConfirmModal>
      )}
    </EuiSplitPanel.Outer>
  );
}
