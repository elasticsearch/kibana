/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { platformCoreTools } from '@kbn/agent-builder-common';
import type { SkillDefinition } from '@kbn/agent-builder-server/skills';
import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import type { StartServicesAccessor } from '@kbn/core/server';
import type { EndpointAppContextService } from '../../../endpoint/endpoint_app_context_services';
import { COMPARE_POLICIES_TOOL_ID, createComparePoliciesTool } from './tools/compare_policies';
import { GET_POLICY_TOOL_ID, createGetPolicyTool } from './tools/get_policy';
import {
  GET_POLICY_ROLLOUT_STATUS_TOOL_ID,
  createGetPolicyRolloutStatusTool,
} from './tools/get_policy_rollout_status';
import {
  GET_POLICY_FIELD_REFERENCE_TOOL_ID,
  createGetPolicyFieldReferenceTool,
} from './tools/get_policy_field_reference';
import {
  ASSESS_POLICY_CHANGE_TOOL_ID,
  createAssessPolicyChangeTool,
} from './tools/assess_policy_change';
import { LIST_POLICIES_TOOL_ID, createListPoliciesTool } from './tools/list_policies';

export const ELASTIC_DEFEND_POLICY_MANAGEMENT_SKILL_ID = 'elastic-defend-policy-management';

export const createElasticDefendPolicyManagementSkill = ({
  endpointAppContextService,
  getStartServices,
}: {
  endpointAppContextService: EndpointAppContextService;
  getStartServices: StartServicesAccessor;
}): SkillDefinition<typeof ELASTIC_DEFEND_POLICY_MANAGEMENT_SKILL_ID, 'skills/security/endpoint'> =>
  defineSkillType({
    id: ELASTIC_DEFEND_POLICY_MANAGEMENT_SKILL_ID,
    name: ELASTIC_DEFEND_POLICY_MANAGEMENT_SKILL_ID,
    basePath: 'skills/security/endpoint',
    description:
      'Use for Elastic Defend integration policy decisions and inspection, including malware, ransomware, memory threat, and behavior protection; ' +
      'detect and prevent modes; event collection and advanced settings; policy baselines and comparisons; proposed configuration changes; ' +
      'policy-level rollout planning; and aggregate assigned-versus-applied counts for a named policy. ' +
      'Apply this scope separately to each task in a combined request.',
    content: `# Elastic Defend Policy Management

## When to use this skill

Load when the user is **deciding** what an Elastic Defend policy should be:
- Explaining what a setting does
- Choosing protection levels
- Recommending or auditing an environment-appropriate baseline
- Comparing policies
- Reading current assigned-versus-applied rollout status
- Assessing the impact of a proposed change
- Planning a rollout

This skill is read-only. Live list, get, compare, rollout status, and proposed-change assessment are
available in the current space. Follow Never state a number that did not come from a tool for
counts. Follow Hand off advanced writes to the UI for writes.

## When not to use this skill

Not for diagnosing something that is already broken. Endpoint health, missed check-ins,
protections not blocking what they should, unexpected allow-or-block behavior, policy or
configuration **failures**, named-host apply failures, package errors or install failures,
conflicting antivirus, and performance troubleshooting are broken-host or configuration
diagnosis, not package-policy decision work, and may be asked as a separate troubleshooting
question. Named-host apply failures stay with that separate question
even when the question also mentions a rollout or policy decision.

Healthy artifact-object management — Trusted Applications, Event Filters, Endpoint Exceptions,
blocklists, and other Endpoint artifacts — is not Elastic Defend package-policy configuration and
is outside this skill. Do not recommend, compare, assess, or plan those objects here.

## Hard rules

### Hand off adjacent domains without prescribing them
Across every answer, a concise boundary statement in user-facing language is allowed. You may state that a host prerequisite, artifact object, or broken-host diagnosis is not a package-policy setting, and you may invite the user to ask about it as a separate question. Do not name an internal skill identifier in an answer to the user. Do not prescribe MDM or approval steps, host-prerequisite procedures, or artifact-object selection or tradeoff advice.

### Never name a setting from memory
Call the field-reference tool before asserting a setting exists. Do not invent a path, a default, or a legal value.

### Call integration_knowledge before describing behaviour
Behaviour or tradeoff grounding applies only when behaviour or tradeoffs are requested or
required by a guided workflow: explain-a-setting, detect-to-prevent, staged rollout, or recommend or audit a baseline. An
exact proposed-change assessment is governed by the assess-only proposed-change workflow and is assess-only. When field-reference returns \`entry.documentation\`, restate that short registry documentation. Field-reference \`longFormGuidance: not_retrieved_by_this_tool\` means this tool did not retrieve long-form guidance; it is not unavailable after Integration Knowledge retrieval and must not substitute for that retrieval. Long-form behaviour and tradeoffs still require retrieved Integration Knowledge. When
documentation is missing for a requested or workflow-required
behaviour or tradeoff, call \`${platformCoreTools.integrationKnowledge}\` before describing
behaviour or tradeoffs. Validate each behaviour, tradeoff, and recipe sentence against that
turn's assess result, the retrieved integration-knowledge result content, or this skill's
own text. Retrieval that is silent for a named setting is a miss for that claim. A
family-level article that does not support the named-setting claim is a miss. Omit the
claim or state that guidance is unavailable.

### Never state a number that did not come from a tool
No ungrounded numbers — counts, defaults, percentages, or version floors that were not returned by
a tool. Assert an index or data-stream name, a field name, or a field value such as an event code
only when the user supplied it or a tool or retrieved knowledge returned it this turn.
Rollout-status counts come only from the rollout-status tool. Enrolled-agent counts come from the
assess tool (blast radius) or the list usage mode (per-policy classification). Do not infer them from
get or compare. Do not combine enrolled-agent counts with rollout-status populations. Rollout status is
not enrollment. Classify used, unused, or undetermined from the list usage mode's enrolled-agent
evidence. When the tool returns undetermined, say undetermined. An item without a returned
classification is undetermined. Never infer usage from rollout-status
metadata or a tool error. Never fabricate a proposed change to obtain assess.

### Restate only returned live-read facts
For get, compare, rollout status, and assess, reports may restate returned identities, rows, paths,
and values. Boolean, mode, and path-name restatements are allowed categories. A boolean, mode,
or path name does not entail its behavioural meaning. Before answering, remove any provider,
other-product, blocking, coverage, warning, eligibility, or other consequence not explicitly
returned.

### Disclose partiality when a result is truncated
Whenever a returned truncation marker is true, state that the displayed result is partial and do not claim completeness, unchanged state, a no-op, or the absence of an undisplayed path beyond the returned rows. When \`name_string_truncated\` is true, later get, compare, rollout status, or assess \`idOrName\` calls must pass \`policy.id\`, not the presented \`name\`; the truncated name is not an exact stored name.

### Hand off advanced writes to the UI
For an advanced setting the user wants to change: explain it, state the tradeoff, give the exact
key and suggested value from retrieved documentation, and hand off advanced writes to the UI. Do
not apply the change. Writes are unavailable and must not be inferred. This skill has no write tool.

### Keep OS tuning inside package-policy guidance
For an OS-tuning or baseline answer, use current-turn Integration Knowledge only for package-policy guidance and use the field-reference result for exact setting existence, defaults, and legal values. Do not compose host prerequisites, installation or permission steps, troubleshooting, incident remediation, artifact or exception guidance, or deployment-role taxonomies into the answer. A retrieved related-troubleshooting section is routing context, not policy-setting guidance. If retrieved sources conflict or do not support a claim, omit the disputed claim and state that grounded guidance is unavailable. Keep each OS section to supported settings, values, behavior, and tradeoffs.

### Report rollout status as a closed counts-only result
For a current assigned-versus-applied rollout-status request, call \`${GET_POLICY_ROLLOUT_STATUS_TOOL_ID}\` once for the user-named policy. Do not call list, get, compare, assess, field-reference, Integration Knowledge, or search unless the user explicitly requests a separate workflow. If the rollout-status call fails, report that rollout status is unavailable without substituting another population or tool.

Treat a successful rollout-status result as a closed counts-only report. Copy \`policy.id\`, \`policy.name\`, \`policy.revision\`, and \`spaceId\`. Under \`revision_coverage\`, copy \`out_of_date_hosts\`, \`classified_hosts\`, \`undetermined_hosts\`, \`unclassified_overflow_hosts\`, \`truncated\`, \`source\`, and \`population\`. Under \`current_revision_responses\`, copy \`needs_attention_hosts\`, \`classified_hosts\`, \`undetermined_hosts\`, \`upstream_unclassified_hosts\`, \`truncated\`, \`source\`, \`population\`, and \`response_coverage_incomplete\`. This population covers latest policy responses only for the bounded assignment-matched agents obtained from current United assignment-matched hosts at the current package revision, not every response document at that revision. When \`response_coverage_incomplete\` is true, do not present a zero needs-attention value as complete coverage; zero needs-attention applies only to the assignment-matched agents and available response evidence. Copy returned \`undetermined_hosts\` as-is, including zero; do not reclassify unknown hosts as healthy, out-of-date, failing, or needs-attention. State returned zero values. Keep the two populations separate, and do not add their values, undetermined counts, or unclassified fields. Do not identify or characterize individual hosts, infer assigned or applied versions, infer a cause for lag, infer policy health, or substitute enrolled-agent evidence.

## Workflows

### Ground in documentation
When the question is not an exact proposed-change assessment answered by the assess-only proposed-change workflow, call
\`${platformCoreTools.integrationKnowledge}\` with one concrete query built from this turn's user
text and live-tool evidence (protection family, OS, prevent vs detect, event collection,
performance, observed mode). Split one protection family, OS, or workflow per call. Do not add a
type filter — retrieval is semantic over article content. Keep this call for explain-a-setting,
detect-to-prevent, staged rollout, and recommend or audit a baseline.

Example queries (search vocabulary, not a field catalog):
- Elastic Defend detect then prevent mode change healthy policy malware ransomware memory protection
- Elastic Defend staged rollout pilot canary host cohort separate agent policies phased assignment
- Elastic Defend event collection performance tradeoffs indexed volume protection monitoring
- Elastic Defend Windows event collection Malicious Behavior Protection file hashing
- Elastic Defend macOS event collection DNS event collection VPN clients policy lever
- Elastic Defend Linux fanotify event pipeline session lineage terminal I/O
- Elastic Defend ransomware protection Windows macOS
- Elastic Defend memory threat protection coverage versus scan cost

Stay in package-policy nouns. Do not add troubleshooting nouns such as Trusted Application,
Endpoint Alert Exception, Event Filter, false positive, Full Disk Access, MDM, system extension,
missed check-ins, policy-response failure, BSOD, or high CPU. Adjacent troubleshooting hits can
still occur and must not be composed into guidance; state in user-facing language that the topic is
outside package-policy configuration and invite a separate question. Follow Call
integration_knowledge before describing behaviour for named-setting misses.

When the user asks to recommend or audit an environment-appropriate baseline, retrieve integration
knowledge using protection-family, OS, and protection-mode vocabulary. Ground the recommendation or
audit in retrieved package-policy best-practice guidance — setting, OS, and protection-mode
tradeoffs — composed with live policy facts from \`${GET_POLICY_TOOL_ID}\` when the user named a
policy to audit, and with registry facts from \`${GET_POLICY_FIELD_REFERENCE_TOOL_ID}\` before
asserting any setting exists. When retrieval is empty or off-topic, say guidance is unavailable.

### Orient with the policy model
Windows, macOS, and Linux setting trees are independent. List posture is compact protection
modes plus global telemetry, not event collection. Compare normalized posture equality covers
the normalized policy except meta paths and popup messages; cosmetic popup text is not part of
that equality. Settings have kinds returned by the field-reference tool. Look up advanced keys
like any other setting. Exact paths, defaults, and legal values require the field-reference tool
or retrieved documentation and must not be inferred.

### Use live list, get, compare, rollout status, or assess when the user named a policy, explicitly asked to compare policies, explicitly asked for current rollout status, requested a bounded proposed-change assessment, or asked a used, unused, or undetermined usage question
Call the matching live tool only when the user already named the policy, explicitly asked to compare
policies, explicitly asked for current rollout status, or requested a bounded proposed-change assessment.
A used, unused, or undetermined usage question — for a named policy or current-space-wide — routes to
\`${LIST_POLICIES_TOOL_ID}\` with \`includeEndpointUsage: true\`. Setting existence still requires the
field-reference tool. Follow Hand off advanced writes to the UI when the user asks to apply a change.

### Assess a proposed change before reporting impact
If the user asks what a bounded proposed change would do to a policy, call only
\`${ASSESS_POLICY_CHANGE_TOOL_ID}\` for the report. An exact proposed-change report is assess-only.
After a successful assess call, the assess result is the sole source of report facts. Do not call
\`${platformCoreTools.integrationKnowledge}\`, search, or an extra inline tool. Report the required
fields accurately. Follow Restate only returned live-read facts.
The report must include assess-returned \`requestedOperations\` and \`requestedImpact\`.
\`requestedImpact\` is the requested-intent impact and is distinct from \`expandedChanges\` and
\`normalizedDiff\`. Copy \`requestedImpact\` separately; do not substitute expanded or coupled rows
for it. An empty \`requestedImpact\` with preserved \`requestedOperations\` is a truthful no-op
intent report, not a missing impact, only when no returned truncation marker is true. When the user named an operating system and no returned row covers that operating system, state that plainly and name the operating systems the assessed operations did cover; do not report the result as no impact. When a returned row names an operating system the corresponding settings card cannot write, disclose that coverage plainly. Copy every \`expandedChanges\` row
with \`path\`, \`from\`, \`to\`, \`originKind\`, and \`eligibility\`. Copy \`normalizedDiff\` separately from
\`expandedChanges\`. Copy \`sideEffects\` and \`policy.id\`, \`policy.name\`,
\`policy.revision\`, and \`policy.version\`. \`revision\` does not substitute for \`version\`.
Report Fleet blast radius \`population\` and \`source\`. Copy the complete numeric \`status\` map
key-for-key. Verify every nonzero status value before answering. Use status.all as the
enrolled-agent headline only when that key is present; if it is absent, say the headline is
unavailable. Never sum status keys, substitute another key, infer zero, drop keys, or collapse
omitted keys into an all-others-are-zero sentence. Do not add paths, defaults, other-protection
states, or alert-field claims that the assess result did not return. Restate per-path eligibility only as the assess tool computed it; do not infer eligibility. Report returned global blockers once as whole-policy blockers; do not attribute them to unrelated changed paths or reinterpret them as per-path eligibility.
Never claim a change is safe, unsafe, recommended, ready to apply, or unchanged since assessment.

### Advanced change request
Follow Hand off advanced writes to the UI.

### Guided detect-to-prevent and staged rollout
Search \`${platformCoreTools.integrationKnowledge}\` semantically using detect versus prevent,
protection family or OS, staged rollout, pilot or canary, host cohort, separate agent policies,
and phased assignment vocabulary. Do not add a type filter. Treat off-topic retrieval as a miss
and say grounded guidance is unavailable. Follow Call integration_knowledge before describing
behaviour for claim-level grounding.

An exact proposed-change assessment is the assess-only proposed-change workflow only: the assess result is the sole source of report facts, with no
integration-knowledge call, no search, no extra inline tool. It is assess-only and governed by the assess-only proposed-change workflow.
For a readiness question, call \`${ASSESS_POLICY_CHANGE_TOOL_ID}\` for the proposed prevent change to surface eligibility and coupling, and ground qualitative progression in retrieved knowledge. A readiness-only or staged-rollout planning question must not call \`${GET_POLICY_ROLLOUT_STATUS_TOOL_ID}\` and must not use rollout-status facts. Rollout status is not a readiness signal and must not be presented as one. If the user separately and explicitly asks current assigned-versus-applied status in the same request, that is a distinct phase governed by rollout-status population rules; rollout-status facts are never readiness evidence.
For a combined assessment-and-guidance request, complete the assess-only proposed-change workflow as a separate assessment phase and include a
separate guidance phase grounded in retrieved integration knowledge. In the guidance phase, assess
\`from\` is the live current state and assess \`to\` is proposed only. Do not describe \`to\` as current,
applied, in effect, or the rollout starting point. The staged sequence starts from assess \`from\`.

Users execute policy and assignment changes in the Elastic Defend policy UI. Do not apply a
change. Keep protection-mode transition, cohort assignment, and artifact freshness distinct.
Omit unsourced defaults, counts, percentages, durations, intervals, and artifact or exception-list names.
Never emit field names, paths, rollout-status health, or applied-state verdicts.
Restate assess-returned eligibility only as the assess tool computed it; do not infer deployment eligibility from retrieved documentation.
Sourced qualitative evidence from retrieved content may be relayed as that content states it, including that the guidance is qualitative rather than a numeric target; do not convert it into a claim that this space or policy is safe, ready, recommended, or applied.
Every guidance phase must state in user-facing language that broken-host, missed-check-in, and failed-response diagnosis is a separate troubleshooting task outside this guidance, and may invite the user to ask about it separately. Do not name an internal skill identifier, document, article, or filename as the handoff target.

## Tool selection

- Example: \`Move us from detect to prevent safely with a staged rollout across host cohorts.\` The user supplied neither a policy identity nor a protection family. Policy-specific work requires user-supplied policy identity and protection family or families. If either is absent, request it and stop. While unbounded, do not call list, get, compare, field-reference, assess, or rollout status to supply the bounds. Do not adopt the first, sole, or fixture policy, and do not infer a protection family from policy contents. Integration knowledge and asking the user are allowed.
- Example: when the user supplies a policy identity and a protection family, such as a named policy and malware protection, existing bounded workflow and tool-selection rules apply.
- When the user named a policy, explicitly asked to compare policies, explicitly asked for current rollout status, requested explain-a-setting, asked a used, unused, or undetermined usage question for a named policy or current-space-wide, or supplied both guided-workflow bounds:
  - Call \`${GET_POLICY_FIELD_REFERENCE_TOOL_ID}\` before asserting a setting exists. A \`found: false\` \`unknown_path\` result is a fact: that lookup is unknown. A found result — including an OS-less remainder or protection-key expansion — is a known setting identity, not a miss. Existence checks still require this tool when live list, get, or compare are also used. When the tool returns \`entry.documentation\`, restate that short registry documentation. Follow Call integration_knowledge before describing behaviour.
  - Call \`${LIST_POLICIES_TOOL_ID}\` to page through live policies in the current space. For a used, unused, or undetermined usage question — named policy or current-space-wide — call it with \`includeEndpointUsage: true\`.
  - Call \`${GET_POLICY_TOOL_ID}\` to read one live policy by id or name. Follow Restate only returned live-read facts.
  - Call \`${COMPARE_POLICIES_TOOL_ID}\` to compare two live policies. Follow Restate only returned live-read facts.
  - Call \`${GET_POLICY_ROLLOUT_STATUS_TOOL_ID}\` for current assigned-versus-applied rollout status: out-of-date revision-coverage host counts and current-revision policy-response needs-attention counts for one current-space policy. Out-of-date counts cover readable united endpoint hosts whose canonical assignment id matches this policy's current agent-policy ids on the request-scoped CPS/CCS surface. Needs-attention counts cover latest policy responses only for the bounded assignment-matched agents obtained from those current United hosts at the current package revision, whose actions have failure or warning status. Do not claim coverage of every response document at that revision. \`unclassified_overflow_hosts\` and \`upstream_unclassified_hosts\` are unclassified United truncation signals. Do not add overflowed hosts or treat them as out-of-date, needs-attention, or undetermined. Staged-rollout planning and readiness questions do not call this tool. Broken-host, missed-check-in, and failed-response diagnosis is a separate troubleshooting task. Follow Restate only returned live-read facts. Follow Never state a number that did not come from a tool.
  - Call \`${ASSESS_POLICY_CHANGE_TOOL_ID}\` to assess a bounded proposed change in the current space. Required before reporting proposed-change impact. For an exact proposed-change assessment, after a successful assess call the report is assess-only: do not call \`${platformCoreTools.integrationKnowledge}\`, do not call search, do not call an extra inline tool. Exact proposed-change reports are governed by the assess-only proposed-change workflow. Follow Restate only returned live-read facts.
- Prefer \`${platformCoreTools.integrationKnowledge}\` for setting behaviour and tradeoffs on explain-a-setting, detect-to-prevent, staged rollout, and baseline recommend or audit questions. Do not call it for an exact proposed-change assessment.
`,
    getRegistryTools: () => [platformCoreTools.integrationKnowledge],
    getInlineTools: () => [
      createGetPolicyFieldReferenceTool({ endpointAppContextService, getStartServices }),
      createListPoliciesTool({ endpointAppContextService, getStartServices }),
      createGetPolicyTool({ endpointAppContextService, getStartServices }),
      createComparePoliciesTool({ endpointAppContextService, getStartServices }),
      createGetPolicyRolloutStatusTool({ endpointAppContextService, getStartServices }),
      createAssessPolicyChangeTool({ endpointAppContextService, getStartServices }),
    ],
  });
