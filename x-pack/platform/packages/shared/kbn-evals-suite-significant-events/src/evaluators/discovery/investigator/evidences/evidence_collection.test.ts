/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Discovery, Detection } from '@kbn/significant-events-schema';
import { evidenceCollectionEvaluator } from './evidence_collection';

const evaluate = (discoveries: Partial<Discovery>[]) =>
  evidenceCollectionEvaluator.evaluate({
    input: {
      episodeSuffix: 'test',
      detections: discoveries.flatMap((d) => d.detections ?? []) as Detection[],
    },
    output: { discoveries: discoveries as Discovery[], steps: [] },
    expected: {} as never,
    metadata: null,
  });

describe('evidenceCollectionEvaluator', () => {
  it('is unavailable when there are no detections', async () => {
    expect((await evaluate([{ detections: [], evidences: [] }])).score).toBeNull();
  });

  it('scores 1 when every rule has attributed evidence', async () => {
    const discoveries: Partial<Discovery>[] = [
      {
        detections: [
          { kind: 'detection', rule_uuid: 'r1' },
          { kind: 'detection', rule_uuid: 'r2' },
        ],
        evidences: [{ rule_uuid: 'r1' }, { rule_uuid: 'r2' }],
      },
    ];
    expect((await evaluate(discoveries)).score).toBe(1);
  });

  it('gives partial credit when a rule has no evidence', async () => {
    const discoveries: Partial<Discovery>[] = [
      {
        detections: [
          { kind: 'detection', rule_uuid: 'r1', rule_name: 'A' },
          { kind: 'detection', rule_uuid: 'r2', rule_name: 'B' },
        ],
        evidences: [{ rule_uuid: 'r1' }],
      },
    ];
    expect((await evaluate(discoveries)).score).toBe(0.5);
  });

  it('scores 0 when a discovery emits detections but no evidence', async () => {
    const discoveries: Partial<Discovery>[] = [
      { detections: [{ kind: 'detection', rule_uuid: 'r1' }], evidences: [] },
    ];
    expect((await evaluate(discoveries)).score).toBe(0);
  });
});
