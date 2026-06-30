/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BulkResponse } from '@elastic/elasticsearch/lib/api/types';
import type { SignificantEventInvestigation } from '@kbn/significant-events-schema';
import { attachInvestigationToEvent } from './attach_investigation';
import { EventClient } from './event_client';
import type { SignificantEvent } from './data_stream';

const createEvent = (overrides: Partial<SignificantEvent> = {}): SignificantEvent => ({
  '@timestamp': '2026-01-01T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  event_id: 'event-1',
  discovery_slug: 'agent-event-1',
  status: 'promoted',
  stream_names: ['logs.test'],
  title: 'Test event',
  summary: 'Test summary',
  root_cause: 'Test root cause',
  criticality: 50,
  confidence: 0.8,
  recommendations: ['Investigate the test signal'],
  ...overrides,
});

const createInvestigation = (
  overrides: Partial<SignificantEventInvestigation> = {}
): SignificantEventInvestigation => ({
  workflow_execution_id: 'exec-1',
  status: 'pending',
  started_at: '2026-01-01T01:00:00.000Z',
  ...overrides,
});

/**
 * @param hits - results returned for the first esql query (findById)
 * @param lineageHits - when provided, returned for the second query (findByDiscoverySlug);
 *   when omitted both queries return the same `hits` (backward-compat behaviour).
 */
const createEventClient = (hits: SignificantEvent[], lineageHits?: SignificantEvent[]) => {
  const okResponse = { errors: false, items: [] } as unknown as BulkResponse;
  const dataStreamClient = { create: jest.fn().mockResolvedValue(okResponse) };

  const makeResult = (h: SignificantEvent[]) => ({
    columns: [{ name: '_source' }],
    values: h.map((event) => [{ ...event }]),
  });

  const queryMock = jest.fn().mockResolvedValue(makeResult(hits));
  if (lineageHits !== undefined) {
    // Sequence the two internal esql calls: findById first, findByDiscoverySlug second.
    queryMock
      .mockResolvedValueOnce(makeResult(hits))
      .mockResolvedValueOnce(makeResult(lineageHits));
  }

  const esClient = { esql: { query: queryMock } };
  const client = new EventClient({
    dataStreamClient: dataStreamClient as never,
    esClient: esClient as never,
    space: 'default',
  });
  return { client, dataStreamClient };
};

describe('attachInvestigationToEvent', () => {
  it('appends a new investigation entry and creates a new event version', async () => {
    const existing = createEvent({ event_id: 'event-1' });
    const { client, dataStreamClient } = createEventClient([existing]);
    const investigation = createInvestigation();

    const result = await attachInvestigationToEvent({
      eventClient: client,
      eventId: 'event-1',
      investigation,
    });

    expect(result.updated).toBe(1);
    expect(result.ignored).toBe(0);

    const [[callArg]] = dataStreamClient.create.mock.calls;
    const written: SignificantEvent = callArg.documents[0];

    expect(written.investigations).toEqual([investigation]);
    expect(written.previous_event_id).toBe('event-1');
    expect(written.event_id).not.toBe('event-1');
  });

  it('replaces a pending entry with a terminal one, preserving started_at', async () => {
    const pending = createInvestigation({ status: 'pending' });
    const existing = createEvent({ event_id: 'event-1', investigations: [pending] });
    const { client, dataStreamClient } = createEventClient([existing]);

    const terminal = createInvestigation({
      status: 'success',
      completed_at: '2026-01-01T02:00:00.000Z',
    });
    const result = await attachInvestigationToEvent({
      eventClient: client,
      eventId: 'event-1',
      investigation: terminal,
    });

    expect(result.updated).toBe(1);

    const [[callArg]] = dataStreamClient.create.mock.calls;
    const written: SignificantEvent = callArg.documents[0];

    // Only one entry — replaced, not duplicated
    expect(written.investigations).toHaveLength(1);
    expect(written.investigations![0].status).toBe('success');
    expect(written.investigations![0].started_at).toBe(pending.started_at);
    expect(written.investigations![0].completed_at).toBe('2026-01-01T02:00:00.000Z');
  });

  it('replaces by workflow_execution_id: different executions produce two entries', async () => {
    const first = createInvestigation({
      workflow_execution_id: 'exec-1',
      status: 'success',
      completed_at: '2026-01-01T01:30:00.000Z',
    });
    const existing = createEvent({ event_id: 'event-1', investigations: [first] });
    const { client, dataStreamClient } = createEventClient([existing]);

    const second = createInvestigation({ workflow_execution_id: 'exec-2' });
    await attachInvestigationToEvent({
      eventClient: client,
      eventId: 'event-1',
      investigation: second,
    });

    const [[callArg]] = dataStreamClient.create.mock.calls;
    const written: SignificantEvent = callArg.documents[0];

    expect(written.investigations).toHaveLength(2);
    expect(written.investigations![0].workflow_execution_id).toBe('exec-1');
    expect(written.investigations![1].workflow_execution_id).toBe('exec-2');
  });

  it('is idempotent: ignores when the entry is identical', async () => {
    const investigation = createInvestigation();
    const existing = createEvent({ event_id: 'event-1', investigations: [investigation] });
    const { client, dataStreamClient } = createEventClient([existing]);

    const result = await attachInvestigationToEvent({
      eventClient: client,
      eventId: 'event-1',
      investigation,
    });

    expect(result.updated).toBe(0);
    expect(result.ignored).toBe(1);
    expect(dataStreamClient.create).not.toHaveBeenCalled();
  });

  it('returns ignored when the event is not found', async () => {
    const { client, dataStreamClient } = createEventClient([]);

    const result = await attachInvestigationToEvent({
      eventClient: client,
      eventId: 'missing-event',
      investigation: createInvestigation(),
    });

    expect(result.updated).toBe(0);
    expect(result.ignored).toBe(1);
    expect(dataStreamClient.create).not.toHaveBeenCalled();
  });

  it('carries forward the previous_event_id lineage', async () => {
    const existing = createEvent({ event_id: 'event-3', previous_event_id: 'event-2' });
    const { client } = createEventClient([existing]);

    const result = await attachInvestigationToEvent({
      eventClient: client,
      eventId: 'event-3',
      investigation: createInvestigation(),
    });

    expect(result.updated).toBe(1);
    expect(result.event_id).not.toBe('event-3');
  });

  it('reconciles orphaned pending entries from cancelled runs when a new execution attaches', async () => {
    /**
     * Regression for cancel-in-progress orphan: R1 writes pending (exec-1); R2 is triggered,
     * cancelling R1 via cancel-in-progress; R1 never reaches its terminal step so exec-1 stays
     * `pending` in the array. When R2's pending attach arrives (exec-2), exec-1 must be resolved
     * to `failed` so hasPendingInvestigation stops returning true and the UI stops polling.
     */
    const orphaned = createInvestigation({ workflow_execution_id: 'exec-1', status: 'pending' });
    const existing = createEvent({ event_id: 'event-1', investigations: [orphaned] });
    const { client, dataStreamClient } = createEventClient([existing]);

    const incoming = createInvestigation({ workflow_execution_id: 'exec-2', status: 'pending' });
    const result = await attachInvestigationToEvent({
      eventClient: client,
      eventId: 'event-1',
      investigation: incoming,
    });

    expect(result.updated).toBe(1);

    const [[callArg]] = dataStreamClient.create.mock.calls;
    const written: SignificantEvent = callArg.documents[0];

    expect(written.investigations).toHaveLength(2);
    expect(written.investigations![0].workflow_execution_id).toBe('exec-1');
    expect(written.investigations![0].status).toBe('failed');
    expect(written.investigations![0].completed_at).toBeDefined();
    expect(written.investigations![1].workflow_execution_id).toBe('exec-2');
    expect(written.investigations![1].status).toBe('pending');
  });

  it('reconciles orphaned pending entries when a terminal attach arrives for a new execution', async () => {
    const orphaned = createInvestigation({ workflow_execution_id: 'exec-1', status: 'pending' });
    const existing = createEvent({ event_id: 'event-1', investigations: [orphaned] });
    const { client, dataStreamClient } = createEventClient([existing]);

    const terminal = createInvestigation({
      workflow_execution_id: 'exec-2',
      status: 'success',
      completed_at: '2026-01-01T02:00:00.000Z',
    });
    const result = await attachInvestigationToEvent({
      eventClient: client,
      eventId: 'event-1',
      investigation: terminal,
    });

    expect(result.updated).toBe(1);

    const [[callArg]] = dataStreamClient.create.mock.calls;
    const written: SignificantEvent = callArg.documents[0];

    // Both entries present; orphaned run resolved to failed, no pending remains
    expect(written.investigations).toHaveLength(2);
    expect(written.investigations![0].workflow_execution_id).toBe('exec-1');
    expect(written.investigations![0].status).toBe('failed');
    expect(written.investigations![0].completed_at).toBeDefined();
    expect(written.investigations![1].workflow_execution_id).toBe('exec-2');
    expect(written.investigations![1].status).toBe('success');
  });

  it('does not exceed the 100-entry cap: ignores a new entry when already at 100 investigations', async () => {
    const fullInvestigations = Array.from({ length: 100 }, (_, i) =>
      createInvestigation({
        workflow_execution_id: `exec-${i}`,
        status: 'success',
        completed_at: '2026-01-01T01:30:00.000Z',
      })
    );
    const existing = createEvent({ event_id: 'event-1', investigations: fullInvestigations });
    const { client, dataStreamClient } = createEventClient([existing]);

    const newInvestigation = createInvestigation({ workflow_execution_id: 'exec-100' });
    const result = await attachInvestigationToEvent({
      eventClient: client,
      eventId: 'event-1',
      investigation: newInvestigation,
    });

    expect(result.updated).toBe(0);
    expect(result.ignored).toBe(1);
    expect(dataStreamClient.create).not.toHaveBeenCalled();
  });

  it('resolves lineage: terminal attach targets the latest slug version, not the frozen caller version', async () => {
    /**
     * Regression: the investigation workflow passes the frozen inputs.context.event_id (E0) to
     * both its pending and terminal kibana.request steps. Without lineage resolution, findById(E0)
     * always returns E0, so the terminal write branches off E0 instead of chaining off the
     * pending-written E1 — producing siblings that lose prior investigation history.
     */
    const pending = createInvestigation({ workflow_execution_id: 'exec-1', status: 'pending' });
    const e0 = createEvent({ event_id: 'event-0', discovery_slug: 'slug-1' });
    const e1 = createEvent({
      event_id: 'event-1',
      discovery_slug: 'slug-1',
      previous_event_id: 'event-0',
      '@timestamp': '2026-01-01T00:01:00.000Z',
      investigations: [pending],
    });
    // findById returns only E0 (the frozen stale ref); findByDiscoverySlug returns the full lineage
    const { client, dataStreamClient } = createEventClient([e0], [e0, e1]);

    const terminal = createInvestigation({
      workflow_execution_id: 'exec-1',
      status: 'success',
      completed_at: '2026-01-01T02:00:00.000Z',
    });
    const result = await attachInvestigationToEvent({
      eventClient: client,
      eventId: 'event-0', // frozen stale reference as passed by the workflow
      investigation: terminal,
    });

    expect(result.updated).toBe(1);

    const [[callArg]] = dataStreamClient.create.mock.calls;
    const written: SignificantEvent = callArg.documents[0];

    // Must chain off E1 (the true latest), not E0 (the frozen caller reference)
    expect(written.previous_event_id).toBe('event-1');
    // Replace-by-execution-id: pending entry replaced with terminal, not duplicated
    expect(written.investigations).toHaveLength(1);
    expect(written.investigations![0].status).toBe('success');
    expect(written.investigations![0].started_at).toBe(pending.started_at);
    expect(written.investigations![0].completed_at).toBe('2026-01-01T02:00:00.000Z');
  });
});
