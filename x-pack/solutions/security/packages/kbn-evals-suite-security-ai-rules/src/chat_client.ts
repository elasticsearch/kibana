/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { agentBuilderDefaultAgentId } from '@kbn/agent-builder-common';
import type { ReferenceRule } from '../datasets/sample_rules';

// These string literals mirror the constants defined in security_solution/common/constants.
// They are inlined here to avoid a package→plugin import boundary violation.
const SECURITY_RULE_ATTACHMENT_TYPE = 'security.rule';

// Drive the default Agent Builder agent (`elastic-ai-agent`). The detection-rule
// creation tool (`security.create_detection_rule`) is registered globally via
// `agentBuilder.tools.register(...)` in
// `security_solution/server/agent_builder/tools/register_tools.ts`, so it is
// available to the default agent — there is no separately-registered
// `security.agent`. Allow an explicit override for deliberate custom-agent runs.
const RULE_GENERATION_AGENT_ID = process.env.AGENT_BUILDER_AGENT_ID ?? agentBuilderDefaultAgentId;

const AGENT_BUILDER_CONVERSE_API_PATH = '/api/agent_builder/converse';
const SECURITY_CREATE_DETECTION_RULE_TOOL_ID = 'security.create_detection_rule';

export type EvalFetch = (path: string, options?: Record<string, unknown>) => Promise<unknown>;

interface ToolResult {
  type?: string;
  data?: Record<string, unknown>;
}

interface RuleToolStep {
  type: string;
  tool_id?: string;
  results?: ToolResult[];
}

interface ConverseResponse {
  steps?: RuleToolStep[];
}

interface SecurityRuleGenerationLog {
  warning: (msg: string) => void;
}

export class SecurityRuleGenerationClient {
  constructor(
    private readonly fetch: EvalFetch,
    private readonly log: SecurityRuleGenerationLog,
    private readonly connectorId: string
  ) {}

  public async generateRule(prompt: string): Promise<{
    generatedRule?: Partial<ReferenceRule>;
    error?: string;
    steps?: RuleToolStep[];
  }> {
    const payload = {
      agent_id: RULE_GENERATION_AGENT_ID,
      input: `Create a detection rule based on the following user_query using the dedicated detection rule creation tool. Do not perform any other actions after creating the rule. user_query: ${prompt}`,
      connector_id: this.connectorId,
      capabilities: { visualizations: true },
      attachments: [
        {
          type: SECURITY_RULE_ATTACHMENT_TYPE,
          data: {
            text: '',
            attachmentLabel: 'AI Rule Creation',
          },
        },
      ],
      browser_api_tools: [],
    };

    const syncResponse = (await this.fetch(AGENT_BUILDER_CONVERSE_API_PATH, {
      method: 'POST',
      version: '2023-10-31',
      body: JSON.stringify(payload),
    })) as ConverseResponse;
    const extracted = extractRuleFromSyncResponse(syncResponse);

    if (extracted.ruleData) {
      return {
        generatedRule: mapGeneratedRule(extracted.ruleData),
        steps: syncResponse.steps,
      };
    }

    this.log.warning(
      `Agent returned no rule. Error: ${extracted.error ?? 'unknown'}. Diagnostics: ${
        extracted.diagnostics
      }`
    );
    return {
      error: extracted.error || 'No rule returned from agent',
      steps: syncResponse.steps,
    };
  }
}

const extractRuleDataFromToolResults = (
  results?: ToolResult[]
): {
  ruleData?: Record<string, unknown>;
  error?: string;
} => {
  if (!results?.length) {
    return {};
  }

  for (const result of results) {
    if (result.type === 'error') {
      return {
        error: (result.data?.message as string) || 'Rule generation tool returned an error',
      };
    }

    if (result.type === 'other') {
      const success = result.data?.success;
      const rule = result.data?.rule as Record<string, unknown> | undefined;
      if (success === true && rule) {
        return { ruleData: rule };
      }
      if (success === false) {
        return {
          error: (result.data?.message as string) || 'Rule generation tool reported failure',
        };
      }
    }
  }

  return {};
};

const extractCategory = (ruleName: string): string => {
  const parts = ruleName.toLowerCase().split('_');
  if (parts.length >= 2) {
    const twoWordCategories = ['credential', 'defense', 'command', 'privilege'];
    if (twoWordCategories.includes(parts[0])) {
      return `${parts[0]}_${parts[1]}`;
    }
    return parts[0];
  }
  return 'unknown';
};

/**
 * The agent returns threat objects in the Kibana standard format:
 *   { framework, tactic: { id, name, reference }, technique?: [{ id, name, reference, subtechnique? }] }
 *
 * We flatten these into the simpler RuleThreat format used throughout the eval suite.
 */
const mapThreat = (raw: unknown): ReferenceRule['threat'] => {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((entry: Record<string, unknown>) => {
    const tacticId =
      entry.tactic && typeof entry.tactic === 'object'
        ? ((entry.tactic as Record<string, unknown>).id as string)
        : (entry.tactic as string);

    const techniques = Array.isArray(entry.technique) ? entry.technique : [];

    if (techniques.length === 0) {
      return tacticId ? [{ technique: '', tactic: tacticId }] : [];
    }

    return techniques.map((tech: Record<string, unknown>) => ({
      technique: tech.id as string,
      tactic: tacticId,
      subtechnique: Array.isArray(tech.subtechnique)
        ? ((tech.subtechnique[0] as Record<string, unknown>)?.id as string | undefined)
        : undefined,
    }));
  });
};

const mapGeneratedRule = (ruleData: Record<string, unknown>): Partial<ReferenceRule> => ({
  name: ruleData.name as string,
  description: ruleData.description as string,
  query: ruleData.query as string,
  language: (ruleData.language as string) ?? 'esql',
  type: (ruleData.type as string) ?? 'esql',
  threat: mapThreat(ruleData.threat),
  severity: ruleData.severity as string,
  tags: (ruleData.tags as string[]) || [],
  riskScore: (ruleData.risk_score ?? ruleData.riskScore) as number,
  from: ruleData.from as string,
  interval: ruleData.interval as string,
  category: extractCategory((ruleData.name as string) || ''),
});

const extractRuleFromSyncResponse = (response: ConverseResponse) => {
  const toolSteps =
    response.steps?.filter((step) => {
      const isToolStep = step.type === 'tool_call' || step.type === 'tool_result';
      return isToolStep && step.tool_id === SECURITY_CREATE_DETECTION_RULE_TOOL_ID;
    }) ?? [];
  const lastToolStep = toolSteps.at(-1);
  const extracted = extractRuleDataFromToolResults(lastToolStep?.results);

  return {
    ...extracted,
    diagnostics: JSON.stringify({
      totalSteps: response.steps?.length ?? 0,
      toolCallSteps: toolSteps.length,
      stepToolIds:
        response.steps?.filter((step) => step.type === 'tool_call').map((step) => step.tool_id) ??
        [],
      lastToolResultTypes: lastToolStep?.results?.map((result) => result.type) ?? [],
    }),
  };
};
