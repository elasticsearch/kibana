/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@playwright/test';
import { tags } from '@kbn/scout';
import { evaluate as base } from '../../src/evaluate';
import type { EvaluateDataset } from '../../src/evaluate_dataset';
import { createEvaluateDataset } from '../../src/evaluate_dataset';

/**
 * Evals for the `recommend-prebuilt-rules` skill. Two kinds live in this file:
 *
 * 1. Deterministic precision/grounding checks (raw `converse` + `expect`): when
 *    the user asks for rules covering a MITRE tactic, every rule the skill
 *    surfaces from the installable catalog must actually cover that tactic, etc.
 *    The claims are structural and read straight off the
 *    `security.find_prebuilt_rules` tool call (its `params` and `results`).
 *
 * 2. Skill-routing / boundary checks (LLM-judge dataset examples via
 *    `evaluateDataset`): the agent must invoke this skill for install / browse /
 *    coverage questions about *not-yet-installed* prebuilt rules, and must NOT
 *    invoke it for rule-adjacent questions that belong to a sibling skill
 *    (already-installed rules -> `find-security-rules`, editing a rule ->
 *    `detection-rule-edit`, ML jobs -> `find-security-ml-jobs`, alert triage ->
 *    `alert-analysis`, authoring a custom Alerting V2 / ES|QL rule ->
 *    `rule-management`). These answer "can the agent distinguish when to call
 *    this skill vs. others?" and mirror the find-rules "Boundaries" suite.
 *
 * Requirements for the eval target Kibana:
 * - Start with the `dexAiSkillRecommendPrebuiltRules` experimental flag enabled
 *   (`xpack.securitySolution.enableExperimental`), otherwise the skill is never
 *   registered and the agent cannot route to it.
 * - The boundary examples that route to `find-security-rules` also require the
 *   `dexAiSkillFindRules` flag, so that sibling skill is registered too.
 * - The boundary example that routes to `rule-management` requires the Alerting V2
 *   plugin enabled (`xpack.alerting_v2.enabled: true`); that plugin is disabled by
 *   default, so otherwise its skill is never registered and the agent cannot route
 *   to it.
 * - The bundled `security_detection_engine` package is installed in `beforeAll`
 *   to populate the installable catalog (see below).
 */

const evaluate = base.extend<{ evaluateDataset: EvaluateDataset }, {}>({
  evaluateDataset: [
    ({ chatClient, evaluators, executorClient, traceEsClient, log }, use) => {
      use(
        createEvaluateDataset({
          chatClient,
          evaluators,
          executorClient,
          traceEsClient,
          log,
        })
      );
    },
    { scope: 'test' },
  ],
});

// Tactic under test. The ID is stable across MITRE and rule-package versions, so
// we assert on it rather than rule names/counts. Defense Evasion (TA0005) is one
// of the largest tactics in the bundled catalog, so a tactic query reliably
// returns many installable rules.
const TACTIC_ID = 'TA0005';
const TACTIC_NAME = 'Defense Evasion';

const FIND_PREBUILT_RULES_TOOL_ID = 'security.find_prebuilt_rules';
const GET_CATALOG_OVERVIEW_TOOL_ID = 'security.get_installable_catalog_overview';

// Floor that guards against a vacuous pass: "every returned rule covers the
// tactic" is trivially true on an empty result, so a missing/empty catalog would
// otherwise look green. A real bundled catalog has far more than this for TA0005.
const MIN_EXPECTED_RULES = 3;

// Integration used for the recommendation-scoping test. Okta is the skill's own worked example,
// is identity-domain, and has many installable rules carrying `okta` in their related_integrations.
const INTEGRATION_PACKAGE = 'okta';

// Install the real bundled `security_detection_engine` package via the Fleet EPM
// API. It is bundled with Kibana, so this works offline. Installing the *package*
// only creates `security-rule` *asset* saved objects (the installable catalog) —
// it does not install/enable detection rules — so `find_prebuilt_rules`, which
// only sees not-yet-installed rules, returns the full real catalog. We
// intentionally do not uninstall it in teardown: it is a shared asset other
// security evals also rely on, and leaving it installed is harmless.
const FLEET_BULK_INSTALL_PATH = '/api/fleet/epm/packages/_bulk';

interface ToolCallStep {
  type?: string;
  tool_id?: string;
  params?: { filter?: { mitreTactic?: unknown; tags?: unknown; relatedIntegrations?: unknown } };
  results?: unknown[];
}

interface CatalogRule {
  name?: string;
  threat?: Array<{ tactic?: { id?: string; name?: string } }>;
  related_integrations?: Array<{ package?: string }>;
}

const getFindPrebuiltRulesCalls = (steps: ToolCallStep[]): ToolCallStep[] =>
  steps.filter(
    (step) => step?.type === 'tool_call' && step.tool_id === FIND_PREBUILT_RULES_TOOL_ID
  );

// Did this search route the tactic through the structured `mitreTactic` filter
// (the documented path), rather than falling back to keywords/tags?
const routedToTactic = (step: ToolCallStep): boolean => {
  const mitreTactic = step?.params?.filter?.mitreTactic;
  if (!Array.isArray(mitreTactic)) return false;
  return mitreTactic.some(
    (value) => value === TACTIC_ID || String(value).toLowerCase() === TACTIC_NAME.toLowerCase()
  );
};

// The tool result is `[{ type, data: { total, rules } }]`. Pull the rules array
// out without assuming more about the wrapper than `data.rules`.
const rulesFromStep = (step: ToolCallStep): CatalogRule[] => {
  const results = Array.isArray(step?.results) ? step.results : [];
  for (const result of results) {
    const rules = (result as { data?: { rules?: unknown } })?.data?.rules;
    if (Array.isArray(rules)) return rules as CatalogRule[];
  }
  return [];
};

// A rule covers the tactic if any of its MITRE threat entries names it. Rules are
// multi-tactic, so this is "includes the tactic", not "sole tactic". Works on both
// the triage shape (`threat: [{ tactic: { id, name } }]`) and the full threat shape.
const coversTactic = (rule: CatalogRule): boolean =>
  Array.isArray(rule?.threat) &&
  rule.threat.some(
    (entry) => entry?.tactic?.id === TACTIC_ID || entry?.tactic?.name === TACTIC_NAME
  );

const getCatalogOverviewCalls = (steps: ToolCallStep[]): ToolCallStep[] =>
  steps.filter(
    (step) => step?.type === 'tool_call' && step.tool_id === GET_CATALOG_OVERVIEW_TOOL_ID
  );

// The overview result is `[{ type, data: { total_installable_count, tags: [{ value, count }] } }]`.
// Its tag values are the only legitimate source the skill may draw `tags` filters from.
const catalogTagsFromStep = (step: ToolCallStep): string[] => {
  const results = Array.isArray(step?.results) ? step.results : [];
  for (const result of results) {
    const tagBuckets = (result as { data?: { tags?: unknown } })?.data?.tags;
    if (Array.isArray(tagBuckets)) {
      return tagBuckets
        .map((tag) => (tag as { value?: unknown })?.value)
        .filter((value): value is string => typeof value === 'string');
    }
  }
  return [];
};

// Tag values the agent passed to a `find_prebuilt_rules` `tags` filter.
const tagsFromFilter = (step: ToolCallStep): string[] => {
  const filterTags = step?.params?.filter?.tags;
  return Array.isArray(filterTags)
    ? filterTags.filter((tag): tag is string => typeof tag === 'string')
    : [];
};

// The 14 canonical MITRE ATT&CK Enterprise tactics the skill routes to (its prompt table).
// Unlike tags, tactics are NOT discovered from a tool — they are a fixed set — so the grounding
// source of truth is this constant, and the schema accepts any string, so this guard is real.
const CANONICAL_TACTICS: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'TA0001', name: 'Initial Access' },
  { id: 'TA0002', name: 'Execution' },
  { id: 'TA0003', name: 'Persistence' },
  { id: 'TA0004', name: 'Privilege Escalation' },
  { id: 'TA0005', name: 'Defense Evasion' },
  { id: 'TA0006', name: 'Credential Access' },
  { id: 'TA0007', name: 'Discovery' },
  { id: 'TA0008', name: 'Lateral Movement' },
  { id: 'TA0009', name: 'Collection' },
  { id: 'TA0010', name: 'Exfiltration' },
  { id: 'TA0011', name: 'Command and Control' },
  { id: 'TA0040', name: 'Impact' },
  { id: 'TA0042', name: 'Resource Development' },
  { id: 'TA0043', name: 'Reconnaissance' },
];

const CANONICAL_TACTIC_IDS = new Set(CANONICAL_TACTICS.map((tactic) => tactic.id));
const CANONICAL_TACTIC_NAMES = new Set(
  CANONICAL_TACTICS.map((tactic) => tactic.name.toLowerCase())
);

// A `mitreTactic` value is grounded if it is a canonical TA-ID or a canonical tactic name.
const isCanonicalTactic = (value: string): boolean =>
  CANONICAL_TACTIC_IDS.has(value) || CANONICAL_TACTIC_NAMES.has(value.toLowerCase());

// Tactic values the agent passed to a `find_prebuilt_rules` `mitreTactic` filter.
const tacticsFromFilter = (step: ToolCallStep): string[] => {
  const mitreTactic = step?.params?.filter?.mitreTactic;
  return Array.isArray(mitreTactic)
    ? mitreTactic.filter((value): value is string => typeof value === 'string')
    : [];
};

// Integration package names the agent passed to a `find_prebuilt_rules` `relatedIntegrations` filter.
const relatedIntegrationsFromFilter = (step: ToolCallStep): string[] => {
  const relatedIntegrations = step?.params?.filter?.relatedIntegrations;
  return Array.isArray(relatedIntegrations)
    ? relatedIntegrations.filter((value): value is string => typeof value === 'string')
    : [];
};

// A rule relates to the integration if any of its related_integrations names that package.
const relatesToIntegration = (rule: CatalogRule, pkg: string): boolean =>
  Array.isArray(rule?.related_integrations) &&
  rule.related_integrations.some((integration) => integration?.package === pkg);

evaluate.describe(
  'Security Skills - Recommend Prebuilt Rules',
  { tag: [...tags.serverless.security.complete, ...tags.serverless.security.ease] },
  () => {
    evaluate.beforeAll(async ({ kbnClient, log }) => {
      log.info(
        '[recommend-prebuilt-rules eval] Installing bundled security_detection_engine package...'
      );
      await kbnClient.request({
        path: FLEET_BULK_INSTALL_PATH,
        method: 'POST',
        query: { prerelease: true },
        headers: { 'elastic-api-version': '2023-10-31' },
        body: { packages: ['security_detection_engine'], force: false },
      });
      log.info('[recommend-prebuilt-rules eval] Package install complete');
    });

    evaluate(
      'if user asks for rules covering a certain tactic, only rules that cover that tactic are returned',
      async ({ chatClient }) => {
        const response = await chatClient.converse({
          messages: [
            {
              message: `Which rules can I install to cover the ${TACTIC_NAME} tactic?`,
            },
          ],
        });

        expect(response.errors).toEqual([]);

        const steps = (response.steps ?? []) as ToolCallStep[];
        const findCalls = getFindPrebuiltRulesCalls(steps);

        // The skill must search the installable catalog at least once.
        expect(findCalls.length).toBeGreaterThan(0);

        // Routing: at least one search routed the tactic through `mitreTactic`.
        const tacticCalls = findCalls.filter(routedToTactic);
        expect(tacticCalls.length).toBeGreaterThan(0);

        // Precision: collect every rule returned by the tactic-filtered calls.
        const returnedRules = tacticCalls.flatMap(rulesFromStep);

        // Guard against a vacuous pass on an empty catalog.
        expect(returnedRules.length).toBeGreaterThanOrEqual(MIN_EXPECTED_RULES);

        // Every returned rule must cover the requested tactic. Mapping to names
        // gives a readable failure (the off-tactic rules) instead of a bare count.
        const offTactic = returnedRules
          .filter((rule) => !coversTactic(rule))
          .map((rule) => rule?.name ?? '<unknown>');
        expect(offTactic).toEqual([]);
      }
    );

    evaluate(
      'tag filters use only tag values from the catalog overview (no hallucinated tags)',
      async ({ chatClient }) => {
        // "Windows" maps to the `OS: Windows` tag (no tactic/severity equivalent), so per the
        // skill's worked examples this exercises the overview-then-tags path.
        const response = await chatClient.converse({
          messages: [{ message: 'What Windows detection rules can I install?' }],
        });

        expect(response.errors).toEqual([]);

        const steps = (response.steps ?? []) as ToolCallStep[];

        // The skill must consult the catalog overview before any tags-filtered search.
        const overviewCalls = getCatalogOverviewCalls(steps);
        expect(overviewCalls.length).toBeGreaterThan(0);

        // The only legitimate source of tag values: the overview result from this turn.
        const catalogTags = new Set(overviewCalls.flatMap(catalogTagsFromStep));
        expect(catalogTags.size).toBeGreaterThan(0);

        // Tags the agent actually passed to find_prebuilt_rules.
        const usedTags = getFindPrebuiltRulesCalls(steps).flatMap(tagsFromFilter);

        // Guard against a vacuous pass: the query must have exercised the tags path.
        expect(usedTags.length).toBeGreaterThan(0);

        // Anti-hallucination: every tag used must come from the overview result.
        const ungroundedTags = usedTags.filter((tag) => !catalogTags.has(tag));
        expect(ungroundedTags).toEqual([]);
      }
    );

    evaluate(
      'mitreTactic filters use only canonical MITRE tactics (no hallucinated tactics)',
      async ({ chatClient }) => {
        // Two tactics named in prose force the name->ID mapping and the OR-array path.
        const response = await chatClient.converse({
          messages: [
            {
              message:
                'Which installable prebuilt rules can I add to cover the Credential Access and Persistence tactics?',
            },
          ],
        });

        expect(response.errors).toEqual([]);

        const steps = (response.steps ?? []) as ToolCallStep[];
        const usedTactics = getFindPrebuiltRulesCalls(steps).flatMap(tacticsFromFilter);

        // Guard against a vacuous pass: the query must have exercised the mitreTactic path.
        expect(usedTactics.length).toBeGreaterThan(0);

        // Anti-hallucination: every tactic used must be one of the canonical MITRE tactics.
        const nonCanonical = usedTactics.filter((tactic) => !isCanonicalTactic(tactic));
        expect(nonCanonical).toEqual([]);
      }
    );

    evaluate(
      'an integration recommendation returns only rules related to that integration',
      async ({ chatClient }) => {
        const response = await chatClient.converse({
          messages: [
            {
              message: `Recommend prebuilt detection rules to install for my ${INTEGRATION_PACKAGE} integration.`,
            },
          ],
        });

        expect(response.errors).toEqual([]);

        const steps = (response.steps ?? []) as ToolCallStep[];

        // The recommendation must scope its catalog search to the integration via
        // `relatedIntegrations`, rather than doing a generic catalog search.
        const integrationCalls = getFindPrebuiltRulesCalls(steps).filter((step) =>
          relatedIntegrationsFromFilter(step).includes(INTEGRATION_PACKAGE)
        );
        expect(integrationCalls.length).toBeGreaterThan(0);

        // Every rule returned by those scoped searches must actually relate to the integration —
        // no unrelated rules. (Also catches a broken `relatedIntegrations` filter.)
        const returnedRules = integrationCalls.flatMap(rulesFromStep);
        expect(returnedRules.length).toBeGreaterThan(0);

        const unrelated = returnedRules
          .filter((rule) => !relatesToIntegration(rule, INTEGRATION_PACKAGE))
          .map((rule) => rule?.name ?? '<unknown>');
        expect(unrelated).toEqual([]);
      }
    );
  }
);

// Positive routing: install / browse / coverage questions about not-yet-installed
// prebuilt rules must activate `recommend-prebuilt-rules`. Each phrasing is one the
// router could plausibly mistake for the installed-rules skill, so a green here is
// evidence the agent picks THIS skill for catalog/recommendation intent.
evaluate.describe(
  'Security Skills - Recommend Prebuilt Rules Routing',
  { tag: [...tags.serverless.security.complete, ...tags.serverless.security.ease] },
  () => {
    evaluate.beforeAll(async ({ kbnClient, log }) => {
      log.info(
        '[recommend-prebuilt-rules routing eval] Installing bundled security_detection_engine package...'
      );
      await kbnClient.request({
        path: FLEET_BULK_INSTALL_PATH,
        method: 'POST',
        query: { prerelease: true },
        headers: { 'elastic-api-version': '2023-10-31' },
        body: { packages: ['security_detection_engine'], force: false },
      });
      log.info('[recommend-prebuilt-rules routing eval] Package install complete');
    });

    evaluate(
      'install / browse / coverage queries activate the recommend-prebuilt-rules skill',
      async ({ evaluateDataset }) => {
        await evaluateDataset({
          dataset: {
            name: 'agent builder: security-recommend-prebuilt-rules-routing',
            description:
              'Validates that install, browse, count, and coverage-gap questions about ' +
              'not-yet-installed prebuilt rules activate the recommend-prebuilt-rules skill ' +
              '(and not a sibling rules skill).',
            examples: [
              {
                input: {
                  question: 'What new detection rules should I install to improve my coverage?',
                },
                output: {
                  expected:
                    'I will recommend Elastic prebuilt detection rules to install, after looking at the data sources you have and where your installed coverage is thin, and present the recommended rules by name so you can install them from the Add Elastic Rules page.',
                },
                metadata: {
                  query_intent: 'Install Recommendation',
                  expectedSkill: 'recommend-prebuilt-rules',
                },
              },
              {
                input: {
                  question:
                    'I just set up the Okta integration. Which Elastic prebuilt rules can I install for it?',
                },
                output: {
                  expected:
                    'I will search the installable prebuilt rule catalog for rules whose related integrations include Okta and recommend the ones worth installing for that integration.',
                },
                metadata: {
                  query_intent: 'Integration Recommendation',
                  expectedSkill: 'recommend-prebuilt-rules',
                },
              },
              {
                input: {
                  question:
                    'Which MITRE ATT&CK tactics am I not yet covering, and what rules can I add to close those gaps?',
                },
                output: {
                  expected:
                    'I will compare the MITRE coverage of my installed rules against the installable catalog and recommend prebuilt rules to install that close the uncovered tactics.',
                },
                metadata: {
                  query_intent: 'Coverage Gap',
                  expectedSkill: 'recommend-prebuilt-rules',
                },
              },
              {
                input: {
                  question:
                    'How many critical-severity prebuilt rules are available for me to install?',
                },
                output: {
                  expected:
                    'I will count the not-yet-installed prebuilt rules in the installable catalog that have critical severity and report the total.',
                },
                metadata: {
                  query_intent: 'Catalog Browse/Count',
                  expectedSkill: 'recommend-prebuilt-rules',
                },
              },
              {
                input: {
                  question: 'Are there any machine learning detection rules I can install?',
                },
                output: {
                  expected:
                    'I will search the installable catalog for prebuilt rules of type machine_learning and recommend the ones available to install. This is about installable detection rules, not the anomaly-detection jobs themselves.',
                },
                metadata: {
                  query_intent: 'Catalog Browse',
                  expectedSkill: 'recommend-prebuilt-rules',
                },
              },
            ],
          },
        });
      }
    );
  }
);

evaluate.describe(
  'Security Skills - Recommend Prebuilt Rules Boundaries',
  { tag: [...tags.serverless.security.complete, ...tags.serverless.security.ease] },
  () => {
    evaluate(
      'rule-adjacent queries do NOT activate recommend-prebuilt-rules and route to the correct sibling skill',
      async ({ evaluateDataset }) => {
        await evaluateDataset({
          dataset: {
            name: 'agent builder: security-recommend-prebuilt-rules-distractors',
            description:
              'Distractor queries that touch rules/prebuilt vocabulary but concern ' +
              'already-installed rules, rule editing, ML jobs, alert triage, or authoring a ' +
              'custom alerting rule, and should activate a sibling skill (find-security-rules, ' +
              'detection-rule-edit, find-security-ml-jobs, alert-analysis, rule-management) ' +
              'rather than recommend-prebuilt-rules.',
            examples: [
              {
                input: {
                  question:
                    'How many prebuilt detection rules do I already have installed and enabled?',
                },
                output: {
                  expected:
                    'I will count the prebuilt rules currently installed and enabled on this deployment by querying the installed rule inventory. This is about already-installed rules, not the installable catalog.',
                },
                metadata: {
                  query_intent: 'Installed Rule Count',
                  shouldNotActivateSkill: 'recommend-prebuilt-rules',
                },
              },
              {
                input: {
                  question:
                    'List all the detection rules I currently have enabled, with their severities.',
                },
                output: {
                  expected:
                    'I will list the detection rules currently enabled on this deployment along with their severities by querying the installed rule inventory.',
                },
                metadata: {
                  query_intent: 'Installed Rule Discovery',
                  expectedSkill: 'find-security-rules',
                },
              },
              {
                input: {
                  question: "Disable the 'Suspicious PowerShell Execution' detection rule.",
                },
                output: {
                  expected: 'I will disable the detection rule "Suspicious PowerShell Execution".',
                },
                metadata: {
                  query_intent: 'Rule Editing',
                  expectedSkill: 'detection-rule-edit',
                },
              },
              {
                input: {
                  question: 'Which security machine learning jobs are currently running?',
                },
                output: {
                  expected:
                    'I will list the security machine learning anomaly-detection jobs and report which ones are currently running. This is about the ML jobs themselves, not installable detection rules.',
                },
                metadata: {
                  query_intent: 'ML Jobs',
                  expectedSkill: 'find-security-ml-jobs',
                },
              },
              {
                input: {
                  question: 'Help me triage alert abc-123 and check for related activity.',
                },
                output: {
                  expected:
                    'I will triage alert abc-123 by fetching its details and looking at related alerts and activity.',
                },
                metadata: {
                  query_intent: 'Alert Triage',
                  expectedSkill: 'alert-analysis',
                },
              },
              {
                input: {
                  question:
                    'Create an Alerting V2 rule that uses an ES|QL query to alert me when host CPU stays above 90%.',
                },
                output: {
                  expected:
                    'I will help author an Alerting V2 rule whose condition is an ES|QL query that fires when host CPU stays above 90%. This is about creating a custom alerting rule, not installing prebuilt Elastic detection rules.',
                },
                metadata: {
                  query_intent: 'Alerting V2 Rule Authoring',
                  expectedSkill: 'rule-management',
                },
              },
            ],
          },
        });
      }
    );
  }
);
