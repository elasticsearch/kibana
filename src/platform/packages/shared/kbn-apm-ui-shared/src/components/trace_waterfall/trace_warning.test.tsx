/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { TraceWarning } from './trace_warning';
import { TraceWaterfallContext, type TraceWaterfallContextProps } from './trace_waterfall_context';
import { TraceDataState } from './use_trace_waterfall';

describe('TraceWarning', () => {
  it("doesn't render a warning for a complete trace", () => {
    render(
      <TraceWaterfallContext.Provider
        value={{ traceState: TraceDataState.Full } as TraceWaterfallContextProps}
      >
        <TraceWarning>
          <div>Trace</div>
        </TraceWarning>
      </TraceWaterfallContext.Provider>
    );

    const warning = screen.queryByTestId('traceWarning');
    const trace = screen.queryByText('Trace');

    expect(warning).not.toBeInTheDocument();
    expect(trace).toBeInTheDocument();
  });

  it('renders a warning for a partial trace, and shows the trace', () => {
    render(
      <TraceWaterfallContext.Provider
        value={{ traceState: TraceDataState.Partial } as TraceWaterfallContextProps}
      >
        <TraceWarning>
          <div>Trace</div>
        </TraceWarning>
      </TraceWaterfallContext.Provider>
    );

    const warning = screen.queryByTestId('traceWarning');
    const trace = screen.queryByText('Trace');

    expect(warning).toBeInTheDocument();
    expect(trace).toBeInTheDocument();
  });

  it('renders a warning for a missing selected transaction, and shows the fallback trace', () => {
    render(
      <TraceWaterfallContext.Provider
        value={{ traceState: TraceDataState.MissingEntry } as TraceWaterfallContextProps}
      >
        <TraceWarning>
          <div>Trace</div>
        </TraceWarning>
      </TraceWaterfallContext.Provider>
    );

    const warning = screen.queryByTestId('traceWarning');
    const trace = screen.queryByText('Trace');

    expect(warning).toBeInTheDocument();
    expect(trace).toBeInTheDocument();
  });

  it('renders a warning for an empty trace, and does not show the trace', () => {
    render(
      <TraceWaterfallContext.Provider
        value={{ traceState: TraceDataState.Empty } as TraceWaterfallContextProps}
      >
        <TraceWarning>
          <div>Trace</div>
        </TraceWarning>
      </TraceWaterfallContext.Provider>
    );

    const warning = screen.queryByTestId('traceWarning');
    const trace = screen.queryByText('Trace');

    expect(warning).toBeInTheDocument();
    expect(trace).not.toBeInTheDocument();
  });
});
