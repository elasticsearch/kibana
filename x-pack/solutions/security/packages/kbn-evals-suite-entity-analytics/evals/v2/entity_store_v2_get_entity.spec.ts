/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-security';
import { evaluate } from '../../src/evaluate';

/**
 * Entity Store V2 - get_entity tool routing evals.
 *
 * These specs validate that the entity-analytics skill correctly routes known-entity
 * lookup queries to the `security.get_entity` tool when Entity Store V2 is enabled.
 * This includes profile retrieval, risk score history over an interval, and
 * point-in-time profile snapshots on a specific date (new capability in V2).
 *
 * Tool routing assertions work without pre-seeded data; the tool may return
 * "entity not found" but the call itself must still be made. For grounded
 * criteria (verifying actual profile fields, risk inputs, etc.) seed the entity
 * store using the security-documents-generator populate script.
 */
evaluate.describe(
  'SIEM Entity Analytics V2 Skill - Get Entity',
  { tag: tags.serverless.security.complete },
  () => {
    evaluate('entity store v2: get entity questions', async ({ evaluateDataset }) => {
      await evaluateDataset({
        dataset: {
          name: 'entity-analytics-v2: get entity',
          description:
            'Questions that should route to the security.get_entity tool in Entity Store V2 mode',
          examples: [
            {
              input: {
                question: "Tell me about the entity Cielo39's current risk profile",
              },
              output: {
                criteria: [
                  'Retrieve and summarise the current risk profile for Cielo39, or clearly state the entity was not found.',
                  'Include risk score and risk level if available.',
                  'Do not fabricate entity data.',
                ],
                toolCalls: [
                  {
                    id: 'security.get_entity',
                    criteria: [
                      'The tool is called with an entityId matching "Cielo39" or equivalent (prefixed or non-prefixed form).',
                    ],
                  },
                ],
                tool_sequence: ['security.get_entity'],
              },
              metadata: { query_intent: 'Factual' },
            },
            {
              input: {
                question: "Has Cielo39's risk score changed significantly over the last 90 days?",
              },
              output: {
                criteria: [
                  "Analyse Cielo39's risk score history over the last 90 days and state whether the change is significant (greater than 20 points), or clearly state the entity was not found.",
                  'Include previous and current risk scores where available.',
                  'Do not fabricate entity or risk data.',
                ],
                toolCalls: [
                  {
                    id: 'security.get_entity',
                    criteria: [
                      'The tool is called with an entityId matching "Cielo39" and an interval parameter of "90d" or equivalent.',
                    ],
                  },
                ],
                tool_sequence: ['security.get_entity'],
              },
              metadata: { query_intent: 'Factual' },
            },
            {
              input: {
                question:
                  "Show me user jsmith123's full profile including their last 30 days of risk history",
              },
              output: {
                criteria: [
                  "Retrieve jsmith123's profile with risk score history over the last 30 days, or clearly state the entity was not found.",
                  'Summarise any notable changes in risk score, asset criticality, watchlists, or behaviors over the interval.',
                  'Do not fabricate entity data.',
                ],
                toolCalls: [
                  {
                    id: 'security.get_entity',
                    criteria: [
                      'The tool is called with an entityId matching "jsmith123" and an interval parameter of "30d" or equivalent.',
                    ],
                  },
                ],
                tool_sequence: ['security.get_entity'],
              },
              metadata: { query_intent: 'Factual' },
            },
            {
              input: {
                question: "What did user jsmith123's profile look like on March 15th?",
              },
              output: {
                criteria: [
                  "Retrieve jsmith123's profile snapshot for March 15th, or clearly state that no snapshot data is available for that date.",
                  'Present the profile data as it existed on that specific date.',
                  'Do not fabricate historical profile data.',
                ],
                toolCalls: [
                  {
                    id: 'security.get_entity',
                    criteria: [
                      'The tool is called with an entityId matching "jsmith123" and a date parameter corresponding to March 15th in ISO 8601 format.',
                    ],
                  },
                ],
                tool_sequence: ['security.get_entity'],
              },
              metadata: { query_intent: 'Factual' },
            },
            {
              input: {
                question: 'What is the current risk profile for host server1?',
              },
              output: {
                criteria: [
                  'Retrieve and summarise the current risk profile for host server1, or clearly state the entity was not found.',
                  'Include risk score, risk level, and asset criticality where available.',
                  'Do not fabricate entity data.',
                ],
                toolCalls: [
                  {
                    id: 'security.get_entity',
                    criteria: [
                      'The tool is called with an entityId matching "server1" and optionally entityType "host".',
                    ],
                  },
                ],
                tool_sequence: ['security.get_entity'],
              },
              metadata: { query_intent: 'Factual' },
            },
            {
              input: {
                question: 'Which alerts contributed to user jsmith123 having a high risk score?',
              },
              output: {
                criteria: [
                  "Retrieve jsmith123's entity profile including the alert inputs that contributed to the risk score, or clearly state no risk score or alert data is available.",
                  'Summarise the contributing alerts where available (e.g. rule names, severity).',
                  'Do not fabricate alert or risk data.',
                ],
                toolCalls: [
                  {
                    id: 'security.get_entity',
                    criteria: [
                      'The tool is called with an entityId matching "jsmith123"; the response should include risk_score_inputs if the entity has a risk score.',
                    ],
                  },
                ],
                tool_sequence: ['security.get_entity'],
              },
              metadata: { query_intent: 'Factual' },
            },
          ],
        },
      });
    });
  }
);
