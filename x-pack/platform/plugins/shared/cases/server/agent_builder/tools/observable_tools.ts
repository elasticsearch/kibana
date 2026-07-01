/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { platformCoreCasesTools, ToolType } from '@kbn/agent-builder-common';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server/tools';
import type { KibanaRequest } from '@kbn/core-http-server';
import { addObservablesStepCommonDefinition } from '../../../common/workflows/steps/add_observables';
import { updateObservableStepCommonDefinition } from '../../../common/workflows/steps/update_observable';
import { addObservablesStepDefinition } from '../../workflows/steps/add_observables';
import { updateObservableStepDefinition } from '../../workflows/steps/update_observable';
import { deleteObservableStepDefinition } from '../../workflows/steps/delete_observable';
import type { CasesClient } from '../../client';
import { invokeStepHandler } from '../utils/invoke_step';
import {
  CASES_TOOL_TEXT_INSTRUCTION,
  CASES_SOLUTION_CONTEXT_INSTRUCTION,
} from '../utils/tool_instructions';
import { emitFromStepResult, injectAttachmentIds } from '../attachments/emit_attachments';

type GetCasesClientFn = (request: KibanaRequest) => Promise<CasesClient>;

const observablesSchema = z.object({
  mode: z
    .enum(['add', 'update', 'delete'])
    .describe(
      'Required fields per mode:\n' +
        '- add: case_id, observables ({typeKey, value, description?}[])\n' +
        '- update: case_id, observable_id, value (description optional)\n' +
        '- delete: case_id, observable_id'
    ),
  ...addObservablesStepCommonDefinition.inputSchema.partial().shape,
  ...updateObservableStepCommonDefinition.inputSchema.partial().shape,
});

export const observablesTool = (
  getCasesClientFn: GetCasesClientFn
): BuiltinToolDefinition<typeof observablesSchema> => {
  const addObservablesStepDef = addObservablesStepDefinition(getCasesClientFn);
  const updateObservableStepDef = updateObservableStepDefinition(getCasesClientFn);
  const deleteObservableStepDef = deleteObservableStepDefinition(getCasesClientFn);

  return {
    id: platformCoreCasesTools.observables,
    type: ToolType.builtin,
    description: `Case observables — IOCs/indicators (IPs, domains, file hashes, URLs, emails, registry keys). Modes: \`add\`, \`update\`, \`delete\`. See \`mode\` field for required inputs.\n\n${CASES_SOLUTION_CONTEXT_INSTRUCTION}${CASES_TOOL_TEXT_INSTRUCTION}`,
    schema: observablesSchema,
    tags: ['cases'],
    handler: async (args, toolContext) => {
      const { mode, case_id, ...rest } = args;

      const runStep = async () => {
        switch (mode) {
          case 'add':
            return invokeStepHandler(addObservablesStepDef, { case_id, ...rest }, toolContext);
          case 'update': {
            // Destructure to avoid passing unknown fields to the step
            const { observable_id, value, description } = rest;
            return invokeStepHandler(
              updateObservableStepDef,
              { case_id, observable_id, value, description },
              toolContext
            );
          }
          case 'delete': {
            const { observable_id } = rest;
            return invokeStepHandler(
              deleteObservableStepDef,
              { case_id, observable_id },
              toolContext
            );
          }
          default: {
            const _exhaustive: never = mode;
            throw new Error(`Unknown observables mode: ${_exhaustive}`);
          }
        }
      };

      const result = await runStep();
      // delete returns { case_id, observable_id } — no full case to emit.
      if (mode !== 'delete') {
        const attachmentIds = await emitFromStepResult(toolContext.attachments, result);
        return injectAttachmentIds(result, attachmentIds);
      }
      return result;
    },
  };
};
