/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Streams, streamMatchesIndexPatterns } from '@kbn/streams-schema';
import type { WorkflowExecutionListItemDto } from '@kbn/workflows';
import { minimatch } from 'minimatch';
import { isTerminalStatus } from '@kbn/workflows';
import { parseStreamNameFromConcurrencyKey } from '../../../../lib/workflows/onboarding_workflow_client';

export interface StreamCandidate {
  streamName: string;
  lastCompletedAt: string | null;
}

export interface StreamClassificationResult {
  alreadyRunning: Array<{ streamName: string; scheduledAt: string | null }>;
  candidates: StreamCandidate[];
  upToDate: StreamCandidate[];
  excluded: string[];
  unsupported: string[];
  excludePatterns: string[];
}

export const parseExcludePatterns = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

const matchesExcludePatterns = (name: string, patterns: string[]): boolean =>
  patterns.some((pattern) => minimatch(name, pattern));

/**
 * Selects the streams eligible for continuous knowledge indicator onboarding.
 * Query streams are always included, gated only by the query-streams feature flag;
 * all other stream types are eligible only when their name matches the configured
 * significant events index patterns.
 */
export const filterEligibleStreams = ({
  allStreams,
  isQueryStreamsEnabled,
  indexPatterns,
}: {
  allStreams: Streams.all.Definition[];
  isQueryStreamsEnabled: boolean;
  indexPatterns: string[];
}): Streams.all.Definition[] =>
  allStreams.filter((stream) => {
    if (Streams.QueryStream.Definition.is(stream)) {
      return isQueryStreamsEnabled;
    }
    return streamMatchesIndexPatterns(stream.name, indexPatterns);
  });

/**
 * Classifies streams into buckets (excluded, already-running, candidates, up-to-date)
 * by examining the latest onboarding workflow execution for each stream
 * and comparing the finish time against the configured extraction interval.
 */
export const classifyStreams = ({
  allStreams,
  executions,
  excludedStreamPatterns,
  intervalHours,
}: {
  allStreams: Streams.all.Definition[];
  executions: WorkflowExecutionListItemDto[];
  excludedStreamPatterns: string;
  intervalHours: number;
}): StreamClassificationResult => {
  const excludePatterns = parseExcludePatterns(excludedStreamPatterns);

  const excluded: string[] = [];
  const unsupported: string[] = [];
  const eligibleNames = new Set<string>();
  for (const stream of allStreams) {
    const { name } = stream;
    const isSupported =
      Streams.WiredStream.Definition.is(stream) ||
      Streams.ClassicStream.Definition.is(stream) ||
      Streams.QueryStream.Definition.is(stream);
    if (!isSupported) {
      unsupported.push(name);
      continue;
    }
    if (matchesExcludePatterns(name, excludePatterns)) {
      excluded.push(name);
    } else {
      eligibleNames.add(name);
    }
  }

  // Group executions by stream name (from concurrency key), keeping only the latest per stream
  const latestByStream = new Map<string, WorkflowExecutionListItemDto>();
  for (const execution of executions) {
    if (!execution.concurrencyGroupKey) continue;
    const streamName = parseStreamNameFromConcurrencyKey(execution.concurrencyGroupKey);
    if (!streamName || !eligibleNames.has(streamName)) continue;
    // Executions are expected sorted by createdAt desc; keep only the first (latest) per stream
    if (!latestByStream.has(streamName)) {
      latestByStream.set(streamName, execution);
    }
  }

  const intervalMs = intervalHours * 3_600_000;
  const now = Date.now();
  const alreadyRunning: Array<{ streamName: string; scheduledAt: string | null }> = [];
  const candidates: StreamCandidate[] = [];
  const upToDate: StreamCandidate[] = [];
  const streamsWithExecution = new Set<string>();

  for (const [streamName, execution] of latestByStream) {
    streamsWithExecution.add(streamName);

    if (!isTerminalStatus(execution.status)) {
      alreadyRunning.push({ streamName, scheduledAt: execution.startedAt ?? null });
    } else {
      const finishedMs = execution.finishedAt ? new Date(execution.finishedAt).getTime() : 0;
      if (now - finishedMs >= intervalMs) {
        candidates.push({ streamName, lastCompletedAt: execution.finishedAt ?? null });
      } else {
        upToDate.push({ streamName, lastCompletedAt: execution.finishedAt ?? null });
      }
    }
  }

  // Prioritize streams whose last onboarding finished longest ago, so older
  // onboarding is retried before more recent onboarding.
  candidates.sort(
    (a, b) =>
      (a.lastCompletedAt ? new Date(a.lastCompletedAt).getTime() : 0) -
      (b.lastCompletedAt ? new Date(b.lastCompletedAt).getTime() : 0)
  );

  const noExecutionStreams = [...eligibleNames].filter((name) => !streamsWithExecution.has(name));
  const allCandidates = [
    ...noExecutionStreams.map((name) => ({ streamName: name, lastCompletedAt: null })),
    ...candidates,
  ];

  return {
    alreadyRunning,
    candidates: allCandidates,
    upToDate,
    excluded,
    unsupported,
    excludePatterns,
  };
};
