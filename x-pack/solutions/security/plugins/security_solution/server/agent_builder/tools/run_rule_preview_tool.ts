/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import dateMath from '@kbn/datemath';
import { parseDuration } from '@kbn/alerting-plugin/common';
import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import { ConfirmationStatus } from '@kbn/agent-builder-common/agents/prompts';
import type { BuiltinToolDefinition, StaticToolRegistration } from '@kbn/agent-builder-server';
import { RulePreviewRequestBody } from '../../../common/api/detection_engine';
import { SecurityAgentBuilderAttachments } from '../../../common/constants';
import { securityTool } from './constants';
import type { RunRulePreviewDeps } from '../../lib/detection_engine/rule_preview/api/preview_rules/run_rule_preview';
import { runRulePreview } from '../../lib/detection_engine/rule_preview/api/preview_rules/run_rule_preview';
import { parseRulePreviewCommand } from './parse_rule_preview_command';

export const SECURITY_RUN_RULE_PREVIEW_TOOL_ID = securityTool('run_rule_preview');

/**
 * Ask the user to confirm before running a preview with more than this many
 * executor invocations. Beyond this count the preview can take a significant
 * amount of time and should be intentional.
 */
const INVOCATION_COUNT_CONFIRMATION_THRESHOLD = 10;

/**
 * Fields required by the preview API that do not affect which alerts a
 * preview generates. Hardcoded here so the LLM only needs to provide the
 * fields that actually matter for a preview.
 */
const RULE_PREVIEW_SHARED_DEFAULTS = {
  name: 'Ad-hoc rule preview',
  description: 'Ad-hoc rule preview',
  risk_score: 21,
  severity: 'low',
} as const;

const runRulePreviewSchema = z.object({
  command: z.string().describe(
    `CLI-style command for previewing a detection rule. The first word is the rule type subcommand.

Supported types: esql, eql, query, saved_query, threshold, threat_match, machine_learning, new_terms

Examples:
  esql --query "FROM logs-* | LIMIT 10"
  eql --query "process where process.name == \\"cmd.exe\\""
  query --query "event.outcome:failure" --language kuery
  threshold --query "event.outcome:failure" --threshold-value 10 --threshold-field host.name
  machine_learning --job-id my-ml-job --anomaly-threshold 75

Schedule flags (optional, all commands):
  --interval 5m --timeframe-start now-24h --timeframe-end now

Help:
  --help                   list all rule types
  <rule_type> --help       type-specific options and examples`
  ),
});

export function runRulePreviewTool(
  deps: RunRulePreviewDeps
): StaticToolRegistration<typeof runRulePreviewSchema> {
  const toolDefinition: BuiltinToolDefinition<typeof runRulePreviewSchema> = {
    id: SECURITY_RUN_RULE_PREVIEW_TOOL_ID,
    type: ToolType.builtin,
    description: `Runs a security detection rule preview over a time range without saving the rule, then stores the result as a rule preview attachment.

Call this whenever a detection rule is created or modified (for example a rule produced or edited by the create_detection_rule tool) to validate the change before saving, and inspect the alerts it would have generated. The timeframe defaults to the last hour but can be overridden via --timeframe-start and --timeframe-end flags.

Pass --help in the command to discover supported rule types, required flags, and examples. All 8 detection rule types are supported.

The tool returns the generated previewId and the attachment metadata. Use the returned attachmentId and version with <render_attachment id="..." version="..."> to display it.`,
    schema: runRulePreviewSchema,
    tags: ['security', 'detection', 'rule-preview', 'attachment'],
    handler: async (
      { command },
      { request, spaceId, savedObjectsClient, attachments, prompts, callContext }
    ) => {
      const parsed = parseRulePreviewCommand(command);

      if (parsed.kind === 'help') {
        return {
          results: [
            {
              type: ToolResultType.other,
              data: { help: parsed.text },
            },
          ],
        };
      }

      if (parsed.kind === 'error') {
        return {
          results: [
            {
              type: ToolResultType.error,
              data: { message: parsed.message },
            },
          ],
        };
      }

      // parsed.kind === 'preview'
      const { rule, interval, timeframeStart, timeframeEnd } = parsed;

      const start = dateMath.parse(timeframeStart);
      const end = dateMath.parse(timeframeEnd, { roundUp: true });

      if (!start?.isValid() || !end?.isValid()) {
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Invalid timeframe. Could not parse --timeframe-start "${timeframeStart}" or --timeframe-end "${timeframeEnd}" as datemath.`,
              },
            },
          ],
        };
      }

      if (end.valueOf() <= start.valueOf()) {
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Invalid timeframe. --timeframe-end must be after --timeframe-start.`,
              },
            },
          ],
        };
      }

      if (rule.type === 'esql' && deps.config.experimentalFeatures.esqlRulesDisabled) {
        return {
          results: [
            {
              type: ToolResultType.error,
              data: { message: 'ES|QL rule previews are not supported on this cluster.' },
            },
          ],
        };
      }

      let intervalMs: number;
      try {
        intervalMs = parseDuration(interval);
      } catch {
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Invalid --interval "${interval}". Use a duration like 5m, 1h, or 2d.`,
              },
            },
          ],
        };
      }

      const invocationCount = Math.max(
        Math.ceil((end.valueOf() - start.valueOf()) / intervalMs),
        1
      );

      if (invocationCount > INVOCATION_COUNT_CONFIRMATION_THRESHOLD) {
        const promptId = `run_rule_preview.high_invocation_count.${callContext.toolCallId}`;
        const { status } = prompts.checkConfirmationStatus(promptId);

        if (status === ConfirmationStatus.unprompted) {
          return prompts.askForConfirmation({
            id: promptId,
            title: 'Large rule preview',
            message: `This preview will run the rule **${invocationCount}** times (${timeframeStart} → ${timeframeEnd} at \`${interval}\` intervals). Large previews can take a while. Do you want to continue?`,
            confirm_text: 'Run preview',
            cancel_text: 'Cancel',
            color: 'warning',
          });
        }

        if (status === ConfirmationStatus.rejected) {
          return {
            results: [
              {
                type: ToolResultType.error,
                data: {
                  message: [
                    'The user explicitly rejected this rule preview — it was not run.',
                    'Tell the user the preview did not run because they cancelled it.',
                    'If they still want to run it, they can re-run the original command:',
                    `  ${command}`,
                  ].join('\n'),
                },
              },
            ],
          };
        }
      }

      const rawBody = {
        ...RULE_PREVIEW_SHARED_DEFAULTS,
        ...rule,
        from: `now-${interval}`,
        to: 'now',
        interval,
        invocationCount,
        timeframeEnd: end.toISOString(),
      };

      const validation = RulePreviewRequestBody.safeParse(rawBody);
      if (!validation.success) {
        const messages = validation.error.issues.map((i) => i.message).join('; ');
        return {
          results: [
            {
              type: ToolResultType.error,
              data: { message: `Invalid rule parameters: ${messages}` },
            },
          ],
        };
      }

      const body = rawBody as RulePreviewRequestBody;

      const [coreStart, startPlugins] = await deps.getStartServices();
      const uiSettingsClient = coreStart.uiSettings.asScopedToClient(savedObjectsClient);
      const actionsClient = await startPlugins.actions.getActionsClientWithRequest(request);
      const license = await startPlugins.licensing.getLicense();

      const previewResponse = await runRulePreview(deps, {
        body,
        enableLoggedRequests: false,
        request,
        spaceId,
        actionsClient,
        license,
        savedObjectsClient,
        uiSettingsClient,
      });

      if (!previewResponse.previewId) {
        const errors = previewResponse.logs.flatMap((log) => log.errors);
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message:
                  errors.length > 0
                    ? `Rule preview did not produce a preview: ${errors.join('; ')}`
                    : 'Rule preview did not produce a preview.',
                logs: previewResponse.logs,
              },
            },
          ],
        };
      }

      const { previewId } = previewResponse;
      const created = await attachments.add({
        id: `security-rule-preview-${previewId}`,
        type: SecurityAgentBuilderAttachments.rulePreview,
        data: {
          previewId,
        },
        description: `Rule preview: ${previewId}`,
      });

      return {
        results: [
          {
            type: ToolResultType.other,
            data: {
              attachmentId: created.id,
              type: created.type,
              version: created.current_version,
              previewId,
              invocationCount,
              logs: previewResponse.logs,
            },
          },
        ],
      };
    },
  };

  return toolDefinition;
}
