/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-security';
import { evaluate } from '../../src/evaluate';

/**
 * Entity Store V2 - distractor (negative) routing evals.
 *
 * Companion to the positive-routing specs (`entity_store_v2_search_entities`,
 * `entity_store_v2_get_entity`, `entity_store_v2_multi_skill`). These examples
 * verify that the entity-analytics skill is NOT invoked and that
 * `security.search_entities` / `security.get_entity` are NOT called for
 * questions that look superficially entity-related (mention "user", "host",
 * "risk", "entity") but actually concern other domains — Kibana platform
 * assets, observability data, threat-hunting investigations, ML configuration,
 * or off-topic prompts.
 *
 * Why this matters: per `kbn-evals` conventions, distractors improve skill
 * selection accuracy and reduce false positives. Without them, the eval suite
 * only measures recall (does the skill fire when it should?) but not
 * precision (does it stay quiet when it shouldn't?). False activations are
 * expensive: they spend tokens, surface irrelevant entity data, and erode user
 * trust in the agent's routing.
 *
 * Enforcement: assertions are LLM-judged via the `criteria` array. The
 * framework does not currently expose a native "must NOT call X" assertion,
 * so each example pins a `criteria` line that explicitly forbids the
 * entity-analytics tool calls and instructs the judge to confirm the
 * conversation steps respect the constraint. The `metadata.shouldNotActivateSkill`
 * field is annotation-only — it documents reviewer intent and lets dataset
 * filters segregate negative tests, but does not by itself fail the example.
 *
 * Dataset categories represented (one example per row keeps reviewer scan
 * fast; expand within a category if a regression motivates it):
 *   1. Kibana platform / asset queries (dashboards, indices)
 *   2. Observability queries (APM, logs)
 *   3. Lexical lures — words that look entity-shaped in non-entity contexts
 *      (Kibana auth audit user count, Elasticsearch host as deployment
 *      target, "risk" appetite as a non-security usage)
 *   4. Adjacent security skills the agent should route to instead
 *      (threat-hunting, alert-analysis, ML configuration)
 *   5. Off-topic / out-of-scope prompts
 */
evaluate.describe(
  'SIEM Entity Analytics V2 Skill - Distractors',
  { tag: tags.serverless.security.complete },
  () => {
    evaluate(
      'entity store v2: distractor questions do not activate entity tools',
      async ({ evaluateDataset }) => {
        await evaluateDataset({
          dataset: {
            name: 'entity-analytics-v2: distractors',
            description:
              'Negative tests: queries that should NOT invoke security.search_entities or security.get_entity, even when they superficially mention "entity", "user", "host", or "risk". Improves precision of the entity-analytics skill selector by giving the dataset a "stay quiet" signal alongside the positive activation signals in the sibling specs.',
            examples: [
              // ───────────────────────────────────────────────────────────
              // 1. Kibana platform / asset queries
              // ───────────────────────────────────────────────────────────
              {
                input: {
                  question: 'Show me the available dashboards in Kibana.',
                },
                output: {
                  criteria: [
                    'Do not call security.search_entities or security.get_entity — this is a Kibana asset discovery query, not an entity-store risk lookup.',
                    'Either route to a Kibana platform tool (e.g. dashboards/find), explain that the agent does not have access to a dashboards listing tool, or suggest the in-product navigation. Do not fabricate dashboard names or counts.',
                  ],
                },
                metadata: {
                  query_intent: 'Distractor',
                  shouldNotActivateSkill: 'entity-analytics',
                },
              },
              {
                input: {
                  question:
                    'Which indices are available in this cluster? List anything starting with "logs-".',
                },
                output: {
                  criteria: [
                    'Do not call security.search_entities or security.get_entity — this is an Elasticsearch index discovery query, unrelated to the entity store.',
                    'Either route to an index-listing capability (e.g. platform.core.list_indices) or explain the agent does not have one available. Do not fabricate index names.',
                  ],
                },
                metadata: {
                  query_intent: 'Distractor',
                  shouldNotActivateSkill: 'entity-analytics',
                },
              },

              // ───────────────────────────────────────────────────────────
              // 2. Observability queries
              // ───────────────────────────────────────────────────────────
              {
                input: {
                  question: 'What is the current status of my APM services?',
                },
                output: {
                  criteria: [
                    'Do not call security.search_entities or security.get_entity — APM service health is an observability concern, not a security entity-store concern.',
                    "Either route to an observability tool/skill or explain that this is outside the security agent's scope. Do not fabricate service names or health metrics.",
                  ],
                },
                metadata: {
                  query_intent: 'Distractor',
                  shouldNotActivateSkill: 'entity-analytics',
                },
              },

              // ───────────────────────────────────────────────────────────
              // 3. Lexical lures — entity-shaped words in non-entity contexts
              // ───────────────────────────────────────────────────────────
              {
                input: {
                  question:
                    'How many users have logged in to Kibana itself today? I want to see Kibana audit activity.',
                },
                output: {
                  criteria: [
                    'Do not call security.search_entities or security.get_entity — this asks about Kibana platform login audit, not entity-store risk profiles for monitored users.',
                    "Either route to a Kibana audit log capability or explain that this is a platform-audit question and not the agent's entity-store responsibility. Do not invent user counts.",
                  ],
                },
                metadata: {
                  query_intent: 'Distractor',
                  shouldNotActivateSkill: 'entity-analytics',
                },
              },
              {
                input: {
                  question:
                    'How do I add a new Elasticsearch host to my cluster? I have a fresh node ready to join.',
                },
                output: {
                  criteria: [
                    'Do not call security.search_entities or security.get_entity — "host" here means an Elasticsearch cluster node, not a monitored host entity in the entity store.',
                    'Provide cluster-management guidance (or link out to the relevant docs) without invoking entity-analytics tools.',
                  ],
                },
                metadata: {
                  query_intent: 'Distractor',
                  shouldNotActivateSkill: 'entity-analytics',
                },
              },
              {
                input: {
                  question:
                    "What is our team's risk appetite for adopting new SaaS vendors? I need to draft a procurement policy.",
                },
                output: {
                  criteria: [
                    'Do not call security.search_entities or security.get_entity — "risk appetite" here is an organisational/policy concept, not an entity risk score in the entity store.',
                    "Acknowledge the question is outside the agent's data scope, or offer general policy-shape guidance, without touching entity-analytics tools.",
                  ],
                },
                metadata: {
                  query_intent: 'Distractor',
                  shouldNotActivateSkill: 'entity-analytics',
                },
              },

              // ───────────────────────────────────────────────────────────
              // 4. Adjacent security skills the agent should route to instead
              // ───────────────────────────────────────────────────────────
              {
                input: {
                  question:
                    'Hunt for unusual outbound network connections from our endpoints over the last 24 hours.',
                },
                output: {
                  criteria: [
                    'Do not call security.search_entities or security.get_entity — this is a threat-hunting query that should activate the threat-hunting skill (ES|QL over endpoint/network logs), not the entity-analytics skill.',
                    'Either describe the threat-hunting approach or route to threat-hunting tools. Do not invoke entity-store lookups as a substitute for log analysis.',
                  ],
                },
                metadata: {
                  query_intent: 'Distractor',
                  shouldNotActivateSkill: 'entity-analytics',
                },
              },
              {
                input: {
                  question:
                    'Walk me through triaging this critical "Suspicious PowerShell" alert on host WIN-DC01: alert id alert-12345.',
                },
                output: {
                  criteria: [
                    'Do not call security.search_entities or security.get_entity as the primary action — this is an alert-triage workflow that should route to the alert-analysis skill (security.alerts and friends).',
                    'It is acceptable for alert-analysis to subsequently call entity tools as part of its workflow, but the primary skill activation must be alert-analysis, not entity-analytics. The model should not jump straight to entity lookups for the host without first inspecting the alert.',
                  ],
                },
                metadata: {
                  query_intent: 'Distractor',
                  shouldNotActivateSkill: 'entity-analytics',
                },
              },
              {
                input: {
                  question:
                    'Which ML jobs are currently running for security anomaly detection? I want to confirm the lateral movement detection module is enabled.',
                },
                output: {
                  criteria: [
                    'Do not call security.search_entities or security.get_entity — this is a pure ML configuration / job-status question, with no entity-store dimension.',
                    'Route to find.security.ml.jobs or an equivalent ML status capability. Do not invent job names or statuses.',
                  ],
                },
                metadata: {
                  query_intent: 'Distractor',
                  shouldNotActivateSkill: 'entity-analytics',
                },
              },

              // ───────────────────────────────────────────────────────────
              // 5. Off-topic / out-of-scope prompts
              // ───────────────────────────────────────────────────────────
              {
                input: {
                  question: "What's the weather in San Francisco today?",
                },
                output: {
                  criteria: [
                    "Do not call security.search_entities or security.get_entity — this is unrelated to the security agent's domain.",
                    "Decline politely or explain the agent's scope. Do not fabricate weather data or invoke any security tools.",
                  ],
                },
                metadata: {
                  query_intent: 'Distractor',
                  shouldNotActivateSkill: 'entity-analytics',
                },
              },
            ],
          },
        });
      }
    );
  }
);
