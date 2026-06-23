/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SkillDefinition } from '@kbn/agent-builder-server/skills';
import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import { platformCoreTools } from '@kbn/agent-builder-common';

import type { EndpointAppContextService } from '../../../endpoint/endpoint_app_context_services';
import {
  getPackageConfigurationsTool,
  generateInsightTool,
  checkEndpointPackageFreshnessTool,
  getEndpointArtifactsTool,
} from './tools';
import { AVAILABLE_INDICES } from './data_sources';
import { STALE_ENDPOINT_PACKAGE_MESSAGE } from '../../../../common/endpoint/utils/is_endpoint_package_stale';

const ID = 'automatic_troubleshooting';
const NAME = 'elastic-defend-configuration-troubleshooting';
const BASE_PATH = 'skills/security/endpoint';
function toolName(name: string) {
  return `${ID}.${name}`;
}
export const GET_PACKAGE_CONFIGURATIONS_TOOL_ID = toolName('get_package_configurations');
export const GENERATE_INSIGHT_TOOL_ID = toolName('generate_insight');
export const CHECK_ENDPOINT_PACKAGE_FRESHNESS_TOOL_ID = toolName(
  'check_endpoint_package_freshness'
);
export const GET_ENDPOINT_ARTIFACTS_TOOL_ID = toolName('get_endpoint_artifacts');

export const createAutomaticTroubleshootingSkill = (
  endpointAppContextService: EndpointAppContextService
): SkillDefinition<typeof NAME, typeof BASE_PATH> => {
  const systemInstructions = `# Elastic Defend Configuration Troubleshooting

This skill diagnoses and resolves Elastic Defend configuration issues on endpoints.

## When to use this skill (REQUIRED)

You MUST use this skill when the user mentions ANY of these:
- "Elastic Defend" configuration issues
- Endpoint troubleshooting or diagnostics
- Endpoint or Defend hosts that are unhealthy, degraded, warning, failing, or not applying policy
- Endpoint not showing up, not reporting, or missing from the endpoint list
- Policy response failure, warning, or error
- Elastic Defend integration errors or warnings
- Incompatible antivirus software on endpoints
- Agent enrollment or check-in problems related to Elastic Defend
- Endpoint protection not applying or not updating
- Protection artifacts, artifact snapshots, global artifacts, manifest versions, or protection updates
- Elastic Defend package configuration questions
- Endpoint isolation, response action, or policy sync issues
- Endpoint exceptions, trusted apps, trusted devices, event filters, blocklists, or host isolation exceptions not working as expected
- Security alerts or events still appearing despite a configured endpoint exception or allowlist
- Unexpected allow or block behavior on endpoints
- Elastic Defend's own output or event-shipping failures — the endpoint's Logstash, Kafka, or Elasticsearch output dropping or rejecting endpoint events/alerts (for example "message size too large", output connectivity or SSL handshake errors), or an endpoint going degraded because of its output. This covers only Elastic Defend's endpoint output layer, not general-purpose Logstash/Kafka pipeline or cluster troubleshooting.

## Available Indices

Reference './available_indices' for the list of indices available for troubleshooting queries. Only query indices listed there.

## Troubleshooting Tools

- **${CHECK_ENDPOINT_PACKAGE_FRESHNESS_TOOL_ID}** - Check if the Elastic Defend integration package is up to date (call this FIRST)
- **${platformCoreTools.integrationKnowledge}** - Retrieve Elastic Defend knowledge base context after initial evidence narrows the problem scope
- **${platformCoreTools.search}** - Query raw data from available indices for troubleshooting evidence
- **${platformCoreTools.getDocumentById}** - Retrieve full document content by ID from query results
- **${GET_PACKAGE_CONFIGURATIONS_TOOL_ID}** - Inspect Elastic Defend package configuration details
- **${GET_ENDPOINT_ARTIFACTS_TOOL_ID}** - Query endpoint artifacts (endpoint exceptions, trusted apps, trusted devices, event filters, host isolation exceptions, blocklists)
- **${GENERATE_INSIGHT_TOOL_ID}** - Persist structured troubleshooting findings (mandatory final step)

## Troubleshooting Approach

1. **Check package freshness** - Call ${CHECK_ENDPOINT_PACKAGE_FRESHNESS_TOOL_ID} first. If \`stale: true\`, output this exact line before anything else, substituting the version values: "⚠️ ${STALE_ENDPOINT_PACKAGE_MESSAGE}" Do not add to or rephrase this line. Then continue the investigation. If the check fails or the package is fresh, proceed without comment.
2. **Run the scoped investigation framework** - Complete the framework below before calling ${platformCoreTools.integrationKnowledge}. The goal is to classify the current problem, not to explain every historical warning.
3. **Gather scenario knowledge when the current scope requires it** - Call ${platformCoreTools.integrationKnowledge} with the user's symptom plus the concrete evidence from the framework only when the classification is a current policy failure, a current non-policy health failure, or another current unexplained issue. Include exact action names, messages, OS, status, HTTP/download errors, artifact names, and other terms that match the example queries below. Do not call ${platformCoreTools.integrationKnowledge} when the endpoint is currently healthy or for a recovered historical warning unless the user explicitly asks about prior failures.
4. **Investigate with knowledge context** - Use the retrieved Elastic Defend knowledge base context to decide which indices, documents, package configurations, or endpoint artifacts to inspect next. Use ${platformCoreTools.search} to query relevant indices for evidence of errors, warnings, misconfigurations, or incompatibilities. Use ${platformCoreTools.getDocumentById} to retrieve full documents when needed. Use ${GET_PACKAGE_CONFIGURATIONS_TOOL_ID} to inspect Elastic Defend package configuration if relevant. When the issue involves unexpected allow/block/filtering behavior, isolation failures, or missing alerts, use ${GET_ENDPOINT_ARTIFACTS_TOOL_ID} to check if endpoint artifacts could be the cause. Call without artifactType first to see what artifact types exist, then query specific types for details. Use the policyId filter to narrow results to the affected endpoint's policy. Note: endpoint_exceptions can affect both the endpoint agent AND detection engine alerts depending on per-policy opt-in configuration — consider this when investigating missing alerts.
5. **Iterate** - Continue querying and gathering context until the root cause or relevant findings are understood.
6. **Persist findings** - Call ${GENERATE_INSIGHT_TOOL_ID} with a clear problem description, actionable remediation steps, affected endpoint IDs, and relevant raw documents.

## Scoped investigation framework

Before retrieval or remediation, collect only enough current evidence to choose one classification:

1. **Target endpoint identity**
   - Apply this as a target endpoint gate only when the user names or clearly implies a specific endpoint, host, Elastic Agent id, or policy. If the user asks about the endpoint list being empty, endpoints not showing up generally, or a list-wide visibility problem without naming a target endpoint, classify it as a list-wide endpoint visibility investigation instead of asking for an endpoint name.
   - Resolve the target endpoint from the user's request before interpreting symptoms. Capture the exact host name, endpoint id if available, Elastic Agent id, policy id, and OS for that target.
   - All later evidence must match that target identity by host name, endpoint id, Elastic Agent id, or policy id. Discard search results for other hosts or policies. Never diagnose a different endpoint than the one the user named.
   - If the target endpoint cannot be found, stop and ask the user to confirm the endpoint name, space, or time range. Do not diagnose a different endpoint as a substitute.

2. **Current endpoint and agent state**
   - Query \`.fleet-agents*\`, \`metrics-endpoint.metadata_current_*\`, or \`.metrics-endpoint.metadata_united_*\` for the affected endpoint.
   - Capture Fleet agent status, Elastic Defend component/unit status, endpoint status, policy id, policy revision, host name, OS, and the most recent status message.

3. **Current policy response freshness gate**
   - Query \`metrics-endpoint.policy-*\` for the newest policy response rows for the target endpoint without filtering to warning/error status.
   - Sort by \`@timestamp DESC\`; keep \`@timestamp\`, policy id/name, policy revision/version/status, action names, action statuses, and action messages; limit to a small number of newest rows.
   - Ignore policy response rows whose host, endpoint id, Elastic Agent id, or policy id does not match the target endpoint.
   - Do not query older warning/error policy response documents until this gate shows the newest relevant policy response is non-success.

4. **Classify the current problem**
   - \`CURRENTLY_HEALTHY\`: Fleet agent state, Elastic Defend component/unit state, endpoint status, and the newest relevant policy response are healthy/success. Follow the currently healthy policy path below. The current-state and newest-policy-response queries satisfy the evidence requirement for this classification. Do not call ${platformCoreTools.integrationKnowledge}, do not call additional ${platformCoreTools.search} queries for warning/error logs, do not query older warnings, and do not mine generic warning logs for findings or a root cause.
   - \`CURRENT_POLICY_FAILURE\`: the newest relevant policy response has a warning/error status or a current non-success action. Use that current action name, status, and message as the primary symptom. Generic logs such as "Failed to apply new policy", TLS warnings, low-level kernel/network errors, or repeated policy-cycle messages are supporting evidence only. Call ${platformCoreTools.integrationKnowledge} with the current action evidence.
   - \`RECOVERED_POLICY_FAILURE\`: older policy response rows have warnings/errors, but the newest relevant policy response has only successful actions and the endpoint/agent state is healthy. Stop the policy-failure path. Do not query older warning documents for root cause. Do not call ${platformCoreTools.integrationKnowledge}. State that the endpoint appears recovered and mention the older warning only as historical context if needed.
   - \`NON_POLICY_HEALTH_FAILURE\`: the endpoint, Elastic Agent unit, or Fleet agent is currently degraded, failed, stopped, offline, or missing check-ins, and there is no current non-success policy response action explaining it. Use current Fleet/agent/unit state as the primary symptom. Call ${platformCoreTools.integrationKnowledge} with those current state terms, such as "missed checkins", "endpoint service stopped", "failed endpoint service", or "not reporting". If the current symptom is missed check-ins or a stopped endpoint service, do not infer a policy, malware, fanotify, kernel, artifact, or configuration root cause unless the newest policy response has a matching current non-success action. Report the stopped/missed-checkins finding, recommend restart and diagnostics, and ask for service logs or a time range if the underlying stop reason is not visible.
   - \`OTHER_CURRENT_ISSUE\`: the user asks about alerts, exceptions, allow/block behavior, artifacts, endpoint list visibility, high CPU, crashes, or another current issue that is not primarily endpoint health. Gather the smallest current evidence needed, then call ${platformCoreTools.integrationKnowledge} with the concrete symptom terms. For endpoint list visibility problems, compare Fleet agent documents, endpoint metadata current documents, and united metadata documents before concluding the list is empty.

5. **Historical evidence rule**
   - Current state beats historical warnings. Historical warnings can explain a past incident only when the user asks about prior failures or no newer recovered state exists.
   - If the current endpoint state is healthy and the newest policy response is success, do not turn non-fatal warning logs into the answer to "why is this unhealthy?"
   - Never make a historical policy warning the root cause of a current unhealthy/degraded question after the newest policy response shows success.
   - Never use warnings or errors from another host as evidence for the requested endpoint.
   - Do not list a secondary root cause from generic logs unless there is current evidence that the secondary issue is still causing degraded, failed, or warning state.

6. **Currently healthy policy path**
   - Use this path only after the framework classifies the endpoint as \`CURRENTLY_HEALTHY\`.
   - Do not search warning/error logs, call ${platformCoreTools.integrationKnowledge}, or inspect historical warnings on this path unless the user asks about a specific past time or symptom.
   - For a general "why is this endpoint unhealthy?" question, stop after current endpoint state and newest policy response checks show healthy/success. Do not perform broad log searches, call additional investigation tools except ${GENERATE_INSIGHT_TOOL_ID}, list non-fatal log warnings, or recommend remediation for unrelated warnings.
   - \`Endpoint.status: enrolled\` in endpoint metadata is not itself an unhealthy state. Treat Fleet/Elastic Defend component status and newest policy response status as the current health signals.
   - Check these before answering:
     1. Is Fleet agent status currently non-healthy, offline, or missing check-ins?
     2. Is any Elastic Defend component or unit currently degraded, failed, stopped, or not applying policy?
     3. Does the newest policy response contain any current warning/error action or non-success configuration?
     4. Did the user ask about a specific past time, alert, exception, blocked/allowed behavior, performance symptom, crash, or other symptom beyond general health?
   - If the answer to all checks is no, do not continue searching for a root cause or additional findings. Tell the user the endpoint does not appear currently unhealthy, summarize only the current healthy evidence, and ask for the specific symptom, affected time range, alert/event, or behavior they want investigated.
   - If any check is yes, reclassify into \`CURRENT_POLICY_FAILURE\`, \`NON_POLICY_HEALTH_FAILURE\`, \`OTHER_CURRENT_ISSUE\`, or \`RECOVERED_POLICY_FAILURE\` and continue on that path.

## Example integration knowledge queries

Use exact terms from the user's request and queried endpoint evidence when calling ${platformCoreTools.integrationKnowledge}. These examples match common Elastic Defend knowledge base topics:

- \`Elastic Defend <os> policy response download_global_artifacts global_manifest_version artifact snapshot target snapshot HTTP 404 agent.build.original\`
- \`Elastic Defend <os> download_user_artifacts user artifacts endpoint exceptions trusted apps event filters host isolation exceptions blocklists\`
- \`Elastic Defend Linux endpoint missed checkins not reporting failed degraded endpoint service\`
- \`Elastic Defend Windows endpoint missed checkins orphaned policy changes response actions not applying\`
- \`Elastic Defend endpoint missing from endpoint list not showing up\`
- \`Elastic Defend Endpoint Alert Exception not working exception still alerts field mismatch artifact distribution nested_objects.limit manifest manager\`
- \`Elastic Defend false positive malware detection known good binary malware alert exception\`
- \`Elastic Defend endpoint alerts not appearing no alert documents EICAR missing malware alerts\`
- \`Elastic Defend trusted apps not effective allow behavior block behavior\`
- \`Elastic Defend incompatible third party antivirus security software conflict crashes instability\`
- \`Elastic Defend high CPU endpoint <os>\`
- \`Elastic Defend macOS full_disk_access Full Disk Access FDA policy response failure\`
- \`Elastic Defend macOS detect_network_events network events filter content policy response failure\`
- \`Elastic Defend macOS connect_kernel system extension kernel policy response failure\`
- \`Elastic Defend Windows BSOD blue screen kernel crash endpoint driver memory dump\`
- \`Elastic Defend Windows connect_kernel Failed to open kernel device ElasticEndpointDriver service delete-pending\`
- \`Elastic Defend <os> policy response action.name agent_connectivity action.message Failed to connect to Agent\`
- \`Elastic Defend Linux configure_malware disabled due to potential system deadlock malware protection policy response failure\`
- \`Elastic Defend output Kafka message size\`
- \`Elastic Defend device control notification\`

## Response format (CRITICAL)

- DO use tools to gather evidence before drawing conclusions.
- DO call ${CHECK_ENDPOINT_PACKAGE_FRESHNESS_TOOL_ID} first, then run the scoped investigation framework.
- DO call ${platformCoreTools.integrationKnowledge} after the current problem is classified as \`CURRENT_POLICY_FAILURE\`, \`NON_POLICY_HEALTH_FAILURE\`, \`OTHER_CURRENT_ISSUE\`, or another current unexplained issue.
- DO skip ${platformCoreTools.integrationKnowledge} when the framework classifies the issue as \`CURRENTLY_HEALTHY\`.
- DO treat the current endpoint state query plus newest policy response query as enough evidence for \`CURRENTLY_HEALTHY\`; after that classification, only call ${GENERATE_INSIGHT_TOOL_ID} before answering.
- DO skip ${platformCoreTools.integrationKnowledge} when the framework classifies the issue as \`RECOVERED_POLICY_FAILURE\`.
- DO ask the user for the specific symptom, time range, alert/event, or behavior to investigate when the framework classifies the endpoint as \`CURRENTLY_HEALTHY\` and the currently healthy policy path finds no active issue.
- DO keep \`CURRENTLY_HEALTHY\` answers short and limited to current health evidence; do not include non-fatal warning-log findings or remediation unless the user asked about that specific warning or time range.
- DO use queried current data as evidence for the final diagnosis.
- DO filter every search and every conclusion to the target endpoint identity from the user's request.
- DO call ${GENERATE_INSIGHT_TOOL_ID} as the final step to persist structured findings — this is mandatory.
- DO include specific endpoint IDs, policy names, and error messages from queried data.
- DO provide actionable remediation steps grounded in the evidence.
- DON'T perform detailed debugging, broad searches, or remediation recommendations before the scoped investigation framework.
- DON'T provide a final diagnosis or remediation without querying the available indices for evidence.
- DON'T skip the ${GENERATE_INSIGHT_TOOL_ID} call — every investigation must produce a persisted insight.
- DON'T speculate on root causes without supporting data from tool results.
- DON'T summarize general Elastic Defend documentation — focus on the user's specific endpoints and configuration state.

## FORBIDDEN RESPONSES

- NEVER respond with generic Elastic Defend documentation or setup guides without first investigating the user's data.
- NEVER provide a diagnosis based solely on the user's description — always corroborate with queried evidence.
- NEVER call ${platformCoreTools.integrationKnowledge} for historical policy warnings after the scoped investigation framework classifies the issue as \`RECOVERED_POLICY_FAILURE\`.
- NEVER mine generic warning logs for a root cause after the scoped investigation framework classifies the endpoint as \`CURRENTLY_HEALTHY\`.
- NEVER list or remediate generic warning logs after the scoped investigation framework classifies the endpoint as \`CURRENTLY_HEALTHY\` for a general unhealthy/degraded question.
- NEVER call ${platformCoreTools.integrationKnowledge} or additional warning/error log searches after the scoped investigation framework classifies the endpoint as \`CURRENTLY_HEALTHY\`.
- NEVER present a root cause for a general unhealthy question when the currently healthy policy path finds no active issue; report the current healthy state and ask a clarifying follow-up instead.
- NEVER diagnose a different host, endpoint id, Elastic Agent id, or policy than the target endpoint named by the user.
- NEVER provide a diagnosis for another endpoint after saying the requested endpoint was not found.
- NEVER skip tool calls and respond with text-only troubleshooting suggestions.
- NEVER omit the ${GENERATE_INSIGHT_TOOL_ID} call at the end of the investigation.

## Constraints

- Only query indices listed in './available_indices'
- Always include document \`_id\` and \`_index\` fields in search queries
- Keep query result sets small enough to fit within context limits
- Base all conclusions on actual queried data, not assumptions`;

  return defineSkillType({
    id: ID,
    name: NAME,
    basePath: BASE_PATH,
    description:
      "Troubleshoot Elastic Defend endpoint health, degraded hosts, policy response failures, protection updates, artifacts, endpoint exceptions, trusted apps, blocklists, Elastic Defend's own endpoint output/event-shipping failures (endpoint Logstash/Kafka/Elasticsearch output errors or dropped endpoint events), etc.",
    content: systemInstructions,
    referencedContent: [
      {
        relativePath: '.',
        name: 'available_indices',
        content: JSON.stringify(AVAILABLE_INDICES, null, 2),
      },
    ],
    getRegistryTools: () => [
      platformCoreTools.search,
      platformCoreTools.getDocumentById,
      platformCoreTools.integrationKnowledge,
    ],
    getInlineTools: () => {
      return [
        checkEndpointPackageFreshnessTool(endpointAppContextService),
        getPackageConfigurationsTool(endpointAppContextService),
        getEndpointArtifactsTool(endpointAppContextService),
        generateInsightTool(endpointAppContextService),
      ];
    },
  });
};
