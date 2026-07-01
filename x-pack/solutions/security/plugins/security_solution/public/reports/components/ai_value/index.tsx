/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo } from 'react';
import dateMath from '@kbn/datemath';
import {
  SECURITY_SOLUTION_DEFAULT_VALUE_REPORT_MINUTES,
  SECURITY_SOLUTION_DEFAULT_VALUE_REPORT_RATE,
} from '@kbn/management-settings-ids';
import {
  EuiFlexGroup,
  EuiIcon,
  EuiImage,
  EuiEmptyPrompt,
  EuiFlexItem,
  EuiSpacer,
  EuiPanel,
  EuiBadge,
  EuiTextColor,
  EuiTitle,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { AnnouncementBanner } from '@kbn/announcement-banner';
import { SecurityPageName } from '@kbn/security-solution-navigation';
import { useSecuritySolutionLinkProps } from '../../../common/components/links';
import analyticsSpeedAcceleration from './analytics_speed_acceleration.svg';
import { AIValueReportLayout } from './ai_value_report_layout';
import { useValueReportData } from '../../hooks/use_value_report_data';
import { useKibana } from '../../../common/lib/kibana';
import { useAIValueExportContext } from '../../providers/ai_value/export_provider';
import { PageLoader } from '../../../common/components/page_loader';
import * as i18n from './translations';
import type { AIValueReportProps } from '../../../types';

type AIValueReportContentProps = Omit<AIValueReportProps, 'isSourcererLoading'>;

const AIValueReportContent: React.FC<AIValueReportContentProps> = ({
  setHasReportData,
  setIsDatePickerDisabled,
  setIsSampleMode,
  from: propFrom,
  to: propTo,
  sampleBanner,
  forceSampleData,
}) => {
  const { settings } = useKibana().services;
  const exportContext = useAIValueExportContext();
  const setReportInputForExportContext = exportContext?.setReportInput;
  const { href: attackDiscoveryHref } = useSecuritySolutionLinkProps({
    deepLinkId: SecurityPageName.attackDiscovery,
  });

  // When exporting/scheduling, forwardedState can include relative date-math strings
  // (e.g. now-7d, now). Resolve them to a deterministic absolute range for this run.
  const forceNow = useMemo(() => new Date(), []);
  const { from, to } = useMemo(() => {
    if (exportContext?.forwardedState) {
      const { timeRange } = exportContext.forwardedState;
      const fromValue = timeRange.kind === 'absolute' ? timeRange.from : timeRange.fromStr;
      const toValue = timeRange.kind === 'absolute' ? timeRange.to : timeRange.toStr;
      return {
        from: dateMath.parse(fromValue, { forceNow })?.toISOString() ?? fromValue,
        to: dateMath.parse(toValue, { forceNow, roundUp: true })?.toISOString() ?? toValue,
      };
    }
    return {
      from: propFrom,
      to: propTo,
    };
  }, [propFrom, propTo, exportContext?.forwardedState, forceNow]);

  const { analystHourlyRate, minutesPerAlert } = useMemo(
    () => ({
      minutesPerAlert: settings.client.get<number>(SECURITY_SOLUTION_DEFAULT_VALUE_REPORT_MINUTES),
      analystHourlyRate: settings.client.get<number>(SECURITY_SOLUTION_DEFAULT_VALUE_REPORT_RATE),
    }),
    [settings.client]
  );

  const data = useValueReportData({
    from,
    to,
    minutesPerAlert,
    analystHourlyRate,
    forceSampleData,
  });

  useEffect(() => {
    if (data.isLoading || data.isSample || !setReportInputForExportContext) {
      return;
    }
    setReportInputForExportContext({
      attackAlertIds: data.attackAlertIds,
      valueMetrics: data.valueMetrics,
      valueMetricsCompare: data.valueMetricsCompare,
      analystHourlyRate: data.analystHourlyRate,
      minutesPerAlert: data.minutesPerAlert,
    });
  }, [data, setReportInputForExportContext]);

  useEffect(() => {
    setHasReportData?.(!data.isSample && data.valueMetrics.attackDiscoveryCount > 0);
  }, [data.isSample, data.valueMetrics, setHasReportData]);

  useEffect(() => {
    setIsDatePickerDisabled?.(data.isLoading || data.isSample);
  }, [data.isLoading, data.isSample, setIsDatePickerDisabled]);

  useEffect(() => {
    setIsSampleMode?.(data.isSample);
  }, [data.isSample, setIsSampleMode]);

  if (data.isLoading) {
    return <PageLoader />;
  }

  if (data.isSample) {
    // render sample report with default values if there are no attack discoveries
    // to show the full report layout and provide an example of how the metrics are calculated
    return (
      <>
        {sampleBanner ?? (
          <AnnouncementBanner
            data-test-subj="aiValueSampleAttackDiscoveryBanner"
            title={i18n.RUN_ATTACK_DISCOVERY_TEXT}
            headingElement="h3"
            text={i18n.GET_STARTED_ATTACK_DISCOVERY_TEXT}
            media={<EuiIcon type={analyticsSpeedAcceleration} size="original" aria-hidden={true} />}
            actionProps={{
              primary: {
                children: i18n.ATTACK_DISCOVERY_LINK,
                href: attackDiscoveryHref,
                iconType: 'popout',
                iconSide: 'left',
                target: '_blank',
                rel: 'noopener noreferrer',
                'data-test-subj': 'sampleAttackDiscoveryCtaButton',
              },
            }}
          />
        )}
        <EuiSpacer size="l" />
        <EuiPanel hasBorder={true} borderRadius="m" color="transparent" paddingSize="l">
          <EuiFlexGroup responsive={false} alignItems="center" justifyContent="spaceBetween">
            <EuiFlexItem>
              <EuiTitle
                size="s"
                css={css`
                  text-align: left;
                `}
              >
                <h3>
                  <EuiTextColor color="subdued">
                    {i18n.WHAT_REPORT_WILL_LOOK_LIKE_TEXT}
                  </EuiTextColor>
                </h3>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge
                color="warning"
                data-test-subj="aiValueSampleDataBadge"
                css={css`
                  text-transform: uppercase;
                `}
              >
                {i18n.SAMPLE_DATA_BADGE}
              </EuiBadge>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="l" />
          <AIValueReportLayout
            isSample={data.isSample}
            attackAlertIds={data.attackAlertIds}
            analystHourlyRate={data.analystHourlyRate}
            minutesPerAlert={data.minutesPerAlert}
            from={data.from}
            to={data.to}
            valueMetrics={data.valueMetrics}
            valueMetricsCompare={data.valueMetricsCompare}
          />
        </EuiPanel>
      </>
    );
  }

  if (data.hasEverUsedAttackDiscovery && data.valueMetrics.attackDiscoveryCount === 0) {
    return (
      <EuiFlexGroup>
        <EuiFlexItem
          css={css`
            min-height: 50vh;
          `}
        >
          <EuiEmptyPrompt
            data-test-subj="aiValueNoResultsEmptyState"
            icon={<EuiImage size="s" src={analyticsSpeedAcceleration} alt="" />}
            title={<h2>{i18n.NO_RESULTS_TITLE}</h2>}
            titleSize="s"
            body={<p>{i18n.NO_RESULTS_BODY}</p>}
            hasBorder={false}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  return (
    <AIValueReportLayout
      isSample={data.isSample}
      attackAlertIds={data.attackAlertIds}
      analystHourlyRate={data.analystHourlyRate}
      minutesPerAlert={data.minutesPerAlert}
      from={data.from}
      to={data.to}
      valueMetrics={data.valueMetrics}
      valueMetricsCompare={data.valueMetricsCompare}
    />
  );
};

export const AIValueReport: React.FC<AIValueReportProps> = ({
  setHasReportData,
  setIsDatePickerDisabled,
  setIsSampleMode,
  isSourcererLoading,
  from,
  to,
  sampleBanner,
  forceSampleData,
}) => {
  useEffect(() => {
    if (isSourcererLoading) {
      // safety check: clear stale parent flags as soon as loading starts.
      setHasReportData?.(false);
      setIsDatePickerDisabled?.(true);
      setIsSampleMode?.(false);
    }
  }, [isSourcererLoading, setHasReportData, setIsDatePickerDisabled, setIsSampleMode]);

  if (isSourcererLoading) {
    return <PageLoader />;
  }

  return (
    <AIValueReportContent
      setHasReportData={setHasReportData}
      setIsDatePickerDisabled={setIsDatePickerDisabled}
      setIsSampleMode={setIsSampleMode}
      from={from}
      to={to}
      sampleBanner={sampleBanner}
      forceSampleData={forceSampleData}
    />
  );
};
