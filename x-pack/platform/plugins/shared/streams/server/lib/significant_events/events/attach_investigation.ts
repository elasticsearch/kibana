/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEqual } from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import type { SignificantEventInvestigation } from '@kbn/significant-events-schema';
import type { EventClient } from './event_client';

export const attachInvestigationToEvent = async ({
  eventClient,
  eventId,
  investigation,
}: {
  eventClient: EventClient;
  eventId: string;
  investigation: SignificantEventInvestigation;
}): Promise<{ event_id: string; updated: number; ignored: number }> => {
  const { hits } = await eventClient.findById(eventId);
  const referenced = hits[hits.length - 1];

  if (!referenced) {
    return { event_id: eventId, updated: 0, ignored: 1 };
  }

  /**
   * event_id is unique per append-only version; discovery_slug is the stable lineage key.
   * Resolve the true latest version for this slug so pending and terminal attaches build a
   * single chain rather than branching as siblings off the same frozen caller-supplied version.
   * (The workflow passes the frozen inputs.context.event_id to both its pending and terminal
   * steps, so without this re-resolution both writes would branch off the same old version.)
   */
  const { hits: lineageHits } = await eventClient.findByDiscoverySlug(referenced.discovery_slug);
  const latest = lineageHits[lineageHits.length - 1] ?? referenced;

  const existing = latest.investigations ?? [];
  const now = new Date().toISOString();

  /**
   * cancel-in-progress (keyed on discovery_slug, max 1) guarantees only one run per slug is ever
   * active, so any *other* entry still marked `pending` belongs to a superseded/cancelled run that
   * will never reach its terminal step. Resolve it to `failed` so it stops driving the "Running"
   * UI state (hasPendingInvestigation) and the flyout's 5s poll loop.
   */
  const reconciled = existing.map((entry) =>
    entry.workflow_execution_id !== investigation.workflow_execution_id &&
    entry.status === 'pending'
      ? { ...entry, status: 'failed' as const, completed_at: entry.completed_at ?? now }
      : entry
  );

  // Replace-by-workflow_execution_id: callers always send the full investigation object.
  const existingIdx = reconciled.findIndex(
    (i) => i.workflow_execution_id === investigation.workflow_execution_id
  );

  let investigations: SignificantEventInvestigation[];
  if (existingIdx !== -1) {
    investigations = reconciled.map((entry, idx) => (idx === existingIdx ? investigation : entry));
  } else if (reconciled.length < 100) {
    investigations = [...reconciled, investigation];
  } else {
    // At the schema-enforced 100-entry cap; still write any reconciliation changes but
    // cannot append a new entry without exceeding investigations.max(100).
    investigations = reconciled;
  }

  if (isEqual(investigations, existing)) {
    return { event_id: eventId, updated: 0, ignored: 1 };
  }

  const nextEventId = uuidv4();
  const updatedEvent = {
    ...latest,
    '@timestamp': now,
    created_at: now,
    event_id: nextEventId,
    previous_event_id: latest.event_id,
    investigations,
  };

  await eventClient.bulkCreate([updatedEvent], { throwOnFail: true });

  return { event_id: nextEventId, updated: 1, ignored: 0 };
};
