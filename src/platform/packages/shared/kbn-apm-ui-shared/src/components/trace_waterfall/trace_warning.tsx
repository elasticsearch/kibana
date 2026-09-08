/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiCallOut, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import React from 'react';
import { useTraceWaterfallContext } from './trace_waterfall_context';
import { TraceDataState } from './use_trace_waterfall';

export function TraceWarning({ children }: { children: React.ReactNode }) {
  const { traceState, message } = useTraceWaterfallContext();

  switch (traceState) {
    case TraceDataState.Partial:
    case TraceDataState.MissingEntry:
      return (
        <EuiFlexGroup direction="column">
          <EuiFlexItem grow={false}>
            <EuiCallOut data-test-subj="traceWarning" color="warning" size="s" title={message} />
          </EuiFlexItem>
          <EuiFlexItem grow={true}>{children}</EuiFlexItem>
        </EuiFlexGroup>
      );

    case TraceDataState.Empty:
      return <EuiCallOut data-test-subj="traceWarning" color="warning" size="s" title={message} />;

    case TraceDataState.Invalid:
      return <EuiCallOut data-test-subj="traceWarning" color="danger" size="s" title={message} />;

    default:
      return children;
  }
}
