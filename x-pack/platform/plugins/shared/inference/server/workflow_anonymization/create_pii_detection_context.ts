/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnonymizationRule } from '@kbn/inference-common';
import type {
  DetectedPiiEntity,
  PiiDetectionContext,
  PiiTextRecord,
} from './pii_detection_context';
import type { PiiRegexWorkerService } from './detection/regex_worker_service';

export const createPiiDetectionContext = ({
  regexWorker,
}: {
  regexWorker: PiiRegexWorkerService;
}): PiiDetectionContext => ({
  detectEntities: async ({ records, rules, abortSignal }) => {
    abortSignal?.throwIfAborted();

    if (hasEnabledNerRule(rules)) {
      throw new Error('NER detection is not supported by workflow-driven anonymization');
    }

    const piiRules = rules
      .filter(
        (rule): rule is Extract<AnonymizationRule, { type: 'RegExp' }> =>
          rule.enabled && rule.type === 'RegExp'
      )
      .map((rule) => ({ entityClass: rule.entityClass, pattern: rule.pattern }));

    if (piiRules.length === 0 || records.length === 0) {
      return [];
    }

    const workerRecords = records.map(({ id, text }) => ({ [id]: text }));
    const matches = await regexWorker.run({ rules: piiRules, records: workerRecords });
    abortSignal?.throwIfAborted();

    return matches.map<DetectedPiiEntity>((match) => ({
      recordId: getRecordId(records, match.recordIndex),
      start: match.start,
      end: match.end,
      value: match.matchValue,
      entityClass: match.entityClass,
    }));
  },
});

const hasEnabledNerRule = (rules: readonly AnonymizationRule[]): boolean =>
  rules.some((rule) => rule.enabled && rule.type === 'NER');

const getRecordId = (records: readonly PiiTextRecord[], recordIndex: number): string => {
  const record = records[recordIndex];
  if (!record) {
    throw new Error(`PII detector returned an invalid record index: ${recordIndex}`);
  }
  return record.id;
};
