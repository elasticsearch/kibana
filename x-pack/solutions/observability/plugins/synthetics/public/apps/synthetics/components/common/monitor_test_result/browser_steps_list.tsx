/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { CSSProperties, ReactElement, PropsWithChildren } from 'react';
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import type { Criteria, EuiBasicTableColumn, EuiTextProps, Pagination } from '@elastic/eui';
import {
  EuiBasicTable,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiTitle,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import type { EuiThemeComputed } from '@elastic/eui/src/services/theme/types';

import { StepTabs } from '../../test_run_details/step_tabs';
import { ResultDetails } from './result_details';
import type { JourneyStep } from '../../../../../../common/runtime_types';
import { JourneyStepScreenshotContainer } from '../screenshot/journey_step_screenshot_container';
import type { ScreenshotImageSize } from '../screenshot/screenshot_size';
import {
  THUMBNAIL_SCREENSHOT_SIZE,
  THUMBNAIL_SCREENSHOT_SIZE_MOBILE,
} from '../screenshot/screenshot_size';
import { StepDetailsLinkIcon } from '../links/step_details_link';

import { parseBadgeStatus, getTextColorForMonitorStatus } from './status_badge';
import { StepDurationText } from './step_duration_text';
import { ResultDetailsSuccessful } from './result_details_successful';

interface Props {
  steps: JourneyStep[];
  error?: Error;
  loading: boolean;
  showStepNumber: boolean;
  screenshotImageSize?: ScreenshotImageSize;
  compressed?: boolean;
  showExpand?: boolean;
  testNowMode?: boolean;
  showLastSuccessful?: boolean;
  // API monitors reuse the synthexec step pipeline but never render
  // screenshots (no browser context). Callers that know the monitor type
  // — e.g. last_test_run / test_run_steps — set this to false to omit
  // the Screenshot column instead of rendering an empty thumbnail.
  showScreenshots?: boolean;
}

export function isStepEnd(step: JourneyStep) {
  return step.synthetics?.type === 'step/end';
}

function toExpandedMapItem(step: JourneyStep, stepsList: JourneyStep[], testNowMode: boolean) {
  if (testNowMode) {
    return (
      <EuiFlexGroup>
        <EuiFlexItem>
          <StepTabs step={step} loading={false} stepsList={stepsList} />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }
  return <></>;
}

function mapStepIds(steps: JourneyStep[]) {
  return steps.map(({ _id }) => _id).toString();
}

const MAX_STEPS_TO_SHOW = 5;

export const BrowserStepsList = ({
  steps,
  error,
  loading,
  screenshotImageSize = THUMBNAIL_SCREENSHOT_SIZE,
  showLastSuccessful = true,
  showStepNumber = false,
  compressed = true,
  showExpand = true,
  testNowMode = false,
  showScreenshots = true,
}: Props) => {
  const [pageIndex, setPageIndex] = useState(0);

  const allStepEnds: JourneyStep[] = steps.filter(isStepEnd);
  const failedStep = allStepEnds.find((step) => step.synthetics.step?.status === 'failed');

  const shouldPaginate = allStepEnds.length > MAX_STEPS_TO_SHOW;

  const stepEnds = shouldPaginate
    ? allStepEnds.slice(
        pageIndex * MAX_STEPS_TO_SHOW,
        Math.min(pageIndex * MAX_STEPS_TO_SHOW + MAX_STEPS_TO_SHOW, allStepEnds.length)
      )
    : allStepEnds;

  const pagination: Pagination | undefined = shouldPaginate
    ? {
        pageIndex,
        pageSize: MAX_STEPS_TO_SHOW,
        totalItemCount: allStepEnds.length,
        showPerPageOptions: false,
      }
    : undefined;

  const onTableChange = ({ page }: Criteria<JourneyStep>) => {
    if (page) {
      setPageIndex(page.index);
    }
  };
  /**
   * This component is used in cases where the steps list is not pre-fetched at render time. In that case, we handle the auto-expand
   * in the `useEffect` call below, which will update the expanded map after the data loads. At times, the component is also rendered
   * with the complete list of steps pre-loaded. In that case, we must set the default state value to pre-expand for the error step.
   */
  const defaultExpanded = useMemo(
    () =>
      !!failedStep && showExpand
        ? { [failedStep._id]: toExpandedMapItem(failedStep, steps, testNowMode) }
        : {},
    [failedStep, showExpand, steps, testNowMode]
  );
  const { euiTheme } = useEuiTheme();
  const [expandedMap, setExpandedMap] = useState<Record<string, ReactElement>>(defaultExpanded);
  const [stepIds, setStepIds] = useState<string>(mapStepIds(stepEnds));

  useEffect(() => {
    /**
     * This effect will only take action when the set of steps changes.
     */
    const latestIds = mapStepIds(stepEnds);
    if (latestIds !== stepIds) {
      setStepIds(latestIds);
      if (failedStep && showExpand && !expandedMap[failedStep._id]) {
        setExpandedMap(
          Object.assign(expandedMap, {
            [failedStep._id]: toExpandedMapItem(failedStep, steps, testNowMode),
          })
        );
      }
    }
  }, [expandedMap, failedStep, showExpand, stepEnds, stepIds, steps, testNowMode]);

  const toggleDetails = useCallback(
    (item: JourneyStep) => {
      setExpandedMap((prevState) => {
        const expandedMapValues = { ...prevState };
        if (expandedMapValues[item._id]) {
          delete expandedMapValues[item._id];
        } else {
          expandedMapValues[item._id] = toExpandedMapItem(item, steps, testNowMode);
        }
        return expandedMapValues;
      });
    },
    [steps, testNowMode]
  );

  const columns: Array<EuiBasicTableColumn<JourneyStep>> = [
    ...(showExpand
      ? [
          {
            align: 'left' as const,
            width: '40px',
            isExpander: true,
            render: (item: JourneyStep) => (
              <EuiToolTip
                content={expandedMap[item._id] ? 'Collapse' : 'Expand'}
                disableScreenReaderOutput
              >
                <EuiButtonIcon
                  data-test-subj="syntheticsColumnsButton"
                  onClick={() => toggleDetails(item)}
                  aria-label={expandedMap[item._id] ? 'Collapse' : 'Expand'}
                  iconType={expandedMap[item._id] ? 'chevronSingleDown' : 'chevronSingleRight'}
                />
              </EuiToolTip>
            ),
          },
        ]
      : []),
    ...(showStepNumber
      ? [
          {
            field: 'synthetics.step.index',
            name: '#',
            render: (stepIndex: number, item: JourneyStep) => (
              <StyleForStepStatus step={item} euiTheme={euiTheme}>
                {stepIndex}
              </StyleForStepStatus>
            ),
            mobileOptions: {
              show: false,
            },
          },
        ]
      : []),
    ...(showScreenshots
      ? [
          {
            align: 'left' as const,
            field: 'timestamp',
            name: SCREENSHOT_LABEL,
            render: (timestamp: string, step: JourneyStep) => (
              <JourneyStepScreenshotContainer
                checkGroup={step.monitor.check_group}
                initialStepNumber={step.synthetics?.step?.index}
                stepStatus={step.synthetics.payload?.status}
                allStepsLoaded={!loading}
                retryFetchOnRevisit={true}
                size={screenshotImageSize}
                testNowMode={testNowMode}
                timestamp={timestamp}
              />
            ),
            mobileOptions: {
              render: (step: JourneyStep) => (
                <MobileRowDetails
                  journeyStep={step}
                  stepsLoading={loading}
                  showStepNumber={showStepNumber}
                  showLastSuccessful={showLastSuccessful}
                  isExpanded={Boolean(expandedMap[step._id])}
                  isTestNowMode={testNowMode}
                  euiTheme={euiTheme}
                  showScreenshots={showScreenshots}
                />
              ),
              header: false,
              enlarge: true,
              width: '100%',
            },
          },
        ]
      : []),
    {
      field: 'synthetics.step.name',
      name: STEP_NAME,
      render: (stepName: string, item) => {
        const status = parseBadgeStatus(item.synthetics.step?.status ?? '');

        const textColor = euiTheme.colors[
          getTextColorForMonitorStatus(status)
        ] as CSSProperties['color'];

        return (
          <EuiText color={textColor} size="m">
            {stepName}
          </EuiText>
        );
      },
      // When screenshots are hidden (API monitors) the screenshot column
      // — which normally carries the mobile MobileRowDetails renderer —
      // is gone, so fall back to hanging mobile rendering off the step
      // name column to keep parity with browser monitors on small viewports.
      mobileOptions: showScreenshots
        ? { show: false }
        : {
            render: (step: JourneyStep) => (
              <MobileRowDetails
                journeyStep={step}
                stepsLoading={loading}
                showStepNumber={showStepNumber}
                showLastSuccessful={showLastSuccessful}
                isExpanded={Boolean(expandedMap[step._id])}
                isTestNowMode={testNowMode}
                euiTheme={euiTheme}
                showScreenshots={showScreenshots}
              />
            ),
            header: false,
            enlarge: true,
            width: '100%',
          },
    },
    {
      field: 'synthetics.step.status',
      name: RESULT_LABEL,
      render: (pingStatus: string, item: JourneyStep) => (
        <ResultDetails
          testNowMode={testNowMode}
          step={item}
          pingStatus={pingStatus}
          isExpanded={Boolean(expandedMap[item._id]) && !testNowMode}
        />
      ),
      mobileOptions: {
        show: false,
      },
    },
    ...(showLastSuccessful
      ? [
          {
            field: 'synthetics.step.status',
            name: LAST_SUCCESSFUL,
            render: (pingStatus: string, item: JourneyStep) => (
              <ResultDetailsSuccessful step={item} isExpanded={Boolean(expandedMap[item._id])} />
            ),
            mobileOptions: {
              show: false,
            },
          },
        ]
      : [
          {
            align: 'left' as const,
            name: STEP_DURATION,
            render: (item: JourneyStep) => {
              return <StepDurationText step={item} />;
            },
            mobileOptions: {
              header: STEP_DURATION,
              show: true,
            },
          },
        ]),
    {
      align: 'right',
      field: 'timestamp',
      name: '',
      render: (_val: string, item) => (
        <StepDetailsLinkIcon
          checkGroup={item.monitor.check_group}
          stepIndex={item.synthetics?.step?.index}
          configId={item.config_id!}
          target={testNowMode ? '_blank' : undefined}
        />
      ),
      mobileOptions: { show: false },
    },
  ];

  return (
    <EuiBasicTable
      cellProps={(row) => {
        if (expandedMap[row._id]) {
          return {
            style: { verticalAlign: 'top' },
          };
        }
      }}
      compressed={compressed}
      loading={loading}
      columns={columns}
      error={error?.message}
      items={stepEnds}
      noItemsMessage={
        loading
          ? i18n.translate('xpack.synthetics.monitor.step.loading', {
              defaultMessage: 'Loading steps...',
            })
          : i18n.translate('xpack.synthetics.monitor.step.noDataFound', {
              defaultMessage: 'No data found',
            })
      }
      tableCaption={i18n.translate('xpack.synthetics.monitor.browserStepsList.caption', {
        defaultMessage: 'Step results',
      })}
      tableLayout="auto"
      itemId="_id"
      itemIdToExpandedRowMap={testNowMode || showExpand ? expandedMap : undefined}
      onChange={onTableChange}
      pagination={pagination}
    />
  );
};

const StyleForStepStatus = ({
  step,
  textSize = 's',
  euiTheme,
  children,
}: PropsWithChildren<{
  step: JourneyStep;
  textSize?: EuiTextProps['size'];
  euiTheme: EuiThemeComputed;
}>) => {
  const status = parseBadgeStatus(step.synthetics?.step?.status ?? '');

  return (
    <EuiText
      css={{
        fontWeight: euiTheme.font.weight.bold,
        whiteSpace: 'nowrap',
      }}
      size={textSize}
      color={euiTheme.colors[getTextColorForMonitorStatus(status)] as CSSProperties['color']}
    >
      {children}
    </EuiText>
  );
};

const MobileRowDetails = ({
  journeyStep,
  showStepNumber,
  showLastSuccessful,
  stepsLoading,
  isExpanded,
  isTestNowMode,
  euiTheme,
  showScreenshots = true,
}: {
  journeyStep: JourneyStep;
  showStepNumber: boolean;
  showLastSuccessful: boolean;
  stepsLoading: boolean;
  isExpanded: boolean;
  isTestNowMode: boolean;
  euiTheme: EuiThemeComputed;
  showScreenshots?: boolean;
}) => {
  return (
    <EuiFlexGroup direction="column" gutterSize="s">
      <EuiTitle size="s">
        <h4>
          <StyleForStepStatus step={journeyStep} textSize="relative" euiTheme={euiTheme}>
            {showStepNumber && journeyStep.synthetics?.step?.index
              ? `${journeyStep.synthetics.step.index}. `
              : null}{' '}
            {journeyStep.synthetics?.step?.name}
          </StyleForStepStatus>
        </h4>
      </EuiTitle>
      <EuiFlexGroup justifyContent="spaceEvenly" responsive={false} wrap={true} gutterSize="xl">
        {showScreenshots && (
          <JourneyStepScreenshotContainer
            checkGroup={journeyStep.monitor.check_group}
            initialStepNumber={journeyStep.synthetics?.step?.index}
            stepStatus={journeyStep.synthetics.payload?.status}
            allStepsLoaded={!stepsLoading}
            retryFetchOnRevisit={true}
            size={THUMBNAIL_SCREENSHOT_SIZE_MOBILE}
            timestamp={journeyStep?.['@timestamp']}
          />
        )}
        <div>
          <EuiFlexGroup direction="column" gutterSize="s">
            {[
              {
                title: RESULT_LABEL,
                description: (
                  <ResultDetails
                    testNowMode={isTestNowMode}
                    step={journeyStep}
                    pingStatus={journeyStep?.synthetics?.step?.status ?? 'skipped'}
                    isExpanded={isExpanded && !isTestNowMode}
                  />
                ),
              },
              ...[
                showLastSuccessful
                  ? {
                      title: LAST_SUCCESSFUL,
                      description: (
                        <ResultDetailsSuccessful step={journeyStep} isExpanded={isExpanded} />
                      ),
                    }
                  : {
                      title: STEP_DURATION,
                      description: <StepDurationText step={journeyStep} />,
                    },
              ],
            ].map(({ title, description }) => (
              <EuiFlexGroup
                key={title}
                css={{ maxWidth: 'fit-content' }}
                direction="row"
                alignItems="baseline"
                gutterSize="xs"
                responsive={false}
                wrap={true}
              >
                <EuiText size="xs">{title}</EuiText>
                {description}
              </EuiFlexGroup>
            ))}
          </EuiFlexGroup>
        </div>
      </EuiFlexGroup>
      <StepDetailsLinkIcon
        css={{ marginLeft: 'auto' }}
        checkGroup={journeyStep.monitor.check_group}
        stepIndex={journeyStep.synthetics?.step?.index}
        configId={journeyStep.config_id!}
        asButton={true}
      />
    </EuiFlexGroup>
  );
};

const RESULT_LABEL = i18n.translate('xpack.synthetics.monitor.result.label', {
  defaultMessage: 'Result',
});

const LAST_SUCCESSFUL = i18n.translate('xpack.synthetics.monitor.result.lastSuccessful', {
  defaultMessage: 'Last successful',
});
const SCREENSHOT_LABEL = i18n.translate('xpack.synthetics.monitor.screenshot.label', {
  defaultMessage: 'Screenshot',
});

const STEP_NAME = i18n.translate('xpack.synthetics.monitor.stepName.label', {
  defaultMessage: 'Step name',
});

const STEP_DURATION = i18n.translate('xpack.synthetics.monitor.step.duration.label', {
  defaultMessage: 'Duration',
});
