/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import YAML, { LineCounter, parseDocument } from 'yaml';
import { AgentExecutionMode, ToolType } from '@kbn/agent-builder-common';
import { ConfirmationStatus } from '@kbn/agent-builder-common/agents/prompts';
import type { ToolHandlerContext } from '@kbn/agent-builder-server';
import { i18n } from '@kbn/i18n';
import { ExecutionStatus, TerminalExecutionStatuses } from '@kbn/workflows';
import {
  buildWorkflowLookup,
  isNestedStepKey,
  isWorkflowValidationError,
  NESTED_STEP_KEYS,
  type StepInfo,
  type WorkflowLookup,
} from '@kbn/workflows-yaml';
import { z } from '@kbn/zod/v4';
import { WORKFLOW_YAML_ATTACHMENT_TYPE } from '@kbn/workflows/common/constants';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
type WorkflowsManagementApi = WorkflowsServerPluginSetup['management'];
import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';

export const WORKFLOW_EXECUTE_STEP_TOOL_ID = 'platform.workflows.workflow_execute_step';

export const SAFE_STEP_TYPES = new Set([
  'console',
  'data.set',
  'data.map',
  'data.filter',
  'data.find',
  'data.dedupe',
  'data.aggregate',
  'data.concat',
  'data.parseJson',
  'data.regexExtract',
  'data.regexReplace',
  'data.stringifyJson',
  'if',
  'foreach',
  'while',
  'wait',
  'elasticsearch.search',
  'elasticsearch.esql.query',
  'elasticsearch.indices.exists',
  'kibana.getCase',
  'kibana.streams.list',
  'kibana.streams.get',
  'kibana.streams.getSignificantEvents',
  'cases.getCase',
  'cases.getCases',
  'cases.findCases',
  'cases.findSimilarCases',
  'cases.getAllAttachments',
  'cases.getCasesByAlertId',
  // Slack read-only actions (.slack2 connector): query the Slack API without
  // posting messages or mutating workspace state.
  'slack2.searchMessages',
  'slack2.listChannels',
  'slack2.resolveChannelId',
]);

/**
 * Every unsafe step already requires human approval — the HITL dialog gates
 * execution regardless of step type. This list only adds emphasis: entries
 * render the confirm button with `color: 'danger'` instead of `'warning'`.
 */
const DESTRUCTIVE_STEP_TYPES = new Set([
  'elasticsearch.indices.delete',
  'cases.deleteCases',
  'cases.deleteObservable',
]);

const CONDITION_STEP_TYPES = new Set(['if', 'while']);

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 30_000;
const STUB_SEQUENCE_KEYS = ['steps', 'else', 'fallback'] as const;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const findWorkflowYamlAttachment = (
  context: ToolHandlerContext
): { yaml: string; workflowId?: string } | null => {
  const activeAttachments = context.attachments.getActive();
  const yamlAttachment = activeAttachments.find((a) => a.type === WORKFLOW_YAML_ATTACHMENT_TYPE);
  if (!yamlAttachment) return null;

  const latestVersion = yamlAttachment.versions[yamlAttachment.versions.length - 1];
  if (!latestVersion) return null;

  const data = latestVersion.data as { yaml?: string; workflowId?: string };
  if (!data?.yaml) return null;

  return { yaml: data.yaml, workflowId: data.workflowId };
};

const buildLookup = (yaml: string): WorkflowLookup => {
  const lineCounter = new LineCounter();
  const doc = parseDocument(yaml, { lineCounter });
  return buildWorkflowLookup(doc, lineCounter);
};

const getYamlParseError = (yaml: string): string | null => {
  try {
    const doc = parseDocument(yaml);
    if (doc.errors.length > 0) {
      return doc.errors[0].message;
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

/**
 * Collects all descendant step IDs of a given step using parentStepId links.
 */
const getDescendantStepIds = (stepId: string, allSteps: Record<string, StepInfo>): string[] => {
  const descendants: string[] = [];
  for (const [id, info] of Object.entries(allSteps)) {
    if (info.parentStepId === stepId) {
      descendants.push(id);
      descendants.push(...getDescendantStepIds(id, allSteps));
    }
  }
  return descendants;
};

/**
 * A step is safe only if its own type and every descendant's type are in SAFE_STEP_TYPES.
 * Returns the first unsafe step found (self or descendant), or null if fully safe.
 */
const findUnsafeStep = (stepId: string, allSteps: Record<string, StepInfo>): StepInfo | null => {
  const step = allSteps[stepId];
  if (!step) return null;

  if (!SAFE_STEP_TYPES.has(step.stepType)) return step;

  const descendantIds = getDescendantStepIds(stepId, allSteps);
  for (const id of descendantIds) {
    const descendant = allSteps[id];
    if (descendant && !SAFE_STEP_TYPES.has(descendant.stepType)) {
      return descendant;
    }
  }

  return null;
};

/**
 * Ensures inline YAML has the minimum fields required for workflow validation
 * (version, name, triggers). Adds defaults for any missing required fields.
 */
const ensureMinimalWorkflow = (yamlStr: string): string => {
  const doc = parseDocument(yamlStr);
  if (!YAML.isMap(doc.contents) || doc.errors.length > 0) {
    return yamlStr;
  }

  const contents = doc.contents as YAML.YAMLMap;
  if (!contents.get('version')) {
    contents.set(doc.createNode('version'), doc.createNode('1'));
  }
  if (!contents.get('name')) {
    contents.set(doc.createNode('name'), doc.createNode('_execute_step_test'));
  }
  if (!contents.get('triggers')) {
    contents.set(doc.createNode('triggers'), doc.createNode([{ type: 'manual' }]));
  }
  return doc.toString();
};

/**
 * Replaces all child steps of a container step (if/while) with safe console stubs
 * so the condition can be tested without executing unsafe children.
 */
const stubUnsafeChildren = (yamlStr: string, stepName: string): string => {
  const doc = parseDocument(yamlStr);
  if (!YAML.isMap(doc.contents)) {
    return yamlStr;
  }
  const stepsNode = (doc.contents as YAML.YAMLMap).get('steps');
  if (!YAML.isSeq(stepsNode)) {
    return yamlStr;
  }

  const stubStep = (branch: string) =>
    doc.createNode({
      name: `__stub_${branch}`,
      type: 'console',
      with: { message: `condition_test: ${branch} branch taken` },
    });

  const replaceBranch = (node: YAML.YAMLMap, key: (typeof STUB_SEQUENCE_KEYS)[number]) => {
    const child = node.get(key);
    if (YAML.isSeq(child)) {
      const stubSeq = doc.createNode([]);
      (stubSeq as YAML.YAMLSeq).add(stubStep(key === 'steps' ? 'then' : key));
      node.set(key, stubSeq);
    }
  };

  const replaceNestedFailureBranches = (node: YAML.YAMLMap | YAML.YAMLSeq) => {
    if (YAML.isSeq(node)) {
      for (const item of node.items) {
        if (YAML.isMap(item) || YAML.isSeq(item)) {
          replaceNestedFailureBranches(item);
        }
      }
      return;
    }

    replaceBranch(node, 'fallback');

    for (const pair of node.items) {
      if (YAML.isPair(pair) && YAML.isScalar(pair.key)) {
        const key = pair.key.value;
        if (
          isNestedStepKey(key) &&
          key !== 'fallback' &&
          (YAML.isMap(pair.value) || YAML.isSeq(pair.value))
        ) {
          replaceNestedFailureBranches(pair.value);
        }
      }
    }
  };

  const replaceChildren = (node: YAML.YAMLMap) => {
    for (const key of ['steps', 'else'] as const) {
      replaceBranch(node, key);
    }

    for (const key of ['on-failure', 'iteration-on-failure'] as const) {
      const child = node.get(key);
      if (YAML.isMap(child) || YAML.isSeq(child)) {
        replaceNestedFailureBranches(child);
      }
    }

    replaceBranch(node, 'fallback');
  };

  const findAndReplaceNode = (node: YAML.YAMLMap | YAML.YAMLSeq): boolean => {
    if (YAML.isSeq(node)) {
      for (const item of node.items) {
        if ((YAML.isMap(item) || YAML.isSeq(item)) && findAndReplaceNode(item)) {
          return true;
        }
      }
      return false;
    }

    const name = node.get('name');
    if (name === stepName) {
      replaceChildren(node);
      return true;
    }

    for (const key of NESTED_STEP_KEYS) {
      const child = node.get(key);
      if ((YAML.isMap(child) || YAML.isSeq(child)) && findAndReplaceNode(child)) {
        return true;
      }
    }

    return false;
  };

  findAndReplaceNode(stepsNode);
  return doc.toString();
};

const formatToolError = (error: unknown) => {
  if (error instanceof Error && isWorkflowValidationError(error)) {
    return {
      success: false,
      error: error.message,
      ...(error.validationErrors ? { validationErrors: error.validationErrors } : {}),
    };
  }

  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
  };
};

const createToolResult = (data: Record<string, unknown>) => ({
  results: [
    {
      type: 'other' as const,
      data,
    },
  ],
});

const executeAndPollStep = async ({
  api,
  yaml,
  stepName,
  workflowId,
  contextOverride,
  spaceId,
  request,
}: {
  api: WorkflowsManagementApi;
  yaml: string;
  stepName: string;
  workflowId?: string;
  contextOverride?: Record<string, unknown>;
  spaceId: string;
  request: ToolHandlerContext['request'];
}) => {
  const executionId = await api.testStep(
    yaml,
    stepName,
    workflowId,
    undefined,
    contextOverride ?? {},
    spaceId,
    request
  );

  const result = await pollExecution(api, executionId, stepName, spaceId);

  return { executionId, result };
};

const formatExecutionResult = ({
  executionId,
  result,
}: {
  executionId: string;
  result: Awaited<ReturnType<typeof pollExecution>>;
}) => ({
  success: result.status === ExecutionStatus.COMPLETED,
  executionId,
  status: result.status,
  ...(result.output !== undefined ? { output: result.output } : {}),
  ...(result.error !== undefined ? { error: result.error } : {}),
  ...(result.duration != null ? { duration: result.duration } : {}),
});

const getUnsafeStepValidation = async ({
  api,
  yaml,
  spaceId,
  request,
}: {
  api: WorkflowsManagementApi;
  yaml: string;
  spaceId: string;
  request: ToolHandlerContext['request'];
}): Promise<{ valid: boolean; errors?: string[] } | undefined> => {
  try {
    const result = await api.validateWorkflow(yaml, spaceId, request);
    if (result.valid) {
      return { valid: true };
    }

    const errors = result.diagnostics
      .filter((d) => d.severity === 'error')
      .map((d) => `[${d.source}] ${d.message}${d.path ? ` (at ${d.path.join('.')})` : ''}`);
    return { valid: false, errors };
  } catch {
    return undefined;
  }
};

const executeConditionStepWithStubs = async ({
  api,
  yaml,
  stepName,
  workflowId,
  contextOverride,
  context,
}: {
  api: WorkflowsManagementApi;
  yaml: string;
  stepName: string;
  workflowId?: string;
  contextOverride?: Record<string, unknown>;
  context: ToolHandlerContext;
}) => {
  try {
    const { executionId, result } = await executeAndPollStep({
      api,
      yaml: stubUnsafeChildren(yaml, stepName),
      stepName,
      workflowId,
      contextOverride,
      spaceId: context.spaceId,
      request: context.request,
    });

    return createToolResult({
      conditionTest: true,
      ...formatExecutionResult({ executionId, result }),
      hint: 'Unsafe child steps were replaced with safe stubs to test the condition. Check the output to see which branch was taken.',
    });
  } catch (error) {
    return createToolResult(formatToolError(error));
  }
};

const buildFallbackPreview = (
  stepInfo: StepInfo,
  unsafeStep: StepInfo,
  contextOverride?: Record<string, unknown>
): string => {
  const lines: string[] = [
    i18n.translate('workflows.agentBuilder.executeStep.fallbackPreview.step', {
      defaultMessage: '**Step:** `{stepId}`',
      values: { stepId: stepInfo.stepId },
    }),
    i18n.translate('workflows.agentBuilder.executeStep.fallbackPreview.type', {
      defaultMessage: '**Type:** `{stepType}`',
      values: { stepType: stepInfo.stepType },
    }),
  ];
  if (unsafeStep.stepId !== stepInfo.stepId) {
    lines.push(
      i18n.translate('workflows.agentBuilder.executeStep.fallbackPreview.unsafeDescendant', {
        defaultMessage: '**Unsafe descendant:** `{stepId}` (`{stepType}`)',
        values: { stepId: unsafeStep.stepId, stepType: unsafeStep.stepType },
      })
    );
  }
  if (contextOverride && Object.keys(contextOverride).length > 0) {
    const keys = Object.keys(contextOverride).join(', ');
    lines.push(
      i18n.translate('workflows.agentBuilder.executeStep.fallbackPreview.contextOverrideKeys', {
        defaultMessage: '**Context override keys:** {keys}',
        values: { keys },
      })
    );
  }
  lines.push(
    '',
    i18n.translate('workflows.agentBuilder.executeStep.fallbackPreview.body', {
      defaultMessage:
        'This step has external side effects. Review the workflow YAML before confirming.',
    })
  );
  return lines.join('\n');
};

const createUnsafeStepResult = async ({
  api,
  yaml,
  stepName,
  stepInfo,
  unsafeStep,
  context,
}: {
  api: WorkflowsManagementApi;
  yaml: string;
  stepName: string;
  stepInfo: StepInfo;
  unsafeStep: StepInfo;
  context: ToolHandlerContext;
}) => {
  const validation = await getUnsafeStepValidation({
    api,
    yaml,
    spaceId: context.spaceId,
    request: context.request,
  });

  const isChildUnsafe = unsafeStep.stepId !== stepName;
  const reason = isChildUnsafe
    ? `Step "${stepName}" contains child step "${unsafeStep.stepId}" (type "${unsafeStep.stepType}") which has external side effects`
    : `Step type "${unsafeStep.stepType}" has external side effects and cannot be auto-executed`;

  return createToolResult({
    blocked: true,
    reason,
    stepType: stepInfo.stepType,
    unsafeStepType: unsafeStep.stepType,
    ...(isChildUnsafe ? { unsafeChildStepId: unsafeStep.stepId } : {}),
    ...(validation ? { validation } : {}),
    hint: 'Ask the user to test this step manually using the "Run step" button in the editor.',
  });
};

const pollExecution = async (
  api: WorkflowsManagementApi,
  executionId: string,
  stepName: string,
  spaceId: string
): Promise<{
  status: string;
  output?: unknown;
  error?: unknown;
  duration?: number | null;
}> => {
  const startTime = Date.now();

  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    await delay(POLL_INTERVAL_MS);

    const execution = await api.getWorkflowExecution(executionId, spaceId, {
      includeOutput: true,
    });

    if (!execution) {
      return { status: 'not_found', error: `Execution ${executionId} not found` };
    }

    if (TerminalExecutionStatuses.includes(execution.status as ExecutionStatus)) {
      const targetStepExecution = execution.stepExecutions?.find((se) => se.stepId === stepName);

      return {
        status: execution.status,
        output: targetStepExecution ?? undefined,
        error: execution.error ?? undefined,
        duration: execution.duration,
      };
    }
  }

  return {
    status: 'timeout',
    error: `Step execution did not complete within ${
      POLL_TIMEOUT_MS / 1000
    }s. The execution may still be running.`,
  };
};

export function registerWorkflowExecuteStepTool(
  agentBuilder: AgentBuilderPluginSetup,
  api: WorkflowsManagementApi
): void {
  agentBuilder.tools.register({
    id: WORKFLOW_EXECUTE_STEP_TOOL_ID,
    type: ToolType.builtin,
    description: `Execute a single workflow step against the real environment.
- Safe steps (data, ES reads, cases reads): executed and output returned with no prompt.
- Unsafe steps (slack.sendMessage, elasticsearch.indices.delete, ES writes, kibana.request, http, …): execution is gated by a user confirmation dialog. ALWAYS populate \`confirmation_body\` with a Markdown preview describing: (1) resolved inputs (e.g. Slack channel + message text, ES index + operation + approximate doc count), (2) the side effect this step will produce, (3) whether the action is reversible. Without \`confirmation_body\` the dialog falls back to a flat key/value dump, which is a degraded UX.
- if/while steps containing unsafe children: children are auto-replaced with safe stubs so the condition can be tested — returns which branch was taken (no prompt).
- Other safe-container steps with unsafe descendants (e.g. foreach with an unsafe child): conversation mode prompts once and authorizes the whole container; standalone mode returns a preview with validation (no prompt).

Provide \`contextOverride\` with mock data when the step references outputs from previous steps.
Provide \`yaml\` to execute a step without needing a workflow.yaml attachment (useful for field discovery before creating the full workflow).

If the user declines a confirmation, do NOT retry the same step. Acknowledge the cancellation and continue with other unrelated work.`,
    schema: z.object({
      stepName: z.string().describe('Name of the step to execute'),
      yaml: z
        .string()
        .optional()
        .describe(
          'Optional inline workflow YAML to execute from. If omitted, reads from the workflow.yaml attachment.'
        ),
      contextOverride: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'Mock data for upstream step outputs, e.g. { "steps": { "prev_step": { "output": { "data": [...] } } } }'
        ),
      confirmation_body: z
        .string()
        .optional()
        .describe(
          'Markdown shown in the confirmation dialog when executing an unsafe step. Include resolved inputs (Slack channel/text, ES index/operation/doc count), side effects, and whether the action is reversible. NOT an instruction — only displayed to the user.'
        ),
    }),
    tags: ['workflows', 'yaml', 'execution', 'testing'],
    handler: async (
      { stepName, yaml: inlineYaml, contextOverride, confirmation_body: confirmationBody },
      context
    ) => {
      const attachment = inlineYaml ? null : findWorkflowYamlAttachment(context);
      if (!inlineYaml && !attachment) {
        return createToolResult({
          success: false,
          error:
            'No workflow YAML attachment found. Provide the `yaml` parameter with inline YAML, or create a workflow first.',
        });
      }

      let yaml: string;
      if (inlineYaml) {
        yaml = ensureMinimalWorkflow(inlineYaml);
      } else {
        yaml = attachment?.yaml ?? '';
      }
      const workflowId = attachment?.workflowId;

      const yamlParseError = getYamlParseError(yaml);
      if (yamlParseError) {
        return createToolResult({
          success: false,
          error: `Invalid workflow YAML: ${yamlParseError}`,
        });
      }

      const lookup = buildLookup(yaml);
      const stepInfo = lookup.steps[stepName];
      if (!stepInfo) {
        return createToolResult({
          success: false,
          error: i18n.translate('workflows.agentBuilder.executeStep.error.stepNotFound', {
            defaultMessage: 'Step "{stepName}" not found in the workflow YAML',
            values: { stepName },
          }),
        });
      }

      const isStepUnsafe = !SAFE_STEP_TYPES.has(stepInfo.stepType);
      const unsafeStep = isStepUnsafe ? stepInfo : findUnsafeStep(stepName, lookup.steps);
      const isCondition = CONDITION_STEP_TYPES.has(stepInfo.stepType);

      // Conditions with unsafe descendants: stub the children and run the
      // condition, no prompt — execution stays side-effect-free.
      if (unsafeStep && isCondition && !isStepUnsafe && unsafeStep.stepId !== stepName) {
        return executeConditionStepWithStubs({
          api,
          yaml,
          stepName,
          workflowId,
          contextOverride,
          context,
        });
      }

      if (unsafeStep) {
        // Standalone (non-interactive) runs cannot prompt — fall back to the
        // existing preview-only result. This keeps background runs / evals /
        // A2A invocations friction-free.
        if (context.executionMode === AgentExecutionMode.standalone) {
          return createUnsafeStepResult({
            api,
            yaml,
            stepName,
            stepInfo,
            unsafeStep,
            context,
          });
        }

        const promptId = `${WORKFLOW_EXECUTE_STEP_TOOL_ID}.${context.callContext.toolCallId}`;
        const status = context.prompts.checkConfirmationStatus(promptId);

        if (status.status === ConfirmationStatus.rejected) {
          return createToolResult({
            success: false,
            error: i18n.translate('workflows.agentBuilder.executeStep.error.userDeclined', {
              defaultMessage: 'User declined to execute this step.',
            }),
          });
        }

        if (status.status === ConfirmationStatus.unprompted) {
          const isDestructive = DESTRUCTIVE_STEP_TYPES.has(unsafeStep.stepType);
          const isContainer = unsafeStep.stepId !== stepInfo.stepId;
          return context.prompts.askForConfirmation({
            id: promptId,
            title: isContainer
              ? i18n.translate('workflows.agentBuilder.executeStep.confirmation.titleContainer', {
                  defaultMessage:
                    'Execute step "{stepName}" ({stepType}) — contains unsafe `{unsafeStepId}` ({unsafeStepType})',
                  values: {
                    stepName,
                    stepType: stepInfo.stepType,
                    unsafeStepId: unsafeStep.stepId,
                    unsafeStepType: unsafeStep.stepType,
                  },
                })
              : i18n.translate('workflows.agentBuilder.executeStep.confirmation.title', {
                  defaultMessage: 'Execute step "{stepName}" ({stepType})',
                  values: { stepName, stepType: stepInfo.stepType },
                }),
            // `||` (not `??`) so empty-string `confirmation_body` falls back to
            // the generated preview instead of rendering a blank dialog body.
            message:
              confirmationBody || buildFallbackPreview(stepInfo, unsafeStep, contextOverride),
            confirm_text: i18n.translate(
              'workflows.agentBuilder.executeStep.confirmation.confirmText',
              { defaultMessage: 'Run step' }
            ),
            cancel_text: i18n.translate(
              'workflows.agentBuilder.executeStep.confirmation.cancelText',
              { defaultMessage: 'Cancel' }
            ),
            color: isDestructive ? 'danger' : 'warning',
          });
        }

        // accepted → fall through to execute below
      }

      try {
        const { executionId, result } = await executeAndPollStep({
          api,
          yaml,
          stepName,
          workflowId,
          contextOverride,
          spaceId: context.spaceId,
          request: context.request,
        });

        return createToolResult(formatExecutionResult({ executionId, result }));
      } catch (error) {
        return createToolResult(formatToolError(error));
      }
    },
  });
}
