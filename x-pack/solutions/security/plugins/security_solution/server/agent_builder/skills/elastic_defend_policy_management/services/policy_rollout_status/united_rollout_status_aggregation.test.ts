/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { METADATA_UNITED_INDEX } from '../../../../../../common/endpoint/constants';
import {
  buildUnitedRolloutStatusFilter,
  UNITED_ROLLOUT_STATUS_ASSIGNMENT_FIELD,
} from './united_rollout_status_filter';
import {
  POLICY_ROLLOUT_AGENT_ID_AGG_NAME,
  POLICY_ROLLOUT_AGENT_TERMS_SIZE,
  POLICY_ROLLOUT_APPLIED_AGENT_REV_FIELD,
  POLICY_ROLLOUT_MISSING_LONG,
  POLICY_ROLLOUT_REPORTED_AGENT_REV_FIELD,
  POLICY_ROLLOUT_REPORTED_PACKAGE_ID_FIELD,
  POLICY_ROLLOUT_REPORTED_PACKAGE_REV_FIELD,
  POLICY_ROLLOUT_TUPLE_AGG_NAME,
  POLICY_ROLLOUT_TUPLE_TERMS_SIZE,
  POLICY_ROLLOUT_UNITED_RUNTIME_MAPPINGS,
  buildUnitedRolloutStatusSearch,
  evaluateUnitedOutOfDate,
} from './united_rollout_status_aggregation';

const PACKAGE_POLICY = { id: 'pkg', revision: 3 };
const CONFIGURED_BY_AGENT_POLICY_ID = {
  base: { id: 'base', revision: 5 },
};

const runtimeScriptSource = (fieldName: string): string => {
  const mapping = POLICY_ROLLOUT_UNITED_RUNTIME_MAPPINGS[fieldName];
  const script = mapping && 'script' in mapping ? mapping.script : undefined;
  if (typeof script === 'string') {
    return script;
  }
  if (
    typeof script === 'object' &&
    script !== null &&
    'source' in script &&
    typeof script.source === 'string'
  ) {
    return script.source;
  }
  throw new Error(`missing painless source for ${fieldName}`);
};

describe('buildUnitedRolloutStatusSearch', () => {
  const search = buildUnitedRolloutStatusSearch({
    agentPolicyIds: ['base'],
    ccsEnabled: false,
  });

  it('serializes a size-0 united search with five runtime keys and sibling terms', () => {
    expect(search).toEqual({
      index: METADATA_UNITED_INDEX,
      from: 0,
      size: 0,
      track_total_hits: false,
      query: buildUnitedRolloutStatusFilter(['base']),
      runtime_mappings: POLICY_ROLLOUT_UNITED_RUNTIME_MAPPINGS,
      aggregations: {
        [POLICY_ROLLOUT_TUPLE_AGG_NAME]: {
          multi_terms: {
            size: POLICY_ROLLOUT_TUPLE_TERMS_SIZE,
            terms: [
              { field: UNITED_ROLLOUT_STATUS_ASSIGNMENT_FIELD },
              { field: POLICY_ROLLOUT_REPORTED_PACKAGE_ID_FIELD },
              { field: POLICY_ROLLOUT_REPORTED_AGENT_REV_FIELD },
              { field: POLICY_ROLLOUT_REPORTED_PACKAGE_REV_FIELD },
              { field: POLICY_ROLLOUT_APPLIED_AGENT_REV_FIELD },
            ],
          },
        },
        [POLICY_ROLLOUT_AGENT_ID_AGG_NAME]: {
          terms: {
            field: 'united.endpoint.agent.id',
            size: POLICY_ROLLOUT_AGENT_TERMS_SIZE,
          },
        },
      },
    });
    expect(POLICY_ROLLOUT_TUPLE_TERMS_SIZE).toBe(1500);
    expect(POLICY_ROLLOUT_AGENT_TERMS_SIZE).toBe(1500);
  });

  it('keeps cpsSpaceId off the bool and only uses cpsSpaceId for CCS index pairing', () => {
    const ccsOnly = buildUnitedRolloutStatusSearch({
      agentPolicyIds: ['base'],
      ccsEnabled: true,
    });
    const cpsAndCcs = buildUnitedRolloutStatusSearch({
      agentPolicyIds: ['base'],
      ccsEnabled: true,
      cpsSpaceId: 'space-b',
    });
    const cpsOnly = buildUnitedRolloutStatusSearch({
      agentPolicyIds: ['base'],
      ccsEnabled: false,
      cpsSpaceId: 'space-b',
    });

    expect(ccsOnly.index).toBe(`${METADATA_UNITED_INDEX},*:${METADATA_UNITED_INDEX}`);
    expect(cpsAndCcs.index).toBe(METADATA_UNITED_INDEX);
    expect(cpsOnly.index).toBe(METADATA_UNITED_INDEX);
    expect(ccsOnly.query).toEqual(buildUnitedRolloutStatusFilter(['base']));
    expect(cpsAndCcs.query).toEqual(buildUnitedRolloutStatusFilter(['base']));
    expect(JSON.stringify(cpsAndCcs.query)).not.toContain('united.agent.namespaces');
  });

  it('emits sentinels for every runtime key and never queries unmapped policy_base_id', () => {
    const assignmentScript = runtimeScriptSource(UNITED_ROLLOUT_STATUS_ASSIGNMENT_FIELD);
    const reportedIdScript = runtimeScriptSource(POLICY_ROLLOUT_REPORTED_PACKAGE_ID_FIELD);
    const reportedAgentRevScript = runtimeScriptSource(POLICY_ROLLOUT_REPORTED_AGENT_REV_FIELD);
    const reportedPackageRevScript = runtimeScriptSource(POLICY_ROLLOUT_REPORTED_PACKAGE_REV_FIELD);
    const appliedAgentRevScript = runtimeScriptSource(POLICY_ROLLOUT_APPLIED_AGENT_REV_FIELD);
    const serializedQuery = JSON.stringify(search.query);

    expect(assignmentScript).toContain('params._source');
    expect(assignmentScript).toContain('policy_base_id');
    expect(assignmentScript).toContain("replaceAll(/#\\d+\\.\\d+$/, m -> '')");
    expect(assignmentScript).toContain("emit('')");
    expect(reportedIdScript).toContain('united.endpoint.Endpoint.policy.applied.id');
    expect(reportedIdScript).toContain("emit('')");
    expect(reportedAgentRevScript).toContain('params._source');
    expect(reportedAgentRevScript).toContain('applied.version');
    expect(reportedAgentRevScript).toContain('emit(-1L)');
    expect(reportedPackageRevScript).toContain('endpoint_policy_version');
    expect(reportedPackageRevScript).toContain('emit(-1L)');
    expect(appliedAgentRevScript).toContain('united.agent.policy_revision_idx');
    expect(appliedAgentRevScript).toContain('emit(-1L)');
    expect(appliedAgentRevScript).not.toContain("doc['united.agent.policy_revision']");
    expect(serializedQuery).not.toContain('applied.id');
    expect(serializedQuery).not.toContain('united.agent.policy_base_id');
    expect(serializedQuery).not.toContain('united.agent.policy_id');
  });

  it('strips only a trailing #major.minor suffix from the assignment policy id', () => {
    const assignmentScript = runtimeScriptSource(UNITED_ROLLOUT_STATUS_ASSIGNMENT_FIELD);
    const patternStart = assignmentScript.indexOf('replaceAll(/') + 'replaceAll(/'.length;
    const patternEnd = assignmentScript.indexOf("/, m -> '')", patternStart);
    const suffixPattern = new RegExp(assignmentScript.slice(patternStart, patternEnd));

    expect(patternEnd).toBeGreaterThan(patternStart);
    expect('policy-id#1.0'.replace(suffixPattern, '')).toBe('policy-id');
    expect('eval-agent-policy-id'.replace(suffixPattern, '')).toBe('eval-agent-policy-id');
    expect('policy#123'.replace(suffixPattern, '')).toBe('policy#123');
  });

  it('encodes the integer accept-set so unparseable revisions take the missing sentinel instead of throwing', () => {
    const helper = runtimeScriptSource(POLICY_ROLLOUT_REPORTED_AGENT_REV_FIELD).slice(
      0,
      runtimeScriptSource(POLICY_ROLLOUT_REPORTED_AGENT_REV_FIELD).indexOf(
        '\ndef source = params._source'
      )
    );

    expect(helper).toContain('if (value == null)');
    expect(helper).toContain('instanceof Number');
    expect(helper).toContain('longValue()');
    expect(helper).toContain('doubleValue()');
    expect(helper).toContain('instanceof String');
    expect(helper).toContain('/0|[1-9][0-9]*/');
    expect(helper).toContain('9007199254740991');
    expect(helper).not.toContain('.trim()');
    expect(helper).toContain('Long.parseLong(text)');
    expect(helper).toContain('catch (NumberFormatException e)');
    expect(helper.indexOf('instanceof Number')).toBeLessThan(helper.indexOf('Long.parseLong'));
    expect(helper.indexOf('longValue()')).toBeLessThan(helper.indexOf('Long.parseLong'));
    expect(helper).not.toContain('(long)');
    expect(helper).toContain('return -1L;');
  });
});

describe('evaluateUnitedOutOfDate', () => {
  const evaluate = (
    aggregations: unknown,
    configuredByAgentPolicyId: Readonly<
      Record<string, { id: string; revision: number }>
    > = CONFIGURED_BY_AGENT_POLICY_ID
  ) =>
    evaluateUnitedOutOfDate({
      aggregations,
      packagePolicy: PACKAGE_POLICY,
      configuredByAgentPolicyId,
    });

  it('returns zeros for missing aggregations (index-missing shape)', () => {
    expect(evaluate(undefined)).toEqual({
      outOfDateHosts: 0,
      classifiedHosts: 0,
      undeterminedHosts: 0,
      overflowHosts: 0,
      agentIds: [],
      agentOverflow: 0,
    });
    expect(evaluate(null)).toEqual({
      outOfDateHosts: 0,
      classifiedHosts: 0,
      undeterminedHosts: 0,
      overflowHosts: 0,
      agentIds: [],
      agentOverflow: 0,
    });
    expect(evaluate({})).toEqual({
      outOfDateHosts: 0,
      classifiedHosts: 0,
      undeterminedHosts: 0,
      overflowHosts: 0,
      agentIds: [],
      agentOverflow: 0,
    });
  });

  it('weights in-date and out-of-date tuples separately and keeps overflow unclassified', () => {
    const inDateTuples = Array.from({ length: 8 }, (_, index) => ({
      key: [`base-${index}`, PACKAGE_POLICY.id, 5, 3, 5],
      doc_count: 100,
    }));
    const configured = Object.fromEntries(
      inDateTuples.map((bucket) => [bucket.key[0], { id: String(bucket.key[0]), revision: 5 }])
    );
    const result = evaluate(
      {
        [POLICY_ROLLOUT_TUPLE_AGG_NAME]: {
          buckets: [
            ...inDateTuples,
            { key: ['base-0', 'stale-pkg', 5, 3, 5], doc_count: 5 },
            { key: ['base-1', PACKAGE_POLICY.id, 1, 3, 5], doc_count: 5 },
          ],
          sum_other_doc_count: 20,
        },
        [POLICY_ROLLOUT_AGENT_ID_AGG_NAME]: {
          buckets: [{ key: 'agent-a', doc_count: 1 }],
          sum_other_doc_count: 7,
        },
      },
      configured
    );

    expect(result).toEqual({
      outOfDateHosts: 10,
      classifiedHosts: 810,
      undeterminedHosts: 0,
      overflowHosts: 20,
      agentIds: ['agent-a'],
      agentOverflow: 7,
    });
  });

  it('treats a missing reported agent-revision sentinel as undetermined when id is present', () => {
    const result = evaluate({
      [POLICY_ROLLOUT_TUPLE_AGG_NAME]: {
        buckets: [
          {
            key: ['base', PACKAGE_POLICY.id, POLICY_ROLLOUT_MISSING_LONG, 3, 5],
            doc_count: 4,
          },
        ],
        sum_other_doc_count: 0,
      },
    });

    expect(result).toEqual({
      outOfDateHosts: 0,
      classifiedHosts: 0,
      undeterminedHosts: 4,
      overflowHosts: 0,
      agentIds: [],
      agentOverflow: 0,
    });
  });

  it('does not treat missing revision sentinels as matching configured revision 0', () => {
    const result = evaluateUnitedOutOfDate({
      aggregations: {
        [POLICY_ROLLOUT_TUPLE_AGG_NAME]: {
          buckets: [
            {
              key: [
                'base',
                PACKAGE_POLICY.id,
                POLICY_ROLLOUT_MISSING_LONG,
                POLICY_ROLLOUT_MISSING_LONG,
                POLICY_ROLLOUT_MISSING_LONG,
              ],
              doc_count: 2,
            },
          ],
        },
      },
      packagePolicy: { id: PACKAGE_POLICY.id, revision: 0 },
      configuredByAgentPolicyId: { base: { id: 'base', revision: 0 } },
    });

    expect(result.outOfDateHosts).toBe(0);
    expect(result.classifiedHosts).toBe(0);
    expect(result.undeterminedHosts).toBe(2);
  });

  it('classifies complete evidence at revision 0 as in-date', () => {
    const result = evaluateUnitedOutOfDate({
      aggregations: {
        [POLICY_ROLLOUT_TUPLE_AGG_NAME]: {
          buckets: [{ key: ['base', PACKAGE_POLICY.id, 0, 0, 0], doc_count: 2 }],
        },
      },
      packagePolicy: { id: PACKAGE_POLICY.id, revision: 0 },
      configuredByAgentPolicyId: { base: { id: 'base', revision: 0 } },
    });

    expect(result.outOfDateHosts).toBe(0);
    expect(result.classifiedHosts).toBe(2);
    expect(result.undeterminedHosts).toBe(0);
  });

  it('treats an absent reported package id as undetermined, not in-date', () => {
    const result = evaluate({
      [POLICY_ROLLOUT_TUPLE_AGG_NAME]: {
        buckets: [{ key: ['base', '', 5, 3, 5], doc_count: 9 }],
      },
    });

    expect(result).toEqual({
      outOfDateHosts: 0,
      classifiedHosts: 0,
      undeterminedHosts: 9,
      overflowHosts: 0,
      agentIds: [],
      agentOverflow: 0,
    });
  });

  it('treats a configured lookup miss as undetermined when reported id is present', () => {
    const result = evaluate({
      [POLICY_ROLLOUT_TUPLE_AGG_NAME]: {
        buckets: [{ key: ['unknown', PACKAGE_POLICY.id, 5, 3, 5], doc_count: 3 }],
      },
    });

    expect(result.outOfDateHosts).toBe(0);
    expect(result.classifiedHosts).toBe(0);
    expect(result.undeterminedHosts).toBe(3);
  });

  it('counts a malformed tuple key with a usable doc_count as undetermined and skips unusable buckets', () => {
    const result = evaluate({
      [POLICY_ROLLOUT_TUPLE_AGG_NAME]: {
        buckets: [
          { key: ['base', PACKAGE_POLICY.id, 5], doc_count: 2 },
          { key: ['base', PACKAGE_POLICY.id, 5, 3, 5] },
          'not-a-bucket',
          { key: ['base', PACKAGE_POLICY.id, 5, 3, 5], doc_count: 6 },
        ],
        sum_other_doc_count: 11,
      },
      [POLICY_ROLLOUT_AGENT_ID_AGG_NAME]: {
        buckets: [{ key: 'agent-1', doc_count: 1 }, { doc_count: 1 }, { key: '', doc_count: 1 }],
        sum_other_doc_count: 4,
      },
    });

    expect(result).toEqual({
      outOfDateHosts: 0,
      classifiedHosts: 6,
      undeterminedHosts: 2,
      overflowHosts: 11,
      agentIds: ['agent-1'],
      agentOverflow: 4,
    });
  });

  it('does not fabricate a host count when a malformed tuple bucket has no usable doc_count', () => {
    const result = evaluate({
      [POLICY_ROLLOUT_TUPLE_AGG_NAME]: {
        buckets: [
          { key: ['base', PACKAGE_POLICY.id, 5], doc_count: Number.NaN },
          { key: ['base', PACKAGE_POLICY.id, 5], doc_count: -3 },
        ],
        sum_other_doc_count: 11,
      },
    });

    expect(result).toEqual({
      outOfDateHosts: 0,
      classifiedHosts: 0,
      undeterminedHosts: 0,
      overflowHosts: 11,
      agentIds: [],
      agentOverflow: 0,
    });
  });

  it('keeps tuple overflow and agent overflow mathematically distinct', () => {
    const result = evaluate({
      [POLICY_ROLLOUT_TUPLE_AGG_NAME]: {
        buckets: [{ key: ['base', PACKAGE_POLICY.id, 5, 3, 5], doc_count: 1 }],
        sum_other_doc_count: 20,
      },
      [POLICY_ROLLOUT_AGENT_ID_AGG_NAME]: {
        buckets: [],
        sum_other_doc_count: 20,
      },
    });

    expect(result.overflowHosts).toBe(20);
    expect(result.agentOverflow).toBe(20);
    expect(result.classifiedHosts + result.undeterminedHosts).toBe(1);
    expect(result.outOfDateHosts + result.undeterminedHosts).not.toBe(
      result.overflowHosts + result.classifiedHosts
    );
  });

  it('keeps undetermined hosts out of both determinate directions and off overflow', () => {
    const result = evaluate({
      [POLICY_ROLLOUT_TUPLE_AGG_NAME]: {
        buckets: [
          { key: ['base', PACKAGE_POLICY.id, 5, 3, 5], doc_count: 8 },
          { key: ['base', 'stale-pkg', 5, 3, 5], doc_count: 2 },
          { key: ['base', '', 5, 3, 5], doc_count: 4 },
        ],
        sum_other_doc_count: 20,
      },
    });

    expect(result.outOfDateHosts).toBe(2);
    expect(result.classifiedHosts).toBe(10);
    expect(result.undeterminedHosts).toBe(4);
    expect(result.overflowHosts).toBe(20);
  });
});
