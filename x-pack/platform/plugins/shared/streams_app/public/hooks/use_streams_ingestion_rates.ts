/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useState, useEffect } from 'react';
import type { StreamDocsStat } from '@kbn/streams-plugin/common';

interface UseStreamsIngestionRatesProps {
  /**
   * Range-scoped per-stream document counts (a single batched request resolved by
   * `useStreamDocCountsFetch`). Resolving one promise for all streams avoids firing one query
   * per stream, which exhausts the browser's connection pool on large stream sets.
   */
  ingestionDocCount: Promise<StreamDocsStat[]>;
  timeStart: number;
  timeEnd: number;
}

interface UseStreamsIngestionRatesResult {
  ingestionByStream: Record<string, number>;
  ingestionLoaded: boolean;
  ingestionError: boolean;
}

interface IngestionRatesState {
  byStream: Record<string, number>;
  loaded: boolean;
  error: boolean;
}

/**
 * Resolves the batched per-stream ingested doc counts and computes average docs/sec
 * for the given time range.
 */
export const useStreamsIngestionRates = ({
  ingestionDocCount,
  timeStart,
  timeEnd,
}: UseStreamsIngestionRatesProps): UseStreamsIngestionRatesResult => {
  const [state, setState] = useState<IngestionRatesState>({
    byStream: {},
    loaded: false,
    error: false,
  });

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loaded: false, error: false }));

    const timeRangeSec = (timeEnd - timeStart) / 1000;

    ingestionDocCount
      .then((counts) => {
        if (cancelled) return;
        const byStream: Record<string, number> = {};
        for (const { stream, count } of counts) {
          byStream[stream] = timeRangeSec > 0 ? count / timeRangeSec : 0;
        }
        setState({ byStream, loaded: true, error: false });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ byStream: {}, loaded: true, error: true });
      });

    return () => {
      cancelled = true;
    };
  }, [ingestionDocCount, timeStart, timeEnd]);

  return {
    ingestionByStream: state.byStream,
    ingestionLoaded: state.loaded,
    ingestionError: state.error,
  };
};
