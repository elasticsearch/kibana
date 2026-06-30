/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttackDiscovery } from '@kbn/elastic-assistant-common';
import {
  createAlertIdGroundingEvaluator,
  ALERT_ID_GROUNDING_EVALUATOR_NAME,
} from './alert_id_grounding_evaluator';
import type { AnonymizedAlert, AttackDiscoveryTaskOutput } from '../types';

const alert = (id: string, includeIdLine = true): AnonymizedAlert => ({
  pageContent: [includeIdLine ? `_id,${id}` : '', 'host.name,host-1', `message,alert ${id}`]
    .filter(Boolean)
    .join('\n'),
  metadata: {},
});

const insight = (alertIds: string[]): AttackDiscovery =>
  ({
    title: 'x',
    summaryMarkdown: 'x',
    detailsMarkdown: 'x',
    alertIds,
  } as AttackDiscovery);

const params = (
  anonymizedAlerts: AnonymizedAlert[],
  insights: AttackDiscoveryTaskOutput['insights']
) => ({
  input: { mode: 'bundledAlerts' as const, anonymizedAlerts },
  output: { insights },
  expected: { attackDiscoveries: [] },
  metadata: {},
});

describe('createAlertIdGroundingEvaluator', () => {
  it('has the expected name and CODE kind', () => {
    const evaluator = createAlertIdGroundingEvaluator();
    expect(evaluator.name).toBe(ALERT_ID_GROUNDING_EVALUATOR_NAME);
    expect(evaluator.kind).toBe('CODE');
  });

  it('scores 1.0 when every cited alert ID exists in the input', async () => {
    const evaluator = createAlertIdGroundingEvaluator();
    const result = await evaluator.evaluate(
      params([alert('a1'), alert('a2')], [insight(['a1', 'a2'])])
    );
    expect(result.score).toBe(1);
    expect(result.label).toBe('grounded');
  });

  it('scores the grounded fraction when some IDs are hallucinated', async () => {
    const evaluator = createAlertIdGroundingEvaluator();
    const result = await evaluator.evaluate(
      params([alert('a1'), alert('a2')], [insight(['a1', 'ghost-1', 'a2', 'ghost-2'])])
    );
    expect(result.score).toBe(0.5);
    expect(result.label).toBe('ungrounded');
    expect(result.metadata?.ungroundedIds).toEqual(['ghost-1', 'ghost-2']);
  });

  it('scores 0 when every cited ID is hallucinated', async () => {
    const evaluator = createAlertIdGroundingEvaluator();
    const result = await evaluator.evaluate(params([alert('a1')], [insight(['nope'])]));
    expect(result.score).toBe(0);
    expect(result.label).toBe('ungrounded');
  });

  it('aggregates cited IDs across multiple insights', async () => {
    const evaluator = createAlertIdGroundingEvaluator();
    const result = await evaluator.evaluate(
      params([alert('a1'), alert('a2')], [insight(['a1']), insight(['a2', 'ghost'])])
    );
    expect(result.metadata?.citedCount).toBe(3);
    expect(result.metadata?.groundedCount).toBe(2);
  });

  it('sources IDs only from the pageContent _id line, ignoring metadata._id', async () => {
    const evaluator = createAlertIdGroundingEvaluator();
    const alertWithMetadataId: AnonymizedAlert = {
      pageContent: '_id,page-1\nhost.name,host-1',
      metadata: { _id: 'meta-1' },
    };
    // page-1 (from pageContent) is grounded; meta-1 (metadata only) is not in the set.
    const grounded = await evaluator.evaluate(params([alertWithMetadataId], [insight(['page-1'])]));
    expect(grounded.score).toBe(1);
    const ungrounded = await evaluator.evaluate(
      params([alertWithMetadataId], [insight(['meta-1'])])
    );
    expect(ungrounded.score).toBe(0);
  });

  it('returns N/A when the input carries no inline alert set (e.g. searchAlerts mode)', async () => {
    const evaluator = createAlertIdGroundingEvaluator();
    const result = await evaluator.evaluate({
      input: { mode: 'searchAlerts' as const },
      output: { insights: [insight(['anything'])] },
      expected: { attackDiscoveries: [] },
      metadata: {},
    });
    expect(result.score).toBeNull();
    expect(result.label).toBe('N/A');
  });

  it('treats an empty (but present) alert set as groundable — cited IDs are hallucinated', async () => {
    const evaluator = createAlertIdGroundingEvaluator();
    const result = await evaluator.evaluate(params([], [insight(['ghost'])]));
    expect(result.score).toBe(0);
    expect(result.label).toBe('ungrounded');
  });

  it('returns scoreOnEmpty (default 1) when no alert IDs are cited', async () => {
    const evaluator = createAlertIdGroundingEvaluator();
    const result = await evaluator.evaluate(params([alert('a1')], [insight([])]));
    expect(result.score).toBe(1);
    expect(result.label).toBe('no-alert-ids');
  });

  it('honors a custom scoreOnEmpty', async () => {
    const evaluator = createAlertIdGroundingEvaluator({ scoreOnEmpty: 0 });
    const result = await evaluator.evaluate(params([alert('a1')], []));
    expect(result.score).toBe(0);
    expect(result.label).toBe('no-alert-ids');
  });

  it('scores 0 with missing_insights when insights is null', async () => {
    const evaluator = createAlertIdGroundingEvaluator();
    const result = await evaluator.evaluate(params([alert('a1')], null));
    expect(result.score).toBe(0);
    expect(result.label).toBe('missing_insights');
  });
});
