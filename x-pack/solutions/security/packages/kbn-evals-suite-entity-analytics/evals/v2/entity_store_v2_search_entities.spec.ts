/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-security';
import { evaluate } from '../../src/evaluate';

/**
 * Entity Store V2 - search_entities tool routing evals.
 *
 * These specs validate that the entity-analytics skill correctly routes entity
 * search queries to the `security.search_entities` tool when Entity Store V2 is
 * enabled. Tool routing assertions are checked without requiring pre-seeded data;
 * the tool may return "no entities found" but it MUST be called.
 *
 * For data-grounded assertions (verifying actual risk scores, watchlist members, etc.)
 * seed the entity store first using the security-documents-generator populate script
 * described in the evals_entity_analytics_v2 configSet.
 */
evaluate.describe(
  'SIEM Entity Analytics V2 Skill - Search Entities',
  { tag: tags.serverless.security.complete },
  () => {
    evaluate('entity store v2: search entities questions', async ({ evaluateDataset }) => {
      await evaluateDataset({
        dataset: {
          name: 'entity-analytics-v2: search entities',
          description:
            'Questions that should route to the security.search_entities tool in Entity Store V2 mode',
          examples: [
            {
              input: {
                question: 'Which users have the highest risk scores?',
              },
              output: {
                criteria: [
                  'Return a list of users ranked by risk score, or clearly state that no risk score data is available.',
                  'Include risk score and risk level for each user where available.',
                  'Do not fabricate entity data.',
                ],
                toolCalls: [
                  {
                    id: 'security.search_entities',
                    criteria: [
                      'The tool is called with parameters that sort or filter by risk score (e.g. riskScoreMin or default sort by risk score).',
                    ],
                  },
                ],
                tool_sequence: ['security.search_entities'],
              },
              metadata: { query_intent: 'Factual' },
            },
            {
              input: {
                question: 'Which 15 users have the highest risk scores right now?',
              },
              output: {
                criteria: [
                  'Attempt to return up to 15 users ranked by risk score, or clearly state that no data is available.',
                  'Include risk score and risk level for each user where available.',
                  'Do not fabricate entity data.',
                ],
                toolCalls: [
                  {
                    id: 'security.search_entities',
                    criteria: [
                      'The tool is called with a maxResults parameter of 15 or equivalent to return 15 results.',
                    ],
                  },
                ],
                tool_sequence: ['security.search_entities'],
              },
              metadata: { query_intent: 'Factual' },
            },
            {
              input: {
                question: 'Show me all critical and high risk entities',
              },
              output: {
                criteria: [
                  'Return entities with Critical or High risk level, or clearly state that no entities at these risk levels were found.',
                  'Include risk score and risk level for each entity.',
                  'Do not fabricate entity or risk data.',
                ],
                toolCalls: [
                  {
                    id: 'security.search_entities',
                    criteria: [
                      'The tool is called with a riskLevels filter containing Critical and/or High.',
                    ],
                  },
                ],
                tool_sequence: ['security.search_entities'],
              },
              metadata: { query_intent: 'Factual' },
            },
            {
              input: {
                question: 'What are the riskiest hosts in my environment that are high impact?',
              },
              output: {
                criteria: [
                  'Return hosts filtered by high or extreme asset criticality, ranked by risk score, or clearly state no data is available.',
                  'Include risk score, risk level, and asset criticality for each host.',
                  'Do not fabricate entity data.',
                ],
                toolCalls: [
                  {
                    id: 'security.search_entities',
                    criteria: [
                      'The tool is called with entityTypes containing "host" and criticalityLevels containing "high_impact" and/or "extreme_impact".',
                    ],
                  },
                ],
                tool_sequence: ['security.search_entities'],
              },
              metadata: { query_intent: 'Factual' },
            },
            {
              input: {
                question: 'Show me all business-critical assets with elevated risk',
              },
              output: {
                criteria: [
                  'Return entities with high or extreme asset criticality and a notable risk score, or clearly state that no data is available.',
                  'Do not fabricate entity or risk data.',
                ],
                toolCalls: [
                  {
                    id: 'security.search_entities',
                    criteria: [
                      'The tool is called with criticalityLevels containing "high_impact" and/or "extreme_impact", optionally combined with a riskScoreMin or riskLevels filter.',
                    ],
                  },
                ],
                tool_sequence: ['security.search_entities'],
              },
              metadata: { query_intent: 'Factual' },
            },
            {
              input: {
                question: "Who's had the biggest jump in risk score in the last day?",
              },
              output: {
                criteria: [
                  'Return entities with the largest risk score increase over the last day, or clearly state that no risk score change data is available.',
                  'Include the risk score change or relevant trend information.',
                  'Do not fabricate entity or risk data.',
                ],
                toolCalls: [
                  {
                    id: 'security.search_entities',
                    criteria: [
                      'The tool is called with a riskScoreChangeInterval parameter of "1d" or equivalent.',
                    ],
                  },
                ],
                tool_sequence: ['security.search_entities'],
              },
              metadata: { query_intent: 'Factual' },
            },
            {
              input: {
                question: 'Show me accounts with increasing risk trends over the last 30 days',
              },
              output: {
                criteria: [
                  'Return entities with a positive risk score change over the last 30 days, or clearly state no trend data is available.',
                  'Do not fabricate entity or risk trend data.',
                ],
                toolCalls: [
                  {
                    id: 'security.search_entities',
                    criteria: [
                      'The tool is called with a riskScoreChangeInterval parameter of "30d" or equivalent.',
                    ],
                  },
                ],
                tool_sequence: ['security.search_entities'],
              },
              metadata: { query_intent: 'Factual' },
            },
            {
              input: {
                question: 'What users are on the "Privileged User" watchlist?',
              },
              output: {
                criteria: [
                  'Return users that belong to the "Privileged User" watchlist, or clearly state that no entities on that watchlist were found.',
                  'Do not fabricate watchlist membership data.',
                ],
                toolCalls: [
                  {
                    id: 'security.search_entities',
                    criteria: [
                      'The tool is called with a watchlists parameter containing "Privileged User" or equivalent.',
                    ],
                  },
                ],
                tool_sequence: ['security.search_entities'],
              },
              metadata: { query_intent: 'Factual' },
            },
          ],
        },
      });
    });
  }
);
