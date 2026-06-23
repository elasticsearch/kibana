/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLoadingElastic,
  EuiLoadingSpinner,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import React, { useCallback, useMemo, useState } from 'react';

import { useKibanaIsDarkMode } from '@kbn/react-kibana-context-theme';
import { Countdown } from './countdown';
import { LoadingMessages } from './loading_messages';
import * as i18n from './translations';
import { getIsTerminalState } from './get_is_terminal_state';
import { useDismissAttackDiscoveryGeneration } from '../use_dismiss_attack_discovery_generations';

const BACKGROUND_COLOR_LIGHT = '#E6F1FA';
const BACKGROUND_COLOR_DARK = '#0B2030';

const BORDER_COLOR_DARK = '#0B2030';

interface Props {
  alertsContextCount: number | null;
  approximateFutureTime: Date | null;
  averageSuccessfulDurationNanoseconds?: number;
  connectorName?: string;
  end?: string | null;
  executionUuid?: string;
  discoveries?: number;
  generationEndTime?: string;
  localStorageAttackDiscoveryMaxAlerts: string | undefined;
  loadingMessage?: string;
  reason?: string;
  refetchGenerations?: () => void;
  start?: string | null;
  status?: 'started' | 'succeeded' | 'failed' | 'canceled' | 'dismissed';
  successfulGenerations?: number;
}

const LoadingCalloutComponent: React.FC<Props> = ({
  alertsContextCount,
  approximateFutureTime,
  averageSuccessfulDurationNanoseconds,
  connectorName,
  discoveries,
  end,
  executionUuid,
  generationEndTime,
  localStorageAttackDiscoveryMaxAlerts,
  loadingMessage,
  reason,
  refetchGenerations,
  start,
  status,
  successfulGenerations,
}) => {
  const { euiTheme } = useEuiTheme();
  const isDarkMode = useKibanaIsDarkMode();

  const isTerminalState = useMemo(() => getIsTerminalState(status), [status]);

  const leftContent = useMemo(
    () => (
      <EuiFlexGroup alignItems="center" data-test-subj="leftContent" gutterSize="none">
        <EuiFlexItem grow={false}>
          {isTerminalState ? (
            <EuiIcon type="logoElastic" size="l" aria-hidden={true} />
          ) : (
            <EuiLoadingElastic data-test-subj="loadingElastic" size="l" />
          )}
        </EuiFlexItem>

        <EuiFlexItem
          css={css`
            margin-left: ${euiTheme.size.m};
          `}
          grow={false}
        >
          <LoadingMessages
            alertsContextCount={alertsContextCount}
            connectorName={connectorName}
            discoveries={discoveries}
            end={end}
            generationEndTime={generationEndTime}
            loadingMessage={loadingMessage}
            localStorageAttackDiscoveryMaxAlerts={localStorageAttackDiscoveryMaxAlerts}
            reason={reason}
            start={start}
            status={status}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    ),
    [
      alertsContextCount,
      connectorName,
      discoveries,
      end,
      euiTheme.size.m,
      generationEndTime,
      isTerminalState,
      loadingMessage,
      localStorageAttackDiscoveryMaxAlerts,
      reason,
      start,
      status,
    ]
  );

  const backgroundColor = useMemo(() => {
    const defaultBackgroundColor = isDarkMode ? BACKGROUND_COLOR_DARK : BACKGROUND_COLOR_LIGHT;
    const successBackgroundColor = euiTheme.colors.backgroundBaseSuccess;
    const failedBackgroundColor = euiTheme.colors.backgroundBaseDanger;

    if (status === 'succeeded') {
      return successBackgroundColor;
    }

    if (status === 'failed') {
      return failedBackgroundColor;
    }

    return defaultBackgroundColor;
  }, [
    euiTheme.colors.backgroundBaseDanger,
    euiTheme.colors.backgroundBaseSuccess,
    isDarkMode,
    status,
  ]);

  const borderColor = useMemo(() => {
    const defaultBorderColor = isDarkMode ? BORDER_COLOR_DARK : euiTheme.colors.lightShade;
    const successBorderColor = euiTheme.colors.borderBaseSuccess;
    const failedBorderColor = euiTheme.colors.borderBaseDanger;

    if (status === 'succeeded') {
      return successBorderColor;
    }

    if (status === 'failed') {
      return failedBorderColor;
    }

    return defaultBorderColor;
  }, [
    euiTheme.colors.borderBaseDanger,
    euiTheme.colors.borderBaseSuccess,
    euiTheme.colors.lightShade,
    isDarkMode,
    status,
  ]);

  const { mutateAsync: dismissAttackDiscoveryGeneration } = useDismissAttackDiscoveryGeneration();

  const [isDismissing, setIsDismissing] = useState(false);

  const dismissGeneration = useCallback(async () => {
    try {
      if (executionUuid != null) {
        setIsDismissing(true);
        await dismissAttackDiscoveryGeneration({ executionUuid });
        refetchGenerations?.(); // force a refresh of the generations list
      }
    } finally {
      setIsDismissing(false);
    }
  }, [dismissAttackDiscoveryGeneration, executionUuid, refetchGenerations]);

  return (
    <div
      css={css`
        background-color: ${backgroundColor};
        border: 1px solid ${borderColor};
        border-radius: 6px;
        padding: ${euiTheme.size.base};
      `}
      data-test-subj="loadingCallout"
    >
      <EuiFlexGroup alignItems="center" gutterSize="none" justifyContent="spaceBetween">
        <EuiFlexItem grow={false}>{leftContent}</EuiFlexItem>

        <EuiFlexItem grow={false}>
          <EuiFlexGroup alignItems="center" gutterSize="none">
            {!isTerminalState && (
              <EuiFlexItem grow={false}>
                <Countdown
                  approximateFutureTime={approximateFutureTime}
                  averageSuccessfulDurationNanoseconds={averageSuccessfulDurationNanoseconds}
                  successfulGenerations={successfulGenerations}
                />
              </EuiFlexItem>
            )}

            <EuiFlexItem
              css={css`
                margin-left: ${euiTheme.size.m};
              `}
              grow={false}
            >
              {isDismissing ? (
                <EuiLoadingSpinner
                  data-test-subj="loadingSpinner"
                  size="m"
                  css={css`
                    color: ${euiTheme.colors.text};
                  `}
                />
              ) : (
                <EuiToolTip content={i18n.CLOSE} disableScreenReaderOutput>
                  <EuiButtonIcon
                    aria-label={i18n.CLOSE}
                    disabled={isDismissing}
                    iconType="cross"
                    onClick={dismissGeneration}
                    data-test-subj="dismissButton"
                  />
                </EuiToolTip>
              )}
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
};

LoadingCalloutComponent.displayName = 'LoadingCallout';

export const LoadingCallout = React.memo(LoadingCalloutComponent);
