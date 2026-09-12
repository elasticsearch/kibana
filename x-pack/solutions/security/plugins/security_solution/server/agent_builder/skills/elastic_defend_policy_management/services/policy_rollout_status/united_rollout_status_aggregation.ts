/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import { HostPolicyResponseActionStatus } from '../../../../../../common/endpoint/types';
import type { HostInfo, HostMetadata } from '../../../../../../common/endpoint/types';
import { isPolicyOutOfDate } from '../../../../../../common/endpoint/service/policy/rollout_status';
import { METADATA_UNITED_INDEX } from '../../../../../../common/endpoint/constants';
import { prefixIndexPatternsWithCcs } from '../../../../../endpoint/utils/ccs_utils';
import {
  buildUnitedRolloutStatusFilter,
  UNITED_ROLLOUT_STATUS_ASSIGNMENT_FIELD,
} from './united_rollout_status_filter';

export const POLICY_ROLLOUT_TUPLE_TERMS_SIZE = 1500;
export const POLICY_ROLLOUT_AGENT_TERMS_SIZE = 1500;
export const POLICY_ROLLOUT_MISSING_LONG = -1;

export const POLICY_ROLLOUT_REPORTED_PACKAGE_ID_FIELD = 'policy_rollout.reported_package_id';
export const POLICY_ROLLOUT_REPORTED_AGENT_REV_FIELD = 'policy_rollout.reported_agent_rev';
export const POLICY_ROLLOUT_REPORTED_PACKAGE_REV_FIELD = 'policy_rollout.reported_package_rev';
export const POLICY_ROLLOUT_APPLIED_AGENT_REV_FIELD = 'policy_rollout.applied_agent_rev';

export const POLICY_ROLLOUT_TUPLE_AGG_NAME = 'policy_rollout_tuples';
export const POLICY_ROLLOUT_AGENT_ID_AGG_NAME = 'policy_rollout_agent_ids';

const APPLIED_AGENT_POLICY_ID_SCRIPT = `
def source = params._source;
def base = null;
if (source != null && source.united != null && source.united.agent != null) {
  base = source.united.agent.policy_base_id;
}
if (base != null && base.toString().length() > 0) {
  emit(base.toString());
  return;
}
if (doc.containsKey('united.agent.policy_id') && doc['united.agent.policy_id'].size() > 0) {
  def policyId = doc['united.agent.policy_id'].value;
  if (policyId != null) {
    emit(policyId.toString().replaceAll(/#\\d+\\.\\d+$/, m -> ''));
    return;
  }
}
emit('');
`.trim();

const REPORTED_PACKAGE_ID_SCRIPT = `
if (doc.containsKey('united.endpoint.Endpoint.policy.applied.id') && doc['united.endpoint.Endpoint.policy.applied.id'].size() > 0) {
  def reportedId = doc['united.endpoint.Endpoint.policy.applied.id'].value;
  if (reportedId != null) {
    emit(reportedId.toString());
    return;
  }
}
emit('');
`.trim();

const PAINLESS_NORMALIZE_INTEGER_REVISION = `
long normalizeIntegerRevision(def value) {
  if (value == null) {
    return -1L;
  }
  if (value instanceof Number) {
    def longValue = ((Number) value).longValue();
    if (longValue < 0L || longValue > 9007199254740991L || ((Number) value).doubleValue() != longValue) {
      return -1L;
    }
    return longValue;
  }
  if (value instanceof String) {
    def text = (String) value;
    if (!(/0|[1-9][0-9]*/).matcher(text).matches()) {
      return -1L;
    }
    try {
      def parsed = Long.parseLong(text);
      if (parsed > 9007199254740991L) {
        return -1L;
      }
      return parsed;
    } catch (NumberFormatException e) {
      return -1L;
    }
  }
  return -1L;
}
`.trim();

const REPORTED_AGENT_REV_SCRIPT = `
${PAINLESS_NORMALIZE_INTEGER_REVISION}
def source = params._source;
if (source != null && source.united != null && source.united.endpoint != null && source.united.endpoint.Endpoint != null && source.united.endpoint.Endpoint.policy != null && source.united.endpoint.Endpoint.policy.applied != null && source.united.endpoint.Endpoint.policy.applied.version != null) {
  emit(normalizeIntegerRevision(source.united.endpoint.Endpoint.policy.applied.version));
} else {
  emit(-1L);
}
`.trim();

const REPORTED_PACKAGE_REV_SCRIPT = `
${PAINLESS_NORMALIZE_INTEGER_REVISION}
def source = params._source;
if (source != null && source.united != null && source.united.endpoint != null && source.united.endpoint.Endpoint != null && source.united.endpoint.Endpoint.policy != null && source.united.endpoint.Endpoint.policy.applied != null && source.united.endpoint.Endpoint.policy.applied.endpoint_policy_version != null) {
  emit(normalizeIntegerRevision(source.united.endpoint.Endpoint.policy.applied.endpoint_policy_version));
} else {
  emit(-1L);
}
`.trim();

const APPLIED_AGENT_REV_SCRIPT = `
${PAINLESS_NORMALIZE_INTEGER_REVISION}
if (doc.containsKey('united.agent.policy_revision_idx') && doc['united.agent.policy_revision_idx'].size() > 0) {
  def revision = doc['united.agent.policy_revision_idx'].value;
  if (revision != null) {
    emit(normalizeIntegerRevision(revision));
    return;
  }
}
emit(-1L);
`.trim();

export const POLICY_ROLLOUT_UNITED_RUNTIME_MAPPINGS: estypes.MappingRuntimeFields = {
  [UNITED_ROLLOUT_STATUS_ASSIGNMENT_FIELD]: {
    type: 'keyword',
    script: {
      lang: 'painless',
      source: APPLIED_AGENT_POLICY_ID_SCRIPT,
    },
  },
  [POLICY_ROLLOUT_REPORTED_PACKAGE_ID_FIELD]: {
    type: 'keyword',
    script: {
      lang: 'painless',
      source: REPORTED_PACKAGE_ID_SCRIPT,
    },
  },
  [POLICY_ROLLOUT_REPORTED_AGENT_REV_FIELD]: {
    type: 'long',
    script: {
      lang: 'painless',
      source: REPORTED_AGENT_REV_SCRIPT,
    },
  },
  [POLICY_ROLLOUT_REPORTED_PACKAGE_REV_FIELD]: {
    type: 'long',
    script: {
      lang: 'painless',
      source: REPORTED_PACKAGE_REV_SCRIPT,
    },
  },
  [POLICY_ROLLOUT_APPLIED_AGENT_REV_FIELD]: {
    type: 'long',
    script: {
      lang: 'painless',
      source: APPLIED_AGENT_REV_SCRIPT,
    },
  },
};

export interface UnitedRolloutStatusSearchArgs {
  agentPolicyIds: string[];
  ccsEnabled: boolean;
  cpsSpaceId?: string;
}

export function buildUnitedRolloutStatusSearch({
  agentPolicyIds,
  ccsEnabled,
  cpsSpaceId,
}: UnitedRolloutStatusSearchArgs): estypes.SearchRequest {
  return {
    index: prefixIndexPatternsWithCcs(METADATA_UNITED_INDEX, ccsEnabled && !cpsSpaceId),
    from: 0,
    size: 0,
    track_total_hits: false,
    query: buildUnitedRolloutStatusFilter(agentPolicyIds),
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
  };
}

export interface UnitedRolloutEvaluation {
  outOfDateHosts: number;
  classifiedHosts: number;
  undeterminedHosts: number;
  overflowHosts: number;
  agentIds: string[];
  agentOverflow: number;
}

type UnitedTupleClassification = 'out_of_date' | 'in_date' | 'undetermined';

const EMPTY_UNITED_EVALUATION: UnitedRolloutEvaluation = {
  outOfDateHosts: 0,
  classifiedHosts: 0,
  undeterminedHosts: 0,
  overflowHosts: 0,
  agentIds: [],
  agentOverflow: 0,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const asString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
};

const isMissingRevisionSentinel = (value: number): boolean => value === POLICY_ROLLOUT_MISSING_LONG;

const longOrUndefined = (value: number): number | undefined =>
  isMissingRevisionSentinel(value) ? undefined : value;

const readSumOtherDocCount = (aggregation: unknown): number => {
  if (!isRecord(aggregation)) {
    return 0;
  }
  return asFiniteNumber(aggregation.sum_other_doc_count) ?? 0;
};

const readBuckets = (aggregation: unknown): unknown[] => {
  if (!isRecord(aggregation) || !Array.isArray(aggregation.buckets)) {
    return [];
  }
  return aggregation.buckets;
};

const asNonnegativeDocCount = (value: unknown): number | undefined => {
  const count = asFiniteNumber(value);
  if (count === undefined || count < 0) {
    return undefined;
  }
  return count;
};

const buildReportedPolicy = (
  reportedPackageId: string,
  reportedAgentRev: number,
  reportedPackageRev: number
): HostMetadata['Endpoint']['policy']['applied'] => {
  const version = longOrUndefined(reportedAgentRev);
  const endpointPolicyVersion = longOrUndefined(reportedPackageRev);
  return {
    id: reportedPackageId,
    status: HostPolicyResponseActionStatus.success,
    name: '',
    ...(version !== undefined ? { version } : {}),
    ...(endpointPolicyVersion !== undefined
      ? { endpoint_policy_version: endpointPolicyVersion }
      : {}),
  } as HostMetadata['Endpoint']['policy']['applied'];
};

interface ParsedTupleBucket {
  appliedAgentPolicyId: string;
  reportedPackageId: string;
  reportedAgentRev: number;
  reportedPackageRev: number;
  appliedAgentRev: number;
  docCount: number;
}

const parseTupleBucket = (bucket: unknown): ParsedTupleBucket | undefined => {
  if (!isRecord(bucket) || !Array.isArray(bucket.key) || bucket.key.length !== 5) {
    return undefined;
  }

  const appliedAgentPolicyId = asString(bucket.key[0]);
  const reportedPackageId = asString(bucket.key[1]);
  const reportedAgentRev = asFiniteNumber(bucket.key[2]);
  const reportedPackageRev = asFiniteNumber(bucket.key[3]);
  const appliedAgentRev = asFiniteNumber(bucket.key[4]);
  const docCount = asFiniteNumber(bucket.doc_count);

  if (
    appliedAgentPolicyId === undefined ||
    reportedPackageId === undefined ||
    reportedAgentRev === undefined ||
    reportedPackageRev === undefined ||
    appliedAgentRev === undefined ||
    docCount === undefined
  ) {
    return undefined;
  }

  return {
    appliedAgentPolicyId,
    reportedPackageId,
    reportedAgentRev,
    reportedPackageRev,
    appliedAgentRev,
    docCount,
  };
};

const parseAgentId = (bucket: unknown): string | undefined => {
  if (!isRecord(bucket)) {
    return undefined;
  }
  const agentId = asString(bucket.key);
  return agentId !== undefined && agentId !== '' ? agentId : undefined;
};

const classifyUnitedTuple = ({
  bucket,
  packagePolicy,
  configuredByAgentPolicyId,
}: {
  bucket: ParsedTupleBucket;
  packagePolicy: { id: string; revision: number };
  configuredByAgentPolicyId: Readonly<Record<string, { id: string; revision: number }>>;
}): UnitedTupleClassification => {
  if (bucket.reportedPackageId === '') {
    return 'undetermined';
  }

  const configured = configuredByAgentPolicyId[bucket.appliedAgentPolicyId];
  if (configured === undefined) {
    return 'undetermined';
  }

  if (
    isMissingRevisionSentinel(bucket.appliedAgentRev) ||
    isMissingRevisionSentinel(bucket.reportedAgentRev) ||
    isMissingRevisionSentinel(bucket.reportedPackageRev)
  ) {
    return 'undetermined';
  }

  const current: NonNullable<HostInfo['policy_info']> = {
    endpoint: { id: packagePolicy.id, revision: packagePolicy.revision },
    agent: {
      applied: {
        id: bucket.appliedAgentPolicyId,
        revision: bucket.appliedAgentRev,
      },
      configured,
    },
  };

  return isPolicyOutOfDate(
    buildReportedPolicy(
      bucket.reportedPackageId,
      bucket.reportedAgentRev,
      bucket.reportedPackageRev
    ),
    current
  )
    ? 'out_of_date'
    : 'in_date';
};

export function evaluateUnitedOutOfDate({
  aggregations,
  packagePolicy,
  configuredByAgentPolicyId,
}: {
  aggregations: unknown;
  packagePolicy: { id: string; revision: number };
  configuredByAgentPolicyId: Readonly<Record<string, { id: string; revision: number }>>;
}): UnitedRolloutEvaluation {
  if (!isRecord(aggregations)) {
    return { ...EMPTY_UNITED_EVALUATION };
  }

  const tupleAggregation = aggregations[POLICY_ROLLOUT_TUPLE_AGG_NAME];
  const agentAggregation = aggregations[POLICY_ROLLOUT_AGENT_ID_AGG_NAME];

  let outOfDateHosts = 0;
  let classifiedHosts = 0;
  let undeterminedHosts = 0;

  for (const rawBucket of readBuckets(tupleAggregation)) {
    const bucket = parseTupleBucket(rawBucket);
    if (bucket !== undefined) {
      const classification = classifyUnitedTuple({
        bucket,
        packagePolicy,
        configuredByAgentPolicyId,
      });

      if (classification === 'undetermined') {
        undeterminedHosts += bucket.docCount;
      } else {
        classifiedHosts += bucket.docCount;
        if (classification === 'out_of_date') {
          outOfDateHosts += bucket.docCount;
        }
      }
    } else if (isRecord(rawBucket) && Array.isArray(rawBucket.key)) {
      const undeterminedDocCount = asNonnegativeDocCount(rawBucket.doc_count);
      if (undeterminedDocCount !== undefined) {
        undeterminedHosts += undeterminedDocCount;
      }
    }
  }

  return {
    outOfDateHosts,
    classifiedHosts,
    undeterminedHosts,
    overflowHosts: readSumOtherDocCount(tupleAggregation),
    agentIds: readBuckets(agentAggregation)
      .map(parseAgentId)
      .filter((agentId): agentId is string => agentId !== undefined),
    agentOverflow: readSumOtherDocCount(agentAggregation),
  };
}
