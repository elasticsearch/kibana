/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { z } from '@kbn/zod/v4';
import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import { getToolResultId } from '@kbn/agent-builder-server';
import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';
import {
  ALLOWED_MONITOR_SCHEDULES_IN_MINUTES,
  MONITOR_ATTACHMENT_TYPE,
  type MonitorAttachmentData,
} from '../../../../common/agent_builder/attachments/monitor_attachment_schema';
import { syntheticsTools } from '../../common/constants';
import {
  monitorOperationSchema,
  executeMonitorOperations,
  MonitorOperationValidationError,
} from './operations';

const manageMonitorSchema = z.object({
  monitorAttachmentId: z
    .string()
    .optional()
    .describe(
      '(optional) The monitor attachment ID to modify. If omitted, a new monitor draft is created.'
    ),
  operations: z.array(monitorOperationSchema).min(1),
});

const allowedSchedulesList = ALLOWED_MONITOR_SCHEDULES_IN_MINUTES.join(', ');

export const manageMonitorTool = (): BuiltinSkillBoundedTool<typeof manageMonitorSchema> => ({
  id: syntheticsTools.manageMonitor,
  type: ToolType.builtin,
  description: `Compose or update a Synthetics HTTP monitor draft in the conversation.

This tool only mutates the monitor attachment shown in the conversation. It
does NOT create or modify any saved Synthetics monitor — that is the job of
the **Save monitor** / **Update monitor** action buttons on the rendered card.

After this tool returns, you **MUST** render the resulting attachment in your
reply with \`<render_attachment id="<monitorAttachment.id>" version="<version>"/>\`
(values come from the tool result). Do not summarise the monitor in a markdown
table or bulleted list — the user cannot save without the rendered card.

Use operations[] to:
1. set_metadata — set name (required for new monitors), description, and tags
2. set_url — set the URL the monitor should check (e.g. https://example.com)
3. set_schedule — set how often the monitor runs. \`number\` is a string drawn
   from the synthetics allow list (${allowedSchedulesList}) and \`unit\` must be "m".
4. set_locations — set at least one location ({ id, label?, isServiceManaged? })
5. validate — validate the accumulated monitor against the schema; throws if
   the monitor is not ready to save (missing fields, invalid URL, etc.)`,
  schema: manageMonitorSchema,
  handler: async (
    { monitorAttachmentId: previousAttachmentId, operations },
    { logger, attachments }
  ) => {
    try {
      const currentAttachment = previousAttachmentId
        ? attachments.getAttachmentRecord(previousAttachmentId)
        : undefined;

      const isNew = !currentAttachment;
      const attachmentId = previousAttachmentId ?? uuidv4();

      const currentData: Partial<MonitorAttachmentData> =
        (currentAttachment?.versions.at(-1)?.data as Partial<MonitorAttachmentData> | undefined) ??
        {};

      const { data: updatedData } = executeMonitorOperations(currentData, operations, { isNew });

      const attachmentInput = {
        id: attachmentId,
        type: MONITOR_ATTACHMENT_TYPE,
        description: `Synthetics monitor: ${updatedData.metadata?.name ?? attachmentId}`,
        data: updatedData,
      };

      const attachment = isNew
        ? await attachments.add(attachmentInput)
        : await attachments.update(attachmentId, {
            data: updatedData,
            description: attachmentInput.description,
          });

      if (!attachment) {
        throw new Error(`Failed to persist monitor attachment "${attachmentId}".`);
      }

      logger.debug(
        `Monitor attachment ${isNew ? 'created' : 'updated'}: "${
          updatedData.metadata?.name ?? attachmentId
        }"`
      );

      return {
        results: [
          {
            type: ToolResultType.other,
            tool_result_id: getToolResultId(),
            data: {
              version: attachment.current_version ?? 1,
              monitorAttachment: {
                id: attachment.id,
                name: updatedData.metadata?.name,
                type: updatedData.type,
                urls: updatedData.urls,
                schedule: updatedData.schedule,
                locations: updatedData.locations,
              },
            },
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof MonitorOperationValidationError) {
        logger.debug(`manage_monitor tool: invalid input — ${message}`);
      } else {
        logger.warn(`Error in manage_monitor tool: ${message}`);
      }
      return {
        results: [
          {
            type: ToolResultType.error,
            data: {
              message: `Failed to manage synthetics monitor: ${message}`,
              metadata: { monitorAttachmentId: previousAttachmentId, operations },
            },
          },
        ],
      };
    }
  },
});
