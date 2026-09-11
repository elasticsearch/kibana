/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Fragment } from 'react';
import { EuiProgress, EuiSpacer, EuiFlexItem, EuiSkeletonText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { PanelWithTitle } from '../../common/components/panel_with_title';
import { useSelectedMonitor } from '../hooks/use_selected_monitor';
import { useFailedTestByStep } from '../hooks/use_failed_tests_by_step';

export const FailedTestsByStep = ({ time }: { time: { to: string; from: string } }) => {
  const { failedSteps, loading } = useFailedTestByStep(time);

  const { monitor } = useSelectedMonitor();

  // Both browser and API journeys emit synthexec `step/end` events with
  // `synthetics.step.name` — the underlying aggregation in
  // `useFailedTestByStep` works for either. HTTP/TCP/ICMP monitors have no
  // step concept so the panel stays hidden for them.
  if (monitor?.type !== 'browser' && monitor?.type !== 'api') {
    return null;
  }

  if (loading && !failedSteps) {
    return <EuiSkeletonText lines={3} />;
  }

  return (
    <EuiFlexItem grow={1}>
      <PanelWithTitle title={FAILED_TESTS_BY_STEPS_LABEL}>
        <EuiSpacer size="m" />
        <div>
          {failedSteps?.map((item) => (
            <Fragment key={item.name}>
              <EuiProgress
                valueText={
                  <span>
                    {i18n.translate('xpack.synthetics.monitorDetails.summary.failedTests.count', {
                      defaultMessage: 'Failed {count}',
                      values: { count: item.count },
                    })}
                  </span>
                }
                max={100}
                color="danger"
                size="l"
                value={item.percent}
                label={`${item.index}. ${item.name}`}
              />
              <EuiSpacer size="s" />
            </Fragment>
          ))}
        </div>
      </PanelWithTitle>
    </EuiFlexItem>
  );
};

const FAILED_TESTS_BY_STEPS_LABEL = i18n.translate('xpack.synthetics.errors.failedTests.byStep', {
  defaultMessage: 'Failed tests by step',
});
