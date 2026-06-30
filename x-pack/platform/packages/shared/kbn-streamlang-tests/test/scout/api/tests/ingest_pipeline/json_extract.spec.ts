/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/api';
import { tags } from '@kbn/scout';
import type { JsonExtractProcessor, MathProcessor, StreamlangDSL } from '@kbn/streamlang';
import { transpile } from '@kbn/streamlang/src/transpilers/ingest_pipeline';
import { streamlangApiTest as apiTest } from '../..';

/**
 * Ingest Pipeline-specific JsonExtract Processor Tests
 *
 * These tests document Ingest Pipeline-specific behaviors that differ from ES|QL:
 * - Invalid JSON causes ingestion failure (script error)
 * - Missing source field behavior with ignore_missing: true (no field added vs null)
 *
 * For tests that verify identical behavior between transpilers, see:
 * cross_compatibility/json_extract.spec.ts
 */
apiTest.describe(
  'Streamlang to Ingest Pipeline - JsonExtract Processor (Ingest Pipeline-specific)',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    apiTest(
      'should fail ingestion when JSON parsing fails (Ingest Pipeline-specific error handling)',
      async ({ testBed }) => {
        const indexName = 'streams-e2e-test-json-extract-ingest-fail';

        const streamlangDSL: StreamlangDSL = {
          steps: [
            {
              action: 'json_extract',
              field: 'message',
              extractions: [{ selector: 'user_id', target_field: 'user.id' }],
            } as JsonExtractProcessor,
          ],
        };

        const { processors } = await transpile(streamlangDSL);

        const docs = [{ message: 'not valid json' }];
        const { errors } = await testBed.ingest(indexName, docs, processors);
        expect(errors).toHaveLength(1);
      }
    );

    apiTest(
      'should not add target field when source field is missing with ignore_missing: true (Ingest Pipeline-specific)',
      async ({ testBed }) => {
        const indexName = 'streams-e2e-test-json-extract-ingest-missing';

        const streamlangDSL: StreamlangDSL = {
          steps: [
            {
              action: 'json_extract',
              field: 'nonexistent',
              extractions: [{ selector: 'user_id', target_field: 'user_id' }],
              ignore_missing: true,
            } as JsonExtractProcessor,
          ],
        };

        const { processors } = await transpile(streamlangDSL);

        const docs = [{ message: 'some_value' }];
        await testBed.ingest(indexName, docs, processors);

        const ingestedDocs = await testBed.getDocs(indexName);
        expect(ingestedDocs).toHaveLength(1);
        const source = ingestedDocs[0] as Record<string, unknown>;
        expect(source).toStrictEqual(expect.objectContaining({ message: 'some_value' }));
        expect(source.user_id).toBeUndefined();
      }
    );

    apiTest(
      'should write extracted value into a pre-existing parent object so it is readable downstream',
      async ({ testBed }) => {
        const indexName = 'streams-e2e-test-json-extract-nested-target';

        // json_extract into a nested target, then a downstream step that reads it back
        // via the flexible accessor (mirrors the customer's json_extract -> math repro
        // that previously threw a NullPointerException).
        const streamlangDSL: StreamlangDSL = {
          steps: [
            {
              action: 'json_extract',
              field: 'attributes.payload',
              extractions: [
                {
                  selector: 'duration',
                  target_field: 'attributes.app.action.duration_nano',
                  type: 'long',
                },
              ],
            } as JsonExtractProcessor,
            {
              action: 'math',
              expression: 'attributes.app.action.duration_nano + 0',
              to: 'duration_readback',
            } as MathProcessor,
          ],
        };

        const { processors } = await transpile(streamlangDSL);

        // The child-stream pipeline uses the flexible field access pattern; the bug
        // only surfaces when reads/writes go through it. `attributes` already exists
        // as a real object on the incoming document.
        const docs = [
          {
            '@timestamp': '2026-06-29T15:30:00Z',
            attributes: { payload: '{"duration": 68319744}' },
          },
        ];
        const { errors } = await testBed.ingest(indexName, docs, processors, {
          pipeline: { field_access_pattern: 'flexible' },
        });

        // No script_exception / NullPointerException from the downstream read.
        expect(errors).toHaveLength(0);

        const ingestedDocs = await testBed.getDocs(indexName);
        expect(ingestedDocs).toHaveLength(1);
        const source = ingestedDocs[0] as Record<string, unknown>;

        // The downstream `$()` read resolved the extracted value (instead of null),
        // proving it was written somewhere reachable inside `attributes`.
        expect(source.duration_readback).toBe(68319744);
        // ...and it was not stranded as a literal top-level dotted key.
        expect(source['attributes.app.action.duration_nano']).toBeUndefined();
      }
    );
  }
);
