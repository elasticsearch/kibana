/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import useObservable from 'react-use/lib/useObservable';
import {
  EuiAccordion,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { GEN_AI_SETTINGS_TOKEN_USAGE_TRACKING } from '@kbn/management-settings-ids';
import { useKibana } from '../../../../hooks/use_kibana';
import { useSignificantEventsCost } from '../../../../hooks/use_significant_events_cost';
import { useRunQuotas } from '../../../../hooks/use_significant_events_run_quotas';
import { getFormattedError } from '../../../../util/errors';
import { CostData } from './cost_estimate_breakdown';
import {
  CostHeaderActions,
  EnableTrackingButton,
  RetryCallout,
  TrackingCoverageCallout,
} from './cost_estimate_details';

const INSTALL_TOKEN_USAGE_DASHBOARD_URL = '/internal/gen_ai_settings/install_token_usage_dashboard';

export const CostEstimate = () => {
  const { euiTheme } = useEuiTheme();
  const quotas = useRunQuotas();
  const [isEnablingTracking, setIsEnablingTracking] = useState(false);
  const { core } = useKibana();
  const settingsClient = core.settings.client;
  const tracking$ = useMemo(
    () => settingsClient.get$<boolean>(GEN_AI_SETTINGS_TOKEN_USAGE_TRACKING, false),
    [settingsClient]
  );
  const trackingEnabled = useObservable(
    tracking$,
    settingsClient.get<boolean>(GEN_AI_SETTINGS_TOKEN_USAGE_TRACKING, false)
  );
  const canManage = quotas.data?.canManage === true;
  const canSaveAdvancedSettings = core.application.capabilities.advancedSettings?.save === true;
  const cost = useSignificantEventsCost({
    enabled: canManage && !quotas.isError,
  });

  const enableTokenTracking = async (): Promise<void> => {
    setIsEnablingTracking(true);
    let updateError: Error | undefined;
    const updateErrorSubscription = settingsClient.getUpdateErrors$().subscribe((error) => {
      updateError = error;
    });

    try {
      const wasSaved = await settingsClient.set(GEN_AI_SETTINGS_TOKEN_USAGE_TRACKING, true);
      if (!wasSaved) {
        throw (
          updateError ??
          new Error(
            i18n.translate(
              'xpack.significantEventsApp.settings.costEstimate.enableTrackingFailedErrorMessage',
              { defaultMessage: 'The token tracking setting could not be saved.' }
            )
          )
        );
      }

      try {
        await core.http.post(INSTALL_TOKEN_USAGE_DASHBOARD_URL);
      } catch (error) {
        core.notifications.toasts.addWarning({
          title: i18n.translate(
            'xpack.significantEventsApp.settings.costEstimate.installDashboardFailedTitle',
            {
              defaultMessage:
                'Token tracking was enabled, but the token usage dashboard could not be installed',
            }
          ),
          text: getFormattedError(error).message,
        });
      }
      await cost.refreshCost();
    } catch (error) {
      core.notifications.toasts.addDanger({
        title: i18n.translate(
          'xpack.significantEventsApp.settings.costEstimate.enableTrackingFailedTitle',
          { defaultMessage: 'Unable to enable token tracking' }
        ),
        text: getFormattedError(error).message,
      });
    } finally {
      updateErrorSubscription.unsubscribe();
      setIsEnablingTracking(false);
    }
  };

  if (quotas.isError || quotas.data == null || !canManage) {
    return null;
  }

  const enableAction =
    !trackingEnabled || isEnablingTracking ? (
      <EnableTrackingButton
        canSaveAdvancedSettings={canSaveAdvancedSettings}
        isEnablingTracking={isEnablingTracking}
        onEnable={() => void enableTokenTracking()}
      />
    ) : null;

  const renderWithEnableAction = (content?: React.ReactNode) => (
    <>
      {enableAction}
      {enableAction && content ? <EuiSpacer size="m" /> : null}
      {content}
    </>
  );

  const renderBody = () => {
    if (cost.isLoading && !cost.data) {
      return renderWithEnableAction(
        <EuiLoadingSpinner size="m" data-test-subj="significantEventsCostLoading" />
      );
    }

    if (cost.error && !cost.data) {
      return renderWithEnableAction(
        <RetryCallout
          title={i18n.translate(
            'xpack.significantEventsApp.settings.costEstimate.unavailableErrorTitle',
            { defaultMessage: 'Cost estimate unavailable' }
          )}
          body={getFormattedError(cost.error).message}
          onRetry={() => void cost.retryCost()}
        />
      );
    }

    if (cost.data?.unavailableReason === 'pricing') {
      return renderWithEnableAction(
        <RetryCallout
          title={i18n.translate(
            'xpack.significantEventsApp.settings.costEstimate.pricingUnavailableTitle',
            { defaultMessage: 'Unable to fetch pricing data' }
          )}
          onRetry={() => void cost.retryCost()}
        />
      );
    }

    if (cost.data?.unavailableReason === 'usage_data') {
      return renderWithEnableAction(
        <RetryCallout
          title={i18n.translate(
            'xpack.significantEventsApp.settings.costEstimate.usageDataUnavailableTitle',
            { defaultMessage: 'Unable to read token usage data' }
          )}
          onRetry={() => void cost.retryCost()}
        />
      );
    }

    if (!cost.data) {
      return enableAction;
    }

    const refreshError = cost.error ? (
      <RetryCallout
        title={i18n.translate(
          'xpack.significantEventsApp.settings.costEstimate.refreshFailedTitle',
          { defaultMessage: 'Unable to refresh cost estimate' }
        )}
        body={getFormattedError(cost.error).message}
        onRetry={() => void cost.refreshCost()}
      />
    ) : null;

    if (cost.data.trackingCoverage.status === 'none') {
      return renderWithEnableAction(refreshError);
    }

    return (
      <>
        <TrackingCoverageCallout coverage={cost.data.trackingCoverage} />
        {cost.data.trackingCoverage.status === 'partial' ||
        cost.data.trackingCoverage.status === 'unavailable' ? (
          <EuiSpacer size="m" />
        ) : null}
        {refreshError}
        {refreshError ? <EuiSpacer size="m" /> : null}
        {renderWithEnableAction(
          <CostData
            data={cost.data}
            isRefreshing={cost.isRefreshing}
            onRefresh={() => void cost.refreshCost()}
          />
        )}
      </>
    );
  };

  return (
    <>
      <EuiSpacer />
      <EuiPanel
        hasBorder
        hasShadow={false}
        paddingSize="none"
        grow={false}
        data-test-subj="significantEventsCostSection"
      >
        <EuiPanel
          hasShadow={false}
          color="subdued"
          paddingSize="none"
          css={{ paddingInline: euiTheme.size.m }}
        >
          <EuiAccordion
            id="significantEventsCostAccordion"
            initialIsOpen={false}
            buttonProps={{
              paddingSize: 'm',
              css: { flexGrow: 0, inlineSize: 'auto' },
              'data-test-subj': 'significantEventsCostAccordionButton',
            }}
            buttonContent={
              <EuiTitle size="xs">
                <h3>
                  {i18n.translate('xpack.significantEventsApp.settings.costEstimate.sectionTitle', {
                    defaultMessage: 'Approximate inference cost across all spaces',
                  })}
                </h3>
              </EuiTitle>
            }
            extraAction={<CostHeaderActions data={cost.data} />}
            data-test-subj="significantEventsCostAccordion"
          >
            <EuiPanel hasShadow={false}>{renderBody()}</EuiPanel>
          </EuiAccordion>
        </EuiPanel>
      </EuiPanel>
    </>
  );
};
