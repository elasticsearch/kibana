/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-security';
import { evaluate } from '../../src/evaluate';

/**
 * Leads skill — tool routing evals.
 *
 * These specs validate that the leads skill correctly routes questions to
 * the appropriate tool.
 */
evaluate.describe(
  'SIEM Entity Analytics - Leads Skill',
  { tag: tags.serverless.security.complete },
  () => {
    evaluate('leads skill: list_leads tool routing', async ({ evaluateDataset }) => {
      await evaluateDataset({
        dataset: {
          name: 'entity-analytics: leads',
          description:
            'Questions that should route to the security.list_leads tool via the leads skill',
          examples: [
            {
              input: {
                question: 'Show me the current open investigation leads',
              },
              output: {
                criteria: [
                  'Return a list of open (active) investigation leads, or clearly state no leads were found.',
                  'Include lead title, priority, and status for each result where available.',
                  'Do not fabricate lead data.',
                ],
                toolCalls: [
                  {
                    id: 'security.list_leads',
                    criteria: [
                      'The tool is called to retrieve leads; optionally with status "active".',
                    ],
                  },
                ],
              },
              metadata: { query_intent: 'Factual' },
            },
            {
              input: {
                question: 'Show me the dismissed leads',
              },
              output: {
                criteria: [
                  'Return dismissed leads, or clearly state no dismissed leads were found.',
                  'Do not fabricate lead data.',
                ],
                toolCalls: [
                  {
                    id: 'security.list_leads',
                    criteria: ['The tool is called with status "dismissed".'],
                  },
                ],
              },
              metadata: { query_intent: 'Factual' },
            },
          ],
        },
      });
    });

    evaluate('leads skill: generate_leads tool routing', async ({ evaluateDataset }) => {
      await evaluateDataset({
        dataset: {
          name: 'entity-analytics: generate_leads',
          description:
            'Questions that should route to the security.generate_leads tool via the leads skill',
          examples: [
            {
              input: {
                question: 'Generate new investigation leads',
              },
              output: {
                criteria: [
                  'Ask the user to confirm before starting lead generation, or indicate that a confirmation prompt was presented.',
                  'Do not fabricate lead results.',
                ],
                toolCalls: [
                  {
                    id: 'security.generate_leads',
                    criteria: ['The tool is called to trigger a new lead generation run.'],
                  },
                ],
              },
              metadata: { query_intent: 'Action' },
            },
            {
              input: {
                question: 'Refresh my investigation leads using the OpenAI connector',
              },
              output: {
                criteria: [
                  'Ask the user to confirm before starting lead generation.',
                  'Do not fabricate lead results.',
                ],
                toolCalls: [
                  {
                    id: 'security.generate_leads',
                    criteria: [
                      'The tool is called with a connectorName argument referencing "OpenAI".',
                    ],
                  },
                ],
              },
              metadata: { query_intent: 'Action' },
            },
          ],
        },
      });
    });

    evaluate('leads skill: dismiss_lead tool routing', async ({ evaluateDataset }) => {
      await evaluateDataset({
        dataset: {
          name: 'entity-analytics: dismiss_lead',
          description:
            'Questions that should route to security.list_leads then security.dismiss_lead. ' +
            'list_leads is always asserted; dismiss_lead is contingent on leads being present.',
          examples: [
            {
              input: {
                question: 'Dismiss the most urgent investigation lead',
              },
              output: {
                criteria: [
                  'Either presents a confirmation prompt for dismissing a specific lead, or clearly states that no active leads were found to dismiss.',
                  'Does not fabricate lead data.',
                ],
                toolCalls: [
                  {
                    id: 'security.list_leads',
                    criteria: [
                      'list_leads is called first to retrieve available leads and their IDs before attempting a dismiss.',
                    ],
                  },
                ],
              },
              metadata: { query_intent: 'Action' },
            },
            {
              input: {
                question: 'This lead is a false positive, please dismiss it',
              },
              output: {
                criteria: [
                  'Either presents a dismiss confirmation prompt, or asks which lead to dismiss if no lead is in context.',
                  'Does not fabricate lead data.',
                ],
                toolCalls: [
                  {
                    id: 'security.list_leads',
                    criteria: [
                      'list_leads is called to retrieve leads so the agent can identify which one to dismiss.',
                    ],
                  },
                ],
              },
              metadata: { query_intent: 'Action' },
            },
          ],
        },
      });
    });
  }
);
