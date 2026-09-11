/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DetectedPiiEntity, PiiTextRecord } from '@kbn/inference-plugin/server';
import {
  createServerStepDefinition,
  type WorkflowExecutionCapabilities,
} from '@kbn/workflows-extensions/server';
import {
  aiPiiCommonDefinition,
  type AiPiiInput,
  type AnonymizedCompletion,
  type TokenMap,
} from '../../common/workflow_anonymization';
import { getPiiTokenizationContext } from './capabilities';
import { createCompletionTextRecords } from './message_records';
import { piiReplacementsCounter } from './anonymization_metrics';

interface IndexedEntity extends DetectedPiiEntity {
  readonly detectionIndex: number;
}

interface PiiProtectionLogger {
  warn(message: string, meta?: object): void;
}

const validateEntity = (entity: DetectedPiiEntity, record: PiiTextRecord | undefined): void => {
  if (!record) {
    throw new Error(`PII detector returned unknown record "${entity.recordId}"`);
  }
  if (
    !Number.isInteger(entity.start) ||
    !Number.isInteger(entity.end) ||
    entity.start < 0 ||
    entity.end <= entity.start ||
    entity.end > record.text.length ||
    record.text.slice(entity.start, entity.end) !== entity.value
  ) {
    throw new Error(`PII detector returned an invalid range for record "${entity.recordId}"`);
  }
};

const applyDetectedEntities = ({
  records,
  entities,
  tokenize,
  logger,
}: {
  records: readonly PiiTextRecord[];
  entities: readonly DetectedPiiEntity[];
  tokenize: (entityClass: string, value: string) => string;
  logger: PiiProtectionLogger;
}): { values: ReadonlyMap<string, string>; tokenMap: TokenMap } => {
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const entitiesByRecord = new Map<string, IndexedEntity[]>();

  entities.forEach((entity, detectionIndex) => {
    validateEntity(entity, recordsById.get(entity.recordId));
    const recordEntities = entitiesByRecord.get(entity.recordId) ?? [];
    recordEntities.push({ ...entity, detectionIndex });
    entitiesByRecord.set(entity.recordId, recordEntities);
  });

  const nextTokenMap: TokenMap = {};
  const values = new Map<string, string>();

  records.forEach((record) => {
    const sortedEntities = [...(entitiesByRecord.get(record.id) ?? [])].sort(
      (left, right) => left.start - right.start || left.detectionIndex - right.detectionIndex
    );
    let cursor = 0;
    let output = '';

    sortedEntities.forEach((entity) => {
      if (entity.start < cursor) {
        logger.warn('PII detector returned overlapping entities; ignoring the later match', {
          recordId: entity.recordId,
          entityClass: entity.entityClass,
          start: entity.start,
          end: entity.end,
        });
        return;
      }

      const token = tokenize(entity.entityClass, entity.value);
      const existing = nextTokenMap[token];
      if (
        existing &&
        (existing.original !== entity.value || existing.entityClass !== entity.entityClass)
      ) {
        logger.warn('PII token collision detected; failing workflow protection', {
          existingEntityClass: existing.entityClass,
          detectedEntityClass: entity.entityClass,
        });
        throw new Error('PII token collision detected');
      }

      output += record.text.slice(cursor, entity.start);
      output += token;
      cursor = entity.end;
      nextTokenMap[token] = {
        original: entity.value,
        entityClass: entity.entityClass,
      };
    });

    output += record.text.slice(cursor);
    values.set(record.id, output);
  });

  return { values, tokenMap: nextTokenMap };
};

export const executePiiProtection = async ({
  input,
  capabilities,
  abortSignal,
  logger,
}: {
  input: AiPiiInput;
  capabilities: WorkflowExecutionCapabilities | undefined;
  abortSignal: AbortSignal;
  logger: PiiProtectionLogger;
}): Promise<AnonymizedCompletion> => {
  const pii = getPiiTokenizationContext(capabilities);
  const detectionRecords = createCompletionTextRecords(input);
  const entities = await pii.detectEntities({
    records: detectionRecords.records,
    rules: input.rules,
    abortSignal,
  });
  abortSignal.throwIfAborted();

  const protectedRecords = applyDetectedEntities({
    records: detectionRecords.records,
    entities,
    tokenize: pii.tokenize,
    logger,
  });

  const newTokensByClass = new Map<string, number>();
  for (const [, entry] of Object.entries(protectedRecords.tokenMap)) {
    newTokensByClass.set(entry.entityClass, (newTokensByClass.get(entry.entityClass) ?? 0) + 1);
  }
  for (const [entityClass, count] of newTokensByClass) {
    piiReplacementsCounter.add(count, { entity_class: entityClass });
  }

  return {
    ...detectionRecords.replace(protectedRecords.values),
    tokenMap: protectedRecords.tokenMap,
  };
};

export const aiPiiStepDefinition = createServerStepDefinition({
  ...aiPiiCommonDefinition,
  handler: async ({ input, capabilities, abortSignal, logger }) => {
    return {
      output: await executePiiProtection({ input, capabilities, abortSignal, logger }),
    };
  },
});
