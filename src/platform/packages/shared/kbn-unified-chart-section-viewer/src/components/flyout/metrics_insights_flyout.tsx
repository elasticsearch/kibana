/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiTitle,
  isDOMNode,
  keys,
  useEuiTheme,
  useGeneratedHtmlId,
  useIsWithinMinBreakpoint,
} from '@elastic/eui';
import React, { useCallback, useEffect } from 'react';
import { i18n } from '@kbn/i18n';
import { DiscoverFlyouts, dismissAllFlyoutsExceptFor, useFlyoutWidth } from '@kbn/discover-utils';
import type { ParsedMetricItem } from '../../types';
import { MetricFlyoutBody } from './metrics_flyout_body';
import { useFlyoutA11y } from './hooks/use_flyout_a11y';
import { useFieldsMetadataContext } from '../../context/fields_metadata';

interface MetricInsightsFlyoutProps {
  metricItem: ParsedMetricItem;
  esqlQuery?: string;
  onClose: () => void;
}

export const MetricInsightsFlyout = ({
  metricItem,
  esqlQuery,
  onClose,
}: MetricInsightsFlyoutProps) => {
  const { euiTheme } = useEuiTheme();
  const defaultWidth = euiTheme.base * 34;
  const isXlScreen = useIsWithinMinBreakpoint('xl');
  const { initialWidth, onKeyDownCapture, onPointerCancel, onPointerDown, onResize } =
    useFlyoutWidth({ localStorageKey: 'metricsExperience:flyoutWidth', defaultWidth });
  const { a11yProps, screenReaderDescription } = useFlyoutA11y({ isXlScreen });
  const { fieldsMetadata = {} } = useFieldsMetadataContext();

  useEffect(() => {
    dismissAllFlyoutsExceptFor(DiscoverFlyouts.metricInsights);
  }, []);

  // TODO: Remove once EUI ships the push-flyout padding fix (https://github.com/elastic/kibana/issues/276159).
  // When this push flyout mounts while another push flyout (e.g. the Inspector) is still
  // cleaning up, EUI captures and later restores a stale push offset onto Kibana's app scroll
  // container on unmount, which shrinks the layout permanently. Clearing that inline padding
  // when this flyout unmounts neutralizes the stale value.
  useEffect(() => {
    return () => {
      // Hardcoded to avoid a package dependency; mirrors APP_MAIN_SCROLL_CONTAINER_ID from
      // `@kbn/ui-chrome-layout-constants` and the default EuiFlyout container configured in
      // the Kibana EUI provider.
      document.getElementById('app-main-scroll')?.style.removeProperty('padding-inline-end');
    };
  }, []);

  const metricFlyoutTitleId = useGeneratedHtmlId({
    prefix: 'metricFlyoutTitle',
  });

  const metricFlyoutTitle = i18n.translate('metricsExperience.metricInsightsFlyout.title', {
    defaultMessage: 'Metric',
  });

  // Only handle ESC in push mode (xl screen). In overlay mode, EUI handles ESC automatically.
  const onKeyDown = useCallback(
    (ev: React.KeyboardEvent) => {
      if (
        isXlScreen &&
        isDOMNode(ev.target) &&
        ev.currentTarget.contains(ev.target) &&
        ev.key === keys.ESCAPE
      ) {
        ev.preventDefault();
        ev.stopPropagation();
        onClose();
      }
    },
    [onClose, isXlScreen]
  );

  const minWidth = euiTheme.base * 24;
  const maxWidth = euiTheme.breakpoint.xl;

  return (
    <EuiFlyout
      session="start"
      flyoutMenuProps={{
        title: metricFlyoutTitle,
      }}
      onClose={onClose}
      type="push"
      pushMinBreakpoint="xl"
      size={initialWidth}
      data-test-subj="metricsExperienceFlyout"
      aria-labelledby={metricFlyoutTitleId}
      onKeyDown={onKeyDown}
      onKeyDownCapture={onKeyDownCapture}
      onPointerDown={onPointerDown}
      onPointerCancel={onPointerCancel}
      ownFocus
      minWidth={minWidth}
      maxWidth={maxWidth}
      resizable={true}
      onResize={onResize}
      paddingSize="m"
      {...a11yProps}
    >
      {screenReaderDescription}
      <EuiFlyoutHeader>
        <EuiTitle size="xs" data-test-subj="metricsExperienceFlyoutRowDetailsTitle">
          <h2 id={metricFlyoutTitleId}>{metricFlyoutTitle}</h2>
        </EuiTitle>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <MetricFlyoutBody
          metricItem={metricItem}
          esqlQuery={esqlQuery}
          description={fieldsMetadata[metricItem.metricName]?.description}
        />
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};
