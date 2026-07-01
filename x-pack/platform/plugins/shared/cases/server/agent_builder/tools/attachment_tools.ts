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
import { addCommentStepCommonDefinition } from '../../../common/workflows/steps/add_comment';
import { addAlertsStepCommonDefinition } from '../../../common/workflows/steps/add_alerts';
import { addEventsStepCommonDefinition } from '../../../common/workflows/steps/add_events';
import { addCommentStepDefinition } from '../../workflows/steps/add_comment';
import { addAlertsStepDefinition } from '../../workflows/steps/add_alerts';
import { addEventsStepDefinition } from '../../workflows/steps/add_events';
import { getAllAttachmentsStepDefinition } from '../../workflows/steps/get_all_attachments';
import type { CasesClient } from '../../client';
import { invokeStepHandler } from '../utils/invoke_step';
import {
  CASES_TOOL_TEXT_INSTRUCTION,
  CASES_SOLUTION_CONTEXT_INSTRUCTION,
} from '../utils/tool_instructions';
import { emitFromStepResult, injectAttachmentIds } from '../attachments/emit_attachments';

type GetCasesClientFn = (request: KibanaRequest) => Promise<CasesClient>;

const attachmentsSchema = z.object({
  mode: z
    .enum(['add_comment', 'add_alerts', 'add_events', 'get_all'])
    .describe(
      'Required fields per mode:\n' +
        '- add_comment: case_id, comment\n' +
        '- add_alerts: case_id, alerts ({alertId, index, rule?}[])\n' +
        '- add_events: case_id, events ({eventId, index}[])\n' +
        '- get_all: case_id'
    ),
  ...addCommentStepCommonDefinition.inputSchema.partial().shape,
  ...addAlertsStepCommonDefinition.inputSchema.partial().shape,
  ...addEventsStepCommonDefinition.inputSchema.partial().shape,
  // get_all only needs case_id — already covered above
});

export const attachmentsTool = (
  getCasesClientFn: GetCasesClientFn
): BuiltinToolDefinition<typeof attachmentsSchema> => {
  const addCommentStepDef = addCommentStepDefinition(getCasesClientFn);
  const addAlertsStepDef = addAlertsStepDefinition(getCasesClientFn);
  const addEventsStepDef = addEventsStepDefinition(getCasesClientFn);
  const getAllAttachmentsStepDef = getAllAttachmentsStepDefinition(getCasesClientFn);

  return {
    id: platformCoreCasesTools.attachments,
    type: ToolType.builtin,
    description: `Case attachments. Modes: \`add_comment\` (user comment), \`add_alerts\` (link SIEM/detection alerts), \`add_events\` (link log/event docs), \`get_all\` (fetch all comments, alerts, events). See \`mode\` field for required inputs.\n\n${CASES_SOLUTION_CONTEXT_INSTRUCTION}${CASES_TOOL_TEXT_INSTRUCTION}`,
    schema: attachmentsSchema,
    tags: ['cases'],
    handler: async (args, toolContext) => {
      const { mode, case_id, ...rest } = args;

      const runStep = async () => {
        switch (mode) {
          case 'add_comment':
            return invokeStepHandler(addCommentStepDef, { case_id, ...rest }, toolContext);
          case 'add_alerts':
            return invokeStepHandler(addAlertsStepDef, { case_id, ...rest }, toolContext);
          case 'add_events':
            return invokeStepHandler(addEventsStepDef, { case_id, ...rest }, toolContext);
          case 'get_all':
            return invokeStepHandler(getAllAttachmentsStepDef, { case_id }, toolContext);
          default: {
            const _exhaustive: never = mode;
            throw new Error(`Unknown attachments mode: ${_exhaustive}`);
          }
        }
      };

      const result = await runStep();
      if (mode !== 'get_all') {
        const attachmentIds = await emitFromStepResult(toolContext.attachments, result);
        return injectAttachmentIds(result, attachmentIds);
      }
      return result;
    },
  };
};
