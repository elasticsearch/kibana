/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowExecutionEngineModel, WorkflowYaml } from '../../../types/v1';
import {
  type ManagedWorkflowFieldsSource,
  pickManagedWorkflowFields,
} from '../pick_managed_workflow_fields/pick_managed_workflow_fields';
import { pickWorkflowDocumentVersion } from '../pick_workflow_document_version/pick_workflow_document_version';

export type WorkflowExecutionEngineModelSource = {
  id: string;
  name: string;
  enabled: boolean;
  yaml: string;
  definition?: WorkflowYaml | null;
  version?: number;
} & ManagedWorkflowFieldsSource;

export type ToWorkflowExecutionEngineModelOptions = Pick<
  WorkflowExecutionEngineModel,
  'isTestRun' | 'isEphemeral' | 'spaceId'
>;

export const toWorkflowExecutionEngineModel = (
  workflow: WorkflowExecutionEngineModelSource,
  options?: ToWorkflowExecutionEngineModelOptions
): WorkflowExecutionEngineModel => {
  const definition = workflow.definition ?? undefined;

  return {
    id: workflow.id,
    name: workflow.name,
    enabled: workflow.enabled,
    ...(definition !== undefined ? { definition } : {}),
    yaml: workflow.yaml,
    ...pickManagedWorkflowFields(workflow),
    ...pickWorkflowDocumentVersion(workflow),
    ...options,
  };
};
