/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowDetailDto } from '@kbn/workflows';
import { pickWorkflowDocumentVersion } from '@kbn/workflows';
import type { WorkflowPartialDetailDto } from '@kbn/workflows/types/v1';

import type { WorkflowProperties } from '../../storage/workflow_storage';

/**
 * Transforms a storage document (ES _id + _source) into a public WorkflowDetailDto.
 * Throws if either id or source is undefined.
 */
export const transformStorageDocumentToWorkflowDto = (
  id: string | undefined,
  source: WorkflowProperties | undefined
): WorkflowDetailDto => {
  if (!id || !source) {
    throw new Error('Invalid document, id or source is undefined');
  }
  return {
    id,
    name: source.name,
    description: source.description,
    enabled: source.enabled,
    managed: source.managed,
    managedBy: source.managedBy,
    definitionHash: source.definitionHash,
    originManagedWorkflowId: source.originManagedWorkflowId,
    managedVersion: source.managedVersion,
    lifecycle: source.lifecycle,
    yaml: source.yaml,
    definition: source.definition,
    createdBy: source.createdBy,
    lastUpdatedBy: source.lastUpdatedBy,
    valid: source.valid,
    createdAt: source.created_at,
    lastUpdatedAt: source.updated_at,
    ...pickWorkflowDocumentVersion(source),
  };
};

type PartialSource = Partial<WorkflowProperties>;

/**
 * Transforms a partial storage document (as returned by ES when `_source` is narrowed
 * to an include list) into a `WorkflowPartialDetailDto`. Only copies keys that are
 * actually present on the hit, so the consumer does not receive fabricated `undefined`
 * values for fields they did not ask for.
 *
 * Throws if `id` is undefined; tolerates an undefined `source` (returns `{ id }`).
 */
export const transformStoragePartialToWorkflowDto = (
  id: string | undefined,
  source: PartialSource | undefined
): WorkflowPartialDetailDto => {
  if (!id) {
    throw new Error('Invalid document, id is undefined');
  }
  const dto: WorkflowPartialDetailDto = { id };
  if (!source) {
    return dto;
  }
  if ('name' in source) dto.name = source.name;
  if ('description' in source) dto.description = source.description;
  if ('enabled' in source) dto.enabled = source.enabled;
  if ('managed' in source) dto.managed = source.managed;
  if ('managedBy' in source) dto.managedBy = source.managedBy;
  if ('definitionHash' in source) dto.definitionHash = source.definitionHash;
  if ('originManagedWorkflowId' in source)
    dto.originManagedWorkflowId = source.originManagedWorkflowId;
  if ('managedVersion' in source) dto.managedVersion = source.managedVersion;
  if ('lifecycle' in source) dto.lifecycle = source.lifecycle;
  if ('yaml' in source) dto.yaml = source.yaml;
  if ('definition' in source) dto.definition = source.definition;
  if ('createdBy' in source) dto.createdBy = source.createdBy;
  if ('lastUpdatedBy' in source) dto.lastUpdatedBy = source.lastUpdatedBy;
  if ('valid' in source) dto.valid = source.valid;
  if ('created_at' in source) dto.createdAt = source.created_at;
  if ('updated_at' in source) dto.lastUpdatedAt = source.updated_at;
  if ('version' in source) {
    Object.assign(dto, pickWorkflowDocumentVersion(source));
  }
  return dto;
};
