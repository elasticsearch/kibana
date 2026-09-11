/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect } from 'react';
import * as React from 'react';
import {
  EuiAccordion,
  EuiText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiTitle,
  EuiScreenReaderLive,
  useEuiTheme,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { KbnDangerCallout } from '@kbn/ui-callout';
import styled from 'styled-components';
import { FAILED_TO_SCHEDULE } from '../manual_test_run_mode/browser_test_results';
import { BrowserStepsList } from '../../common/monitor_test_result/browser_steps_list';
import type { CheckGroupResult } from '../hooks/use_browser_run_once_monitors';
import { useBrowserRunOnceMonitors } from '../hooks/use_browser_run_once_monitors';
import { TestResultHeader } from '../test_result_header';
import { StdErrorLogs } from '../../common/components/stderr_logs';

interface Props {
  testRunId: string;
  expectPings: number;
  onDone: (testRunId: string) => void;
  // API journeys produce the same step pipeline as browser journeys, so they
  // also render here — but without screenshots. Default false keeps existing
  // browser callers unchanged.
  isApiMonitor?: boolean;
}
export const BrowserTestRunResult = ({
  expectPings,
  onDone,
  testRunId,
  isApiMonitor = false,
}: Props) => {
  const { euiTheme } = useEuiTheme();
  const {
    retriesExceeded,
    summariesLoading,
    expectedSummariesLoaded,
    stepLoadingInProgress,
    checkGroupResults,
  } = useBrowserRunOnceMonitors({
    testRunId,
    expectSummaryDocs: expectPings,
  });

  useEffect(() => {
    if (expectedSummariesLoaded) {
      onDone(testRunId);
    }
  }, [onDone, expectedSummariesLoaded, testRunId]);

  if (retriesExceeded) {
    return <KbnDangerCallout announceOnMount title={FAILED_TO_SCHEDULE} />;
  }

  return (
    <>
      {checkGroupResults.map((checkGroupResult) => {
        const { checkGroupId, journeyStarted, summaryDoc, stepsLoading, steps, completedSteps } =
          checkGroupResult;
        const isStepsLoading = !summariesLoading && journeyStarted && summaryDoc && stepsLoading;
        const isStepsLoadingFailed =
          summaryDoc && !summariesLoading && !stepLoadingInProgress && steps.length === 0;

        const isDownMonitor = summaryDoc?.monitor?.status === 'down';

        return (
          <AccordionWrapper
            key={'accordion-' + checkGroupId}
            id={'accordion-' + checkGroupId}
            element="fieldset"
            borders="horizontal"
            buttonProps={{ paddingSize: 'm' }}
            buttonContent={getButtonContent(checkGroupResult)}
            paddingSize="s"
            data-test-subj="expandResults"
            initialIsOpen={checkGroupResults.length === 1}
          >
            {isStepsLoading && (
              <EuiFlexGroup alignItems="center" gutterSize="xs">
                <EuiFlexItem grow={false}>
                  <EuiText>{LOADING_STEPS}</EuiText>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiLoadingSpinner size="s" />
                </EuiFlexItem>
              </EuiFlexGroup>
            )}

            {(isStepsLoadingFailed || isDownMonitor) && (
              <KbnDangerCallout
                announceOnMount
                data-test-subj="monitorTestRunErrorCallout"
                style={{
                  marginTop: euiTheme.base,
                  marginBottom: euiTheme.base,
                  borderRadius: euiTheme.border.radius.medium,
                  fontWeight: euiTheme.font.weight.semiBold,
                }}
                title={ERROR_RUNNING_TEST}
                size="s"
                text={summaryDoc?.error?.message ?? FAILED_TO_RUN}
              />
            )}

            {(isStepsLoadingFailed || isDownMonitor) &&
              summaryDoc?.error?.message?.includes('journey did not finish executing') && (
                <StdErrorLogs
                  checkGroup={summaryDoc.monitor.check_group}
                  hideTitle={completedSteps === 0}
                  pageSize={completedSteps === 0 ? 5 : 2}
                />
              )}

            {completedSteps > 0 && (
              <>
                <EuiTitle size="xxxs">
                  <h3>{STEPS_LABEL}</h3>
                </EuiTitle>
                <BrowserStepsList
                  steps={steps}
                  loading={Boolean(stepLoadingInProgress)}
                  error={undefined}
                  showStepNumber={true}
                  compressed={true}
                  testNowMode={true}
                  showLastSuccessful={false}
                  showScreenshots={!isApiMonitor}
                />
              </>
            )}
          </AccordionWrapper>
        );
      })}
    </>
  );
};

const AccordionWrapper = styled(EuiAccordion)`
  .euiAccordion__buttonContent {
    width: 100%;
  }
`;

function getButtonContent({
  journeyDoc,
  summaryDoc,
  checkGroupId,
  journeyStarted,
  completedSteps,
}: CheckGroupResult) {
  const completedText = i18n.translate('xpack.synthetics.monitorManagement.stepCompleted', {
    defaultMessage: '{stepCount, number} {stepCount, plural, one {step} other {steps}}  completed',
    values: {
      stepCount: completedSteps ?? 0,
    },
  });

  return (
    <div>
      <TestResultHeader
        title={journeyDoc?.observer?.geo?.name}
        summaryDocs={summaryDoc ? [summaryDoc] : []}
        checkGroupId={checkGroupId}
        journeyStarted={journeyStarted}
        isCompleted={Boolean(summaryDoc)}
        configId={journeyDoc?.config_id}
      />
      <EuiText size="s">
        <p>
          <EuiText color="subdued">{completedText}</EuiText>
        </p>
        <EuiScreenReaderLive>{completedText}</EuiScreenReaderLive>
      </EuiText>
    </div>
  );
}

export const FAILED_TO_RUN = i18n.translate('xpack.synthetics.monitorManagement.failedRun', {
  defaultMessage: 'Failed to run steps',
});

export const ERROR_RUNNING_TEST = i18n.translate('xpack.synthetics.testRun.testErrorLabel', {
  defaultMessage: 'Error running test',
});

const LOADING_STEPS = i18n.translate('xpack.synthetics.monitorManagement.loadingSteps', {
  defaultMessage: 'Loading steps...',
});

const STEPS_LABEL = i18n.translate('xpack.synthetics.monitorManagement.steps', {
  defaultMessage: 'Steps',
});
