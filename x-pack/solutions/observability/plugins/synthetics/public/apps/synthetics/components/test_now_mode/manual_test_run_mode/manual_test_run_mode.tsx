/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Fragment } from 'react';
import { useRunOnceErrors } from '../hooks/use_run_once_errors';
import type { ManualTestRun } from '../../../state/manual_test_runs';
import { BrowserTestRunResult } from './browser_test_results';
import { SimpleTestResults } from './simple_test_results';
import type { Locations } from '../../../../../../common/runtime_types';
import { useMonitorById } from '../../../hooks/use_monitor_by_id';

export function ManualTestRunMode({
  manualTestRun,
  onDone,
}: {
  manualTestRun: ManualTestRun;
  onDone: (testRunId: string) => void;
}) {
  const monitor = useMonitorById(manualTestRun.configId);

  const { expectPings } = useRunOnceErrors({
    testRunId: manualTestRun.testRunId!,
    locations: (monitor?.locations ?? []) as Locations,
    errors: manualTestRun.errors ?? [],
  });

  if (!manualTestRun.testRunId || !monitor) return null;

  // API journeys ride the same step pipeline as browser monitors; the
  // SimpleTestResults flow only understands single-ping HTTP/TCP/ICMP runs.
  const isMultiStepMonitor = monitor.type === 'browser' || monitor.type === 'api';

  return (
    <Fragment key={manualTestRun.testRunId}>
      {isMultiStepMonitor ? (
        <BrowserTestRunResult
          name={monitor.name}
          expectPings={expectPings}
          onDone={onDone}
          testRunId={manualTestRun.testRunId}
          onProgress={() => {}}
        />
      ) : (
        <SimpleTestResults
          name={monitor.name}
          expectPings={expectPings}
          onDone={onDone}
          testRunId={manualTestRun.testRunId}
        />
      )}
    </Fragment>
  );
}
