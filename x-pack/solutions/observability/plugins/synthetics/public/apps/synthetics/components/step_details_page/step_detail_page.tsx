/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTrackPageview } from '@kbn/observability-shared-plugin/public';
import { EuiFlexGroup, EuiFlexItem, EuiPanel, EuiSpacer } from '@elastic/eui';
import { useDispatch } from 'react-redux';
import { ErrorCallOut } from './error_callout';
import { useStepDetailsBreadcrumbs } from './hooks/use_step_details_breadcrumbs';
import { WaterfallChartContainer } from './step_waterfall_chart/waterfall/waterfall_chart_container';
import { NetworkTimingsDonut } from './step_timing_breakdown/network_timings_donut';
import { useJourneySteps } from '../monitor_details/hooks/use_journey_steps';
import { useGetUrlParams } from '../../hooks';
import { getNetworkEvents } from '../../state/network_events/actions';
import { ObjectWeightList } from './step_objects/object_weight_list';
import { StepMetrics } from './step_metrics/step_metrics';
import { ObjectCountList } from './step_objects/object_count_list';
import { MonitorDetailsLinkPortal } from '../monitor_add_edit/monitor_details_portal';
import { StepImage } from './step_screenshot/step_image';
import { BreakdownLegend } from './step_timing_breakdown/breakdown_legend';
import { NetworkTimingsBreakdown } from './network_timings_breakdown';

export const StepDetailPage = () => {
  const { checkGroupId, stepIndex } = useParams<{ checkGroupId: string; stepIndex: string }>();

  useTrackPageview({ app: 'synthetics', path: 'stepDetail' });
  useTrackPageview({ app: 'synthetics', path: 'stepDetail', delay: 15000 });

  const { data, isFailedStep, currentStep } = useJourneySteps();

  useStepDetailsBreadcrumbs();

  const dispatch = useDispatch();

  const { remoteName } = useGetUrlParams();

  useEffect(() => {
    dispatch(
      getNetworkEvents.get({
        checkGroup: checkGroupId,
        stepIndex: Number(stepIndex),
        remoteName,
      })
    );
  }, [dispatch, stepIndex, checkGroupId, remoteName]);

  return (
    <>
      <ErrorCallOut step={currentStep} />
      {data?.details?.journey?.config_id && (
        <MonitorDetailsLinkPortal
          configId={data.details.journey.config_id}
          name={data.details.journey.monitor.name!}
          remoteName={remoteName}
        />
      )}
      <EuiFlexGroup gutterSize="m">
        <EuiFlexItem grow={1}>
          <EuiPanel hasShadow={false} hasBorder>
            {data?.details?.journey && currentStep && (
              <StepImage ping={data?.details?.journey} step={currentStep} isFailed={isFailedStep} />
            )}
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem grow={2}>
          <EuiPanel hasShadow={false} hasBorder>
            <EuiFlexGroup wrap>
              <EuiFlexItem grow={1} style={{ minWidth: 150 }}>
                <NetworkTimingsDonut />
              </EuiFlexItem>
              <EuiFlexItem grow={1} style={{ minWidth: 200 }}>
                <BreakdownLegend />
              </EuiFlexItem>
              <EuiFlexItem grow={2} style={{ minWidth: 200 }}>
                <NetworkTimingsBreakdown monitorQueryId={data?.details?.journey.monitor.id!} />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiFlexGroup gutterSize="m">
        <EuiFlexItem grow={1}>
          <EuiPanel hasShadow={false} hasBorder>
            <StepMetrics />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem grow={2}>
          <EuiPanel hasShadow={false} hasBorder>
            <EuiFlexGroup gutterSize="xl">
              <EuiFlexItem grow={1}>
                <ObjectWeightList />
              </EuiFlexItem>
              <EuiFlexItem grow={1}>
                <ObjectCountList />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      {data && (
        <WaterfallChartContainer
          checkGroup={checkGroupId}
          stepIndex={Number(stepIndex)}
          activeStep={currentStep}
        />
      )}
    </>
  );
};
