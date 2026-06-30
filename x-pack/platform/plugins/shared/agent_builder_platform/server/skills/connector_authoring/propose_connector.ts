/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType, isOtherResult } from '@kbn/agent-builder-common/tools/tool_result';
import { getToolResultId, createErrorResult } from '@kbn/agent-builder-server';
import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills';
import { getConnectorSpec } from '@kbn/connector-specs';
import {
  CONNECTOR_SETUP_ATTACHMENT_TYPE,
  type ConnectorSetupAttachmentData,
} from '../../../common/attachments';
import { supportsAgentBuilder } from './utils';

const proposeConnectorSchema = z.object({
  connector_type: z
    .string()
    .describe(
      'The connector type id to set up, e.g. `.github` or `.slack`. Must be a value returned by `list_connector_types` — call that first and copy the id verbatim.'
    ),
  suggested_name: z
    .string()
    .optional()
    .describe(
      'Optional human-readable name to pre-fill in the connector form, e.g. "Acme GitHub". The user can change it.'
    ),
  reason: z
    .string()
    .optional()
    .describe(
      'Optional one-line explanation, shown on the card, of why this connector helps with the task at hand.'
    ),
});

export type ProposeConnectorInput = z.infer<typeof proposeConnectorSchema>;

/**
 * Inline tool that renders a connector setup card in the conversation by
 * creating a `connector_setup` attachment.
 *
 * The card lets the user create a connector instance via the connector flyout,
 * where configuration and secrets are entered and submitted directly to the
 * Actions API. Secrets never pass through this tool, the conversation, or the
 * model. The handler validates that `connector_type` is a known spec-backed
 * connector and returns the attachment id so the assistant can emit
 * `<render_attachment id="..." />`.
 */
export const createProposeConnectorTool = (): BuiltinSkillBoundedTool<
  typeof proposeConnectorSchema
> => ({
  id: 'propose_connector',
  type: ToolType.builtin,
  description:
    'Render a connector setup card so the user can create a connector instance from chat. Pass the `connector_type` id (from `list_connector_types`) and optionally a `suggested_name` and a one-line `reason`. The user enters configuration and secrets in the card form — never ask for secrets in chat. On success, render the card by emitting `<render_attachment id="ATTACHMENT_ID" />`.',
  schema: proposeConnectorSchema,
  confirmation: { askUser: 'never' },
  handler: async (input, context) => {
    const { attachments } = context;

    const spec = getConnectorSpec(input.connector_type);
    if (!spec || !supportsAgentBuilder(spec)) {
      return {
        results: [
          createErrorResult({
            message:
              `Connector type '${input.connector_type}' is not available to set up from chat. ` +
              'Call `list_connector_types` and pick a `connector_type` value from the result.',
          }),
        ],
      };
    }

    const data: ConnectorSetupAttachmentData = {
      connector_type: input.connector_type,
      connector_type_name: spec.metadata.displayName,
      suggested_name: input.suggested_name,
      reason: input.reason,
    };

    try {
      const attachment = await attachments.add(
        {
          type: CONNECTOR_SETUP_ATTACHMENT_TYPE,
          data,
          description: input.reason ?? `Set up ${spec.metadata.displayName} connector`,
        },
        'agent'
      );

      return {
        results: [
          {
            tool_result_id: getToolResultId(),
            type: ToolResultType.other,
            data: {
              attachment_id: attachment.id,
              version: attachment.current_version,
              connector_type: data.connector_type,
              connector_type_name: data.connector_type_name,
            },
          },
        ],
      };
    } catch (error) {
      return {
        results: [
          createErrorResult({
            message: `Failed to create connector setup card: ${(error as Error).message}`,
          }),
        ],
      };
    }
  },
  summarizeToolReturn: (toolReturn) => {
    if (toolReturn.results.length === 0) return undefined;
    const result = toolReturn.results[0];
    if (!isOtherResult(result)) return undefined;
    const data = result.data as Record<string, unknown>;
    return [
      {
        ...result,
        data: {
          summary: `Rendered a setup card for ${
            data.connector_type_name ?? data.connector_type
          } as attachment ${data.attachment_id}.`,
          attachment_id: data.attachment_id,
          connector_type: data.connector_type,
        },
      },
    ];
  },
});
