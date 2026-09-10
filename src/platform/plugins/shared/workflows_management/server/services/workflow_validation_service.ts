/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest } from '@kbn/core/server';
import { toCustomTriggerSchemaConfigs, type ValidateWorkflowResponseDto } from '@kbn/workflows';
import type { GetAvailableConnectorsResponse } from '@kbn/workflows/types/v1';
import type { ServerTriggerDefinition } from '@kbn/workflows-extensions/server';
import type { z } from '@kbn/zod/v4';

import type { WorkflowValidationDeps } from './types';
import type { ValidateWorkflowRequestOptions } from '../../common/lib/validate_workflow_yaml';
import { validateWorkflowYaml } from '../../common/lib/validate_workflow_yaml';
import { getWorkflowZodSchema } from '../../common/schema';
import { getAvailableConnectors } from '../api/lib/workflow_connectors';

export class WorkflowValidationService {
  constructor(private readonly deps: WorkflowValidationDeps) {}

  async getAvailableConnectors(
    spaceId: string,
    request: KibanaRequest
  ): Promise<GetAvailableConnectorsResponse> {
    return getAvailableConnectors({
      getActionsClient: this.deps.getActionsClient,
      getActionsClientWithRequest: this.deps.getActionsClientWithRequest,
      spaceId,
      request,
    });
  }

  getRegisteredCustomTriggerDefinitions(): ServerTriggerDefinition[] {
    return this.deps.workflowsExtensions?.getAllTriggerDefinitions() ?? [];
  }

  async validateWorkflow(
    yaml: string,
    spaceId: string,
    request: KibanaRequest,
    options?: ValidateWorkflowRequestOptions
  ): Promise<ValidateWorkflowResponseDto> {
    const zodSchema = await this.getWorkflowZodSchema({ loose: false }, spaceId, request);
    const triggerDefinitions = this.getRegisteredCustomTriggerDefinitions();
    return validateWorkflowYaml(yaml, zodSchema, {
      triggerDefinitions,
      expectedInputRefs: options?.expectedInputRefs,
    });
  }

  async getWorkflowZodSchema(
    options: { loose?: false },
    spaceId: string,
    request: KibanaRequest
  ): Promise<z.ZodType> {
    const { connectorTypes } = await this.getAvailableConnectors(spaceId, request);
    const registeredTriggers = toCustomTriggerSchemaConfigs(
      this.getRegisteredCustomTriggerDefinitions()
    );
    return getWorkflowZodSchema(connectorTypes, registeredTriggers);
  }
}
