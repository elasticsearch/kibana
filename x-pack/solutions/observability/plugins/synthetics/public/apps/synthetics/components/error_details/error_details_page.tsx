/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiPanel, EuiSpacer } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { TestRunErrorInfo } from '../test_run_details/components/test_run_error_info';
import { StepDurationPanel } from '../monitor_details/monitor_summary/step_duration_panel';
import { LastTestRunComponent } from '../monitor_details/monitor_summary/last_test_run';
import { useStepDetails } from './hooks/use_step_details';
import { StepDetails } from '../test_run_details/components/step_details';
import { PanelWithTitle } from '../common/components/panel_with_title';
import { useErrorFailedTests } from './hooks/use_error_failed_tests';
import { useJourneySteps } from '../monitor_details/hooks/use_journey_steps';
import { FailedTestsList } from './components/failed_tests_list';
import { ErrorTimeline } from './components/error_timeline';
import { useErrorDetailsBreadcrumbs } from './hooks/use_error_details_breadcrumbs';
import { StepImage } from '../step_details_page/step_screenshot/step_image';
import { MonitorDetailsPanelContainer } from '../monitor_details/monitor_summary/monitor_details_panel_container';
import { useDateFormat } from '../../../../hooks/use_date_format';

export function ErrorDetailsPage() {
  const { failedTests, loading } = useErrorFailedTests();

  const checkGroupId = failedTests?.[0]?.monitor.check_group ?? '';

  const {
    data,
    isFailedStep,
    failedStep,
    loading: stepsLoading,
  } = useJourneySteps({ checkGroup: checkGroupId });

  const lastTestRun = failedTests?.[0];

  const formatter = useDateFormat();
  const startedAt = formatter(lastTestRun?.state?.started_at);

  useErrorDetailsBreadcrumbs([{ text: startedAt }]);

  const stepDetails = useStepDetails({ checkGroup: lastTestRun?.monitor.check_group });

  const isBrowser = data?.details?.journey.monitor.type === 'browser';

  return (
    <div>
      <PanelWithTitle title={TIMELINE_LABEL}>
        <ErrorTimeline lastTestRun={lastTestRun} />
      </PanelWithTitle>
      <EuiSpacer size="m" />
      <EuiFlexGroup gutterSize="m">
        <EuiFlexItem grow={2} style={{ minWidth: 0 }}>
          <PanelWithTitle title={FAILED_TESTS_LABEL}>
            <FailedTestsList failedTests={failedTests} loading={loading} />
          </PanelWithTitle>
          {isBrowser && (
            <>
              <EuiSpacer size="m" />
              <StepDetails {...stepDetails} />
            </>
          )}
          <EuiSpacer size="m" />
          <LastTestRunComponent
            latestPing={lastTestRun}
            loading={loading}
            stepsData={data}
            stepsLoading={stepsLoading}
            isErrorDetails={true}
          />
          {isBrowser && (
            <>
              <EuiSpacer size="m" />
              <EuiPanel hasShadow={false} hasBorder>
                <TestRunErrorInfo
                  journeyDetails={data?.details}
                  showErrorTitle={false}
                  showErrorLogs={true}
                />
              </EuiPanel>
            </>
          )}
        </EuiFlexItem>
        <EuiFlexItem grow={1} style={{ height: 'fit-content' }}>
          {data?.details?.journey && failedStep && (
            <>
              <PanelWithTitle>
                <StepImage
                  ping={data?.details?.journey}
                  step={failedStep}
                  isFailed={isFailedStep}
                />
              </PanelWithTitle>
              <EuiSpacer size="m" />
            </>
          )}

          <StepDurationPanel doBreakdown={false} />
          <EuiSpacer size="m" />
          <MonitorDetailsPanelContainer hideLocations />
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
}

const TIMELINE_LABEL = i18n.translate('xpack.synthetics.errors.timeline.title', {
  defaultMessage: 'Timeline',
});

const FAILED_TESTS_LABEL = i18n.translate('xpack.synthetics.errors.failedTests', {
  defaultMessage: 'Failed tests',
});
