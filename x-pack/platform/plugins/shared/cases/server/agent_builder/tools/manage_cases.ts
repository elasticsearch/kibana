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
import { createCaseStepCommonDefinition } from '../../../common/workflows/steps/create_case';
import { updateCaseStepCommonDefinition } from '../../../common/workflows/steps/update_case';
import { updateCasesStepCommonDefinition } from '../../../common/workflows/steps/update_cases';
import { deleteCasesStepCommonDefinition } from '../../../common/workflows/steps/delete_cases';
import { createCaseFromTemplateStepCommonDefinition } from '../../../common/workflows/steps/create_case_from_template';
import { assignCaseStepCommonDefinition } from '../../../common/workflows/steps/assign_case';
import { addTagsStepCommonDefinition } from '../../../common/workflows/steps/add_tags';
import { setCustomFieldStepCommonDefinition } from '../../../common/workflows/steps/set_custom_field';
import { createCaseStepDefinition } from '../../workflows/steps/create_case';
import { updateCaseStepDefinition } from '../../workflows/steps/update_case';
import { updateCasesStepDefinition } from '../../workflows/steps/update_cases';
import { deleteCasesStepDefinition } from '../../workflows/steps/delete_cases';
import { createCaseFromTemplateStepDefinition } from '../../workflows/steps/create_case_from_template';
import { assignCaseStepDefinition } from '../../workflows/steps/simple_steps';
import { unassignCaseStepDefinition } from '../../workflows/steps/unassign_case';
import { addTagsStepDefinition } from '../../workflows/steps/add_tags';
import { setCustomFieldStepDefinition } from '../../workflows/steps/set_custom_field';
import type { CasesClient } from '../../client';
import { invokeStepHandler } from '../utils/invoke_step';
import {
  CASES_TOOL_TEXT_INSTRUCTION,
  CASES_SOLUTION_CONTEXT_INSTRUCTION,
} from '../utils/tool_instructions';
import { emitFromStepResult, injectAttachmentIds } from '../attachments/emit_attachments';

type GetCasesClientFn = (request: KibanaRequest) => Promise<CasesClient>;

const manageCasesSchema = z.object({
  mode: z
    .enum([
      'create',
      'create_from_template',
      'update',
      'update_bulk',
      'delete',
      'assign',
      'unassign',
      'add_tags',
      'set_custom_field',
    ])
    .describe(
      'Required fields per mode:\n' +
        '- create: title, owner (+ optional connector_id)\n' +
        '- create_from_template: owner, case_template_id\n' +
        '- update: case_id, updates (version auto-resolved)\n' +
        '- update_bulk: cases (array of {case_id, updates, version?}) — use for ≥2 cases\n' +
        '- delete: case_ids\n' +
        '- assign: case_id, assignees (ADDS users)\n' +
        '- unassign: case_id, assignees (REMOVES users; null/[] removes all)\n' +
        '- add_tags: case_id, tags_to_add (APPENDS to existing tags)\n' +
        '- set_custom_field: case_id, owner, field_name, value'
    ),
  ...createCaseStepCommonDefinition.inputSchema.partial().shape,
  ...updateCaseStepCommonDefinition.inputSchema.partial().shape,
  ...updateCasesStepCommonDefinition.inputSchema.partial().shape,
  ...deleteCasesStepCommonDefinition.inputSchema.partial().shape,
  ...createCaseFromTemplateStepCommonDefinition.inputSchema.partial().shape,
  ...assignCaseStepCommonDefinition.inputSchema.partial().shape,
  ...setCustomFieldStepCommonDefinition.inputSchema.partial().shape,
  // add_tags: only adds tags + case_id — both already covered; provide alias to avoid conflict with create's tags:
  tags_to_add: addTagsStepCommonDefinition.inputSchema.shape.tags
    .optional()
    .describe('Tags to ADD to the existing tag list. Required for add_tags mode.'),
  // Custom field not in any step schema:
  connector_id: z
    .string()
    .optional()
    .describe('External connector ID for the case. Optional for create mode.'),
  // Override tags to clarify it replaces the full tag list (vs tags_to_add which appends):
  tags: createCaseStepCommonDefinition.inputSchema.shape.tags.describe(
    'Tags to set on the case. Used in create mode (replaces entire tag list).'
  ),
});

export const manageCasesTool = (
  getCasesClientFn: GetCasesClientFn
): BuiltinToolDefinition<typeof manageCasesSchema> => {
  const createStepDef = createCaseStepDefinition(getCasesClientFn);
  const updateCaseStepDef = updateCaseStepDefinition(getCasesClientFn);
  const updateCasesStepDef = updateCasesStepDefinition(getCasesClientFn);
  const deleteCasesStepDef = deleteCasesStepDefinition(getCasesClientFn);
  const createFromTemplateStepDef = createCaseFromTemplateStepDefinition(getCasesClientFn);
  const assignStepDef = assignCaseStepDefinition(getCasesClientFn);
  const unassignStepDef = unassignCaseStepDefinition(getCasesClientFn);
  const addTagsStepDef = addTagsStepDefinition(getCasesClientFn);
  const setCustomFieldStepDef = setCustomFieldStepDefinition(getCasesClientFn);

  return {
    id: platformCoreCasesTools.manage,
    type: ToolType.builtin,
    description: `Cases CRUD + assign/tags/custom fields. Modes: \`create\`, \`create_from_template\`, \`update\`, \`update_bulk\` (≥2 cases), \`delete\`, \`assign\`, \`unassign\`, \`add_tags\`, \`set_custom_field\`. See \`mode\` field for required inputs.\n\n${CASES_SOLUTION_CONTEXT_INSTRUCTION}${CASES_TOOL_TEXT_INSTRUCTION}`,
    schema: manageCasesSchema,
    tags: ['cases'],
    handler: async (args, toolContext) => {
      const { mode, connector_id, tags_to_add, case_id, assignees, ...rest } = args;

      const runStep = async () => {
        switch (mode) {
          case 'create': {
            const input: Record<string, unknown> = { ...rest };
            if (case_id !== undefined) input.case_id = case_id;
            if (assignees !== undefined) input.assignees = assignees;
            const config: Record<string, unknown> = {};
            if (connector_id) config['connector-id'] = connector_id;
            return invokeStepHandler(createStepDef, input, toolContext, config);
          }
          case 'create_from_template':
            return invokeStepHandler(createFromTemplateStepDef, { ...rest }, toolContext);
          case 'update':
            return invokeStepHandler(updateCaseStepDef, { case_id, ...rest }, toolContext);
          case 'update_bulk':
            return invokeStepHandler(updateCasesStepDef, { ...rest }, toolContext);
          case 'delete':
            return invokeStepHandler(deleteCasesStepDef, { ...rest }, toolContext);
          case 'assign':
            return invokeStepHandler(assignStepDef, { case_id, assignees, ...rest }, toolContext);
          case 'unassign':
            return invokeStepHandler(unassignStepDef, { case_id, assignees, ...rest }, toolContext);
          case 'add_tags':
            return invokeStepHandler(
              addTagsStepDef,
              { case_id, tags: tags_to_add, ...rest },
              toolContext
            );
          case 'set_custom_field':
            return invokeStepHandler(setCustomFieldStepDef, { case_id, ...rest }, toolContext);
          default: {
            const _exhaustive: never = mode;
            throw new Error(`Unknown manage_cases mode: ${_exhaustive}`);
          }
        }
      };

      const result = await runStep();
      if (mode !== 'delete') {
        const attachmentIds = await emitFromStepResult(toolContext.attachments, result);
        return injectAttachmentIds(result, attachmentIds);
      }
      return result;
    },
  };
};
