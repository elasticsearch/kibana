/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CorrelationDepth,
  CorrelationRun,
} from '../../../../../common/threat_intelligence/correlation_runs';
import { CORRELATION_RUNS_API_PATH } from '../../../../../common/threat_intelligence/hub';
import { useKibana } from '../../../../common/lib/kibana';

const POLL_INTERVAL_MS = 1500;

export interface StartRunInput {
  readonly input_type: 'report_id' | 'raw_text';
  readonly report_id?: string;
  readonly raw_text?: string;
  readonly depth: CorrelationDepth;
}

export interface UseCorrelationRunsState {
  readonly activeRun: CorrelationRun | null;
  readonly polling: boolean;
  readonly error: string | null;
  readonly recents: readonly CorrelationRun[];
  readonly recentsLoading: boolean;
  readonly startRun: (input: StartRunInput) => Promise<void>;
  readonly loadRun: (runId: string) => Promise<void>;
  readonly refreshRecents: () => Promise<void>;
  readonly clearActive: () => void;
  readonly updateRunTitle: (runId: string, title: string) => Promise<void>;
}

const extractErrorMessage = (err: unknown): string =>
  (err as { body?: { message?: string } }).body?.message ??
  (err as Error).message ??
  'Unknown error';

export const useCorrelationRuns = (): UseCorrelationRunsState => {
  const { http } = useKibana().services;

  const [activeRun, setActiveRun] = useState<CorrelationRun | null>(null);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recents, setRecents] = useState<readonly CorrelationRun[]>([]);
  const [recentsLoading, setRecentsLoading] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const activeRunIdRef = useRef<string | undefined>(undefined);

  // Keep http in a ref so the poll callback (defined below, outside useCallback)
  // always reads the latest reference without needing it in a dep array.
  const httpRef = useRef(http);
  httpRef.current = http;

  const clearTimer = useCallback((): void => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  // Poll function assigned each render so it closes over the current state setters.
  // Ref-based so it can be called from startRun / loadRun without circular useCallback deps.
  const pollRef = useRef<((runId: string) => void) | undefined>(undefined);
  pollRef.current = (runId: string): void => {
    timerRef.current = setTimeout(async () => {
      if (activeRunIdRef.current !== runId) return;
      try {
        const run = await httpRef.current.get<CorrelationRun>(
          `${CORRELATION_RUNS_API_PATH}/${runId}`,
          { version: '2023-10-31' }
        );
        if (activeRunIdRef.current !== runId) return;
        setActiveRun(run);
        if (run.status === 'succeeded' || run.status === 'failed') {
          setPolling(false);
          if (run.status === 'failed') {
            setError(run.error ?? 'Run failed');
          }
        } else {
          pollRef.current?.(runId);
        }
      } catch (err) {
        if (activeRunIdRef.current !== runId) return;
        setError(extractErrorMessage(err));
        setPolling(false);
      }
    }, POLL_INTERVAL_MS);
  };

  const startRun = useCallback(
    async (input: StartRunInput): Promise<void> => {
      clearTimer();
      activeRunIdRef.current = undefined;
      setActiveRun(null);
      setError(null);
      setPolling(true);
      try {
        const { runId } = await http.post<{ runId: string }>(CORRELATION_RUNS_API_PATH, {
          version: '2023-10-31',
          body: JSON.stringify(input),
        });
        activeRunIdRef.current = runId;
        pollRef.current?.(runId);
      } catch (err) {
        setError(extractErrorMessage(err));
        setPolling(false);
      }
    },
    [clearTimer, http]
  );

  const loadRun = useCallback(
    async (runId: string): Promise<void> => {
      clearTimer();
      activeRunIdRef.current = runId;
      setError(null);
      setPolling(false);
      try {
        const run = await http.get<CorrelationRun>(`${CORRELATION_RUNS_API_PATH}/${runId}`, {
          version: '2023-10-31',
        });
        setActiveRun(run);
        if (run.status === 'pending' || run.status === 'running') {
          setPolling(true);
          pollRef.current?.(runId);
        }
      } catch (err) {
        setError(extractErrorMessage(err));
      }
    },
    [clearTimer, http]
  );

  const refreshRecents = useCallback(async (): Promise<void> => {
    setRecentsLoading(true);
    try {
      const result = await http.get<{ runs: CorrelationRun[]; total: number }>(
        CORRELATION_RUNS_API_PATH,
        { version: '2023-10-31' }
      );
      setRecents(result.runs);
    } catch {
      // Recents are best-effort; silently ignore failures
    } finally {
      setRecentsLoading(false);
    }
  }, [http]);

  const clearActive = useCallback((): void => {
    clearTimer();
    activeRunIdRef.current = undefined;
    setActiveRun(null);
    setError(null);
    setPolling(false);
  }, [clearTimer]);

  const updateRunTitle = useCallback(
    async (runId: string, title: string): Promise<void> => {
      await http.patch<{ runId: string; title: string }>(`${CORRELATION_RUNS_API_PATH}/${runId}`, {
        version: '2023-10-31',
        body: JSON.stringify({ title }),
      });
      setActiveRun((prev) => (prev?.runId === runId ? { ...prev, title } : prev));
      setRecents((prev) => prev.map((r) => (r.runId === runId ? { ...r, title } : r)));
    },
    [http]
  );

  useEffect(() => {
    void refreshRecents();
  }, [refreshRecents]);

  // Cleanup on unmount
  useEffect(() => clearTimer, [clearTimer]);

  return {
    activeRun,
    polling,
    error,
    recents,
    recentsLoading,
    startRun,
    loadRun,
    refreshRecents,
    clearActive,
    updateRunTitle,
  };
};
