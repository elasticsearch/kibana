/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IconType } from '@elastic/eui';
import type { AlertEpisodeStatus } from '@kbn/alerting-v2-schemas';
import type { EpisodeEventRow } from '../../../queries/episode_events_query';
import type { EpisodeActionHistoryEntry } from '../../../queries/episode_actions_history_query';

export interface StateChangeEntry {
  kind: 'state_change';
  timestamp: string;
  newStatus: AlertEpisodeStatus;
  /** undefined when this is the episode's initial status */
  prevStatus: AlertEpisodeStatus | undefined;
  prevEventCount: number;
}

export interface ActionEntry {
  kind: 'action';
  entry: EpisodeActionHistoryEntry;
}

export type TimelineEntry = StateChangeEntry | ActionEntry;

/** Icon shown on the avatar for each action type (no system actor profile). */
export const ACTION_ICON: Record<string, IconType> = {
  ack: 'checkInCircleFilled',
  unack: 'minusInCircle',
  snooze: 'bellSlash',
  unsnooze: 'bell',
  deactivate: 'checkInCircleFilled',
  activate: 'refresh',
  tag: 'tag',
  assign: 'user',
};

/**
 * Collapses a chronological run of episode event rows into the status
 * transitions between them, tracking how many events preceded each change.
 */
export const deriveStateChangeEntries = (eventRows: EpisodeEventRow[]): StateChangeEntry[] => {
  const entries: StateChangeEntry[] = [];
  let prevStatus: AlertEpisodeStatus | undefined;
  let runCount = 0;

  for (const row of eventRows) {
    const status = row['episode.status'];
    if (prevStatus === undefined) {
      entries.push({
        kind: 'state_change',
        timestamp: row['@timestamp'],
        newStatus: status,
        prevStatus: undefined,
        prevEventCount: 0,
      });
      prevStatus = status;
      runCount = 1;
    } else if (status !== prevStatus) {
      entries.push({
        kind: 'state_change',
        timestamp: row['@timestamp'],
        newStatus: status,
        prevStatus,
        prevEventCount: runCount,
      });
      prevStatus = status;
      runCount = 1;
    } else {
      runCount++;
    }
  }

  return entries;
};

const getEntryTimestamp = (entry: TimelineEntry): string =>
  entry.kind === 'state_change' ? entry.timestamp : entry.entry['@timestamp'];

/** Merges state changes and action history into a single newest-first list. */
export const mergeTimelineEntries = (
  stateChangeEntries: StateChangeEntry[],
  actionEntries: EpisodeActionHistoryEntry[]
): TimelineEntry[] => {
  const actionItems: TimelineEntry[] = actionEntries.map((entry) => ({ kind: 'action', entry }));
  return [...stateChangeEntries, ...actionItems].sort((a, b) =>
    getEntryTimestamp(b).localeCompare(getEntryTimestamp(a))
  );
};

export const formatTimestamp = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
