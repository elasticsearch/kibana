/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Streams } from '@kbn/streams-schema';
import { StatusError } from '../../../../lib/streams/errors/status_error';
import { resolveInheritedFailureStore } from './route';

type SimulatedTemplate = Awaited<
  ReturnType<
    typeof import('../../../../lib/streams/data_streams/manage_data_streams').simulateClassicStreamTemplate
  >
>;

const queryStreamDefinition: Streams.QueryStream.Definition = {
  type: 'query',
  name: 'logs.query',
  description: '',
  updated_at: new Date().toISOString(),
  query: { view: 'view', esql: 'FROM logs' },
};

const classicStreamDefinition: Streams.ClassicStream.Definition = {
  type: 'classic',
  name: 'logs-classic',
  description: '',
  updated_at: new Date().toISOString(),
  ingest: {
    lifecycle: { inherit: {} },
    processing: { steps: [], updated_at: new Date().toISOString() },
    settings: {},
    classic: {},
    failure_store: { inherit: {} },
  },
};

const makeWiredStreamDefinition = (
  name: string,
  failureStore: Streams.WiredStream.Definition['ingest']['failure_store'] = { inherit: {} }
): Streams.WiredStream.Definition => ({
  type: 'wired',
  name,
  description: '',
  updated_at: new Date().toISOString(),
  ingest: {
    lifecycle: { inherit: {} },
    processing: { steps: [], updated_at: new Date().toISOString() },
    settings: {},
    wired: { fields: {}, routing: [] },
    failure_store: failureStore,
  },
});

const notCalled = (label: string) => async (): Promise<never> => {
  throw new Error(`${label} should not be called`);
};

const expectStatusError = async (
  promise: Promise<unknown>,
  statusCode: number,
  message: string
): Promise<void> => {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(StatusError);
  if (caught instanceof StatusError) {
    expect(caught.statusCode).toBe(statusCode);
    expect(caught.message).toBe(message);
  }
};

describe('resolveInheritedFailureStore', () => {
  describe('400 paths', () => {
    it('throws a 400 when the stream is not an ingest stream', async () => {
      await expectStatusError(
        resolveInheritedFailureStore({
          name: queryStreamDefinition.name,
          definition: queryStreamDefinition,
          getAncestors: notCalled('getAncestors'),
          getTemplate: notCalled('getTemplate'),
        }),
        400,
        'Inherited failure store is only available for ingest streams'
      );
    });

    it('throws a 400 when a classic stream has no resolvable template', async () => {
      await expectStatusError(
        resolveInheritedFailureStore({
          name: classicStreamDefinition.name,
          definition: classicStreamDefinition,
          getAncestors: notCalled('getAncestors'),
          getTemplate: async () => undefined,
        }),
        400,
        `Cannot determine template failure store for ${classicStreamDefinition.name} — the data stream may be replicated and managed by a remote cluster`
      );
    });
  });

  describe('wired streams', () => {
    it('returns disabled when no ancestor has an inheritable failure store', async () => {
      const child = makeWiredStreamDefinition('logs.parent.child');
      const ancestors = [makeWiredStreamDefinition('logs.parent', { inherit: {} })];

      const result = await resolveInheritedFailureStore({
        name: child.name,
        definition: child,
        getAncestors: async () => ancestors,
        getTemplate: notCalled('getTemplate'),
      });

      expect(result).toEqual({ failure_store: { disabled: {} } });
    });

    it('returns the inherited failure store from an ancestor', async () => {
      const child = makeWiredStreamDefinition('logs.parent.child');
      const ancestors = [
        makeWiredStreamDefinition('logs.parent', {
          lifecycle: { enabled: { data_retention: '20d' } },
        }),
      ];

      const result = await resolveInheritedFailureStore({
        name: child.name,
        definition: child,
        getAncestors: async () => ancestors,
        getTemplate: notCalled('getTemplate'),
      });

      expect(result.failure_store).toBeDefined();
    });
  });

  describe('classic streams (template-derived)', () => {
    const resolveWithTemplate = (template: SimulatedTemplate) =>
      resolveInheritedFailureStore({
        name: classicStreamDefinition.name,
        definition: classicStreamDefinition,
        getAncestors: notCalled('getAncestors'),
        getTemplate: async () => template,
      });

    it('returns disabled when the template has no failure store', async () => {
      const result = await resolveWithTemplate({} as SimulatedTemplate);
      expect(result).toEqual({ failure_store: { disabled: {} } });
    });

    it('returns a disabled lifecycle when the failure store lifecycle is explicitly disabled', async () => {
      const result = await resolveWithTemplate({
        data_stream_options: { failure_store: { enabled: true, lifecycle: { enabled: false } } },
      } as SimulatedTemplate);
      expect(result).toEqual({ failure_store: { lifecycle: { disabled: {} } } });
    });

    it('returns the explicit retention when the template defines one', async () => {
      const result = await resolveWithTemplate({
        data_stream_options: {
          failure_store: { enabled: true, lifecycle: { data_retention: '45d' } },
        },
      } as SimulatedTemplate);
      expect(result).toEqual({
        failure_store: {
          lifecycle: { enabled: { data_retention: '45d', is_default_retention: false } },
        },
      });
    });

    it('returns the default retention shape when enabled without an explicit retention', async () => {
      const result = await resolveWithTemplate({
        data_stream_options: { failure_store: { enabled: true } },
      } as SimulatedTemplate);
      expect(result).toEqual({
        failure_store: { lifecycle: { enabled: { is_default_retention: true } } },
      });
    });
  });
});
