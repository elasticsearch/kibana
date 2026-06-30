/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FieldDefinition, Streams } from '@kbn/streams-schema';
import { getUpsertFields } from './utils';
import type { StreamEnrichmentContextType } from './types';

describe('stream_enrichment_state_machine/utils', () => {
  describe('getUpsertFields()', () => {
    it('returns typeless doc-only overrides (no type: unmapped) and removes mapping overrides', () => {
      const wiredDefinition = createWiredDefinition({
        fields: {
          foo: { type: 'keyword' },
          keep: { type: 'date' },
        },
      });

      const context = {
        definition: wiredDefinition,
        simulatorRef: {
          getSnapshot: () => ({
            context: {
              detectedSchemaFields: [
                { name: 'foo', parent: 'wired-stream', status: 'unmapped' },
                { name: 'keep', parent: 'wired-stream', status: 'mapped', type: 'date' },
              ],
              docOnlyOverrides: {
                foo: { description: 'Foo description' },
              },
            },
          }),
        },
      } as unknown as StreamEnrichmentContextType;

      const result = getUpsertFields(context);

      expect(result).toEqual({
        foo: { description: 'Foo description' },
        keep: { type: 'date' },
      });
    });

    it('works for wired stream definitions too', () => {
      const wiredDefinition = createWiredDefinition({
        fields: {
          foo: { type: 'keyword' },
        },
      });

      const context = {
        definition: wiredDefinition,
        simulatorRef: {
          getSnapshot: () => ({
            context: {
              detectedSchemaFields: [{ name: 'foo', parent: 'wired-stream', status: 'unmapped' }],
              docOnlyOverrides: {
                foo: { description: 'Foo description' },
              },
            },
          }),
        },
      } as unknown as StreamEnrichmentContextType;

      const result = getUpsertFields(context);

      expect(result).toEqual({
        foo: { description: 'Foo description' },
      });
      expect(JSON.stringify(result)).not.toContain('"type":"unmapped"');
    });
  });
});

function createWiredDefinition({
  fields,
}: {
  fields: FieldDefinition;
}): Streams.WiredStream.GetResponse {
  const privileges = {
    manage: true,
    monitor: true,
    view_index_metadata: true,
    lifecycle: true,
    simulate: true,
    text_structure: true,
    read_failure_store: true,
    manage_failure_store: true,
    create_snapshot_repository: true,
  };

  return {
    dashboards: [],
    rules: [],
    privileges,
    inherited_fields: {},
    data_stream_exists: true,
    effective_lifecycle: { dsl: { data_retention: '1d' }, from: 'ancestor' },
    effective_settings: {},
    stream: {
      type: 'wired',
      name: 'wired-stream',
      description: 'A wired stream',
      updated_at: new Date().toISOString(),
      ingest: {
        lifecycle: { dsl: { data_retention: '1d' } },
        processing: { steps: [], updated_at: new Date().toISOString() },
        settings: {},
        wired: {
          fields,
          routing: [],
        },
        failure_store: { disabled: {} },
      },
    },
    effective_failure_store: { disabled: {}, from: 'parent' },
  };
}
