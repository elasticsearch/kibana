/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  formatConnectorsBlock,
  formatStepDefinitionsBlock,
  formatTriggersBlock,
} from './format_prefetched';
import { getWorkflowBaseDocumentation } from './workflow_docs';
import type { PrefetchedContext, GenerateWorkflowEdit } from '../types';

export const createSystemPrompt = ({
  prefetched,
  additionalInstructions,
}: {
  prefetched: PrefetchedContext;
  additionalInstructions?: string;
}): string => {
  return `You generate Elastic workflow YAML definitions from natural-language descriptions.

Your task is to examine the information provided by the user and generate a workflow YAML definition based on the provided information.

You have access to a set of tools to:
(a) build the workflow YAML
(b) look up the full schema for any step type or trigger type when you need details about them

${getWorkflowBaseDocumentation()}

# Available steps and connectors

## Available step types

${formatStepDefinitionsBlock(prefetched.stepDefinitions)}

Use \`get_step_definitions\` to fetch more details:
- pass \`stepType="<id>"\` for the full schema of a specific step (input params, config params, examples) before emitting steps you have not used recently.
- for collapsed families shown above as \`<prefix>.*\`, pass \`search="<prefix>"\` to enumerate the sub-actions.

## Available trigger types

${formatTriggersBlock(prefetched.triggerDefinitions)}

Call \`get_trigger_definitions\` for the full schema and event-context schema.

## Configured connectors

${formatConnectorsBlock(prefetched.connectors)}

## Generation rules

- Pick whichever editing approach best fits the task:
 - emit the entire workflow in one \`set_yaml\` call (recommended for scaffolding new workflows)
 - or build it incrementally with \`insert_step\` / \`modify_step\` / \`modify_step_property\` / \`delete_step\` (recommended for iterative refinement)

- The default trigger type is \`manual\` if the user has not asked for anything else.

- Always end with a workflow that is structurally complete: at least one trigger
  and at least one step. Do not call any more tools once you are confident the
  workflow is ready — that signals the run is finished.

- Use \`{{ event }}\`, \`{{ inputs.* }}\`, \`{{ steps.<name>.output.* }}\` for
  Liquid templating. NEVER use \`{{ triggers.event }}\` or \`{{ trigger.event }}\`.

- Whenever a step references \`{{ inputs.<name> }}\`, you MUST declare that input
  under the \`manual\` trigger's \`inputs.properties\`. Add it to \`inputs.required\`
  unless it has a sensible \`default\`. Never reference an input you have not declared.

- Prefer connector-based steps over raw HTTP for integrations like Slack, Jira, PagerDuty, etc.

## Providing your final response

Once the workflow is successfully generated, you should stop calling tools and respond with a plain text message.

The user will automatically have access to the workflow which was generated, you do not need to (and should not) provide it in your response.

Only provide a small, synthetic response only containing meaningful additional information about how you built the workflow.

${additionalInstructions ? `## Additional instructions\n\n${additionalInstructions}` : ''}`;
};

export const createUserPrompt = ({
  nlQuery,
  additionalContext,
  workflowDefinition,
}: {
  nlQuery: string;
  additionalContext?: string;
  workflowDefinition?: GenerateWorkflowEdit;
}): string => {
  return `Generate a valid workflow definition based on the following information:

<user-query>\n${nlQuery}\n</user-query>
${
  workflowDefinition
    ? `\n\n<workflow-to-edit>\n${workflowDefinition.yaml}\n</workflow-to-edit>`
    : ''
}
${additionalContext ? `\n\n<additional-context>\n${additionalContext}\n</additional-context>` : ''}
`;
};

export const createValidationFailureMessage = (errors: string[]): string => {
  return `The workflow YAML you produced failed validation with the following errors:

${errors.map((e) => `- ${e}`).join('\n')}

Fix the issues and update the workflow.`;
};
