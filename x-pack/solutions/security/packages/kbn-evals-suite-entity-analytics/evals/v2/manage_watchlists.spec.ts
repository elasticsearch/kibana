/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-security';
import { evaluate } from '../../src/evaluate';
import {
  bulkIndexEntities,
  createWatchlist,
  deleteEntityEngines,
  deleteWatchlistsByName,
  installEntityStoreV2AndWait,
} from '../../src/setup_helpers';

/**
 * manage-watchlists skill — tool routing evals for the watchlist mutation tools.
 *
 * These specs validate that the `manage-watchlists` skill correctly routes:
 * - create / update / delete a watchlist
 * - add / remove entities by an explicit id list
 * - the create-and-populate headline flow (create_watchlist → add_entities_to_watchlist)
 * - the query-then-add flow (list_watchlists → search_entities → add_entities_to_watchlist)
 */

const SEEDED_USER_EUIDS = ['user:jsmith123', 'user:rjones456', 'user:alice', 'user:bob'];
const SEEDED_CRITICAL_USER_EUIDS = ['user:critical-alice', 'user:critical-bob'];
const SEEDED_HOST_EUIDS = ['host:server01'];

const MANAGED_WATCHLIST_NAMES = [
  // Pre-seeded — exist before tests run
  'Privileged Users',
  'Compromised Accounts',
  // Test-created — created during the run by the create examples. Listed here
  // so cleanup removes them; not re-seeded by beforeAll.
  'Suspicious Logins',
  'High Risk Hosts',
];

evaluate.describe(
  'SIEM Entity Analytics V2 Skill - Manage Watchlists',
  { tag: tags.serverless.security.complete },
  () => {
    evaluate.beforeAll(async ({ log, esClient, supertest }) => {
      await installEntityStoreV2AndWait({ supertest, log });

      await bulkIndexEntities({
        esClient,
        entities: [
          ...SEEDED_USER_EUIDS.map((euid) => ({ euid })),
          ...SEEDED_CRITICAL_USER_EUIDS.map((euid) => ({
            euid,
            riskLevel: 'Critical' as const,
            riskScoreNorm: 92,
          })),
          ...SEEDED_HOST_EUIDS.map((euid) => ({ euid })),
        ],
      });

      // delete any prior runs' managed watchlists, then create the pre-seeded subset.
      // The lifecycle examples may also create/delete
      // some of these names during the run — that's fine, watchlist names
      // aren't unique and the agent uses the resolved id.
      await deleteWatchlistsByName({ supertest, names: MANAGED_WATCHLIST_NAMES });
      await createWatchlist({
        supertest,
        watchlist: {
          name: 'Privileged Users',
          description: 'Sensitive accounts under continuous review',
          riskModifier: 1.5,
        },
      });
      await createWatchlist({
        supertest,
        watchlist: {
          name: 'Compromised Accounts',
          description: 'Users suspected to be compromised',
          riskModifier: 1,
        },
      });
    });

    evaluate.afterAll(async ({ log, supertest, quickApiClient }) => {
      // Best-effort cleanup. Failures here are non-fatal — the next beforeAll
      // is idempotent and will clear leftover seeded watchlists by name.
      try {
        await deleteWatchlistsByName({ supertest, names: MANAGED_WATCHLIST_NAMES });
      } catch (err) {
        log.warning(`Watchlist cleanup failed during teardown: ${(err as Error).message}`);
      }
      await deleteEntityEngines({ quickApiClient, log });
    });

    evaluate('manage watchlists: create / update / delete flows', async ({ evaluateDataset }) => {
      await evaluateDataset({
        dataset: {
          name: 'entity-analytics-v2: manage watchlists (lifecycle)',
          description:
            'Questions that should route to the watchlist lifecycle tools (create / update / delete) in the manage-watchlists skill',
          examples: [
            {
              input: {
                question:
                  'Create a watchlist called Suspicious Logins for users with unusual login patterns we want to keep an eye on.',
              },
              output: {
                criteria: [
                  'Use security.create_watchlist to create a watchlist named "Suspicious Logins" with a description matching the user\'s context.',
                  'Surface the confirmation step (the tool is HITL-gated) rather than claiming success outright.',
                  'Do not fabricate a watchlist id.',
                ],
                toolCalls: [
                  {
                    id: 'security.create_watchlist',
                    criteria: [
                      'The tool is called with a name parameter exactly matching "Suspicious Logins" and a description summarising the user\'s purpose ("users with unusual login patterns" or equivalent).',
                    ],
                  },
                ],
              },
              metadata: { query_intent: 'Watchlist Create' },
            },
            {
              input: {
                question:
                  'Make a watchlist called High Risk Hosts and double the risk score for entities on it.',
              },
              output: {
                criteria: [
                  'Use security.create_watchlist with name "High Risk Hosts" and riskModifier 2 (doubling).',
                  'Surface the confirmation step.',
                ],
                toolCalls: [
                  {
                    id: 'security.create_watchlist',
                    criteria: [
                      'The tool is called with name "High Risk Hosts" and riskModifier set to 2 (the discrete value that represents doubling risk scores). riskModifier must be one of the allowed values: 0, 0.5, 1, 1.5, or 2.',
                    ],
                  },
                ],
              },
              metadata: { query_intent: 'Watchlist Create' },
            },
            {
              input: {
                question: "Rename the Privileged Users watchlist to 'Senior Privileged Users'.",
              },
              output: {
                criteria: [
                  'Resolve the watchlist "Privileged Users" to its id via security.list_watchlists first, then call security.update_watchlist with the new name.',
                  'Surface the confirmation step before applying the change.',
                  'Do not fabricate an id.',
                ],
                toolCalls: [
                  {
                    id: 'security.list_watchlists',
                    criteria: [
                      'The tool is called with a nameContains parameter matching "Privileged Users" (or a distinctive substring like "privileged") to resolve the watchlist id.',
                    ],
                  },
                  {
                    id: 'security.update_watchlist',
                    criteria: [
                      'The tool is called with the watchlistId resolved from list_watchlists and a name parameter of "Senior Privileged Users". No description or riskModifier should be set (the user only asked to rename).',
                    ],
                  },
                ],
              },
              metadata: { query_intent: 'Watchlist Update' },
            },
            {
              input: {
                question: 'Delete the Compromised Accounts watchlist.',
              },
              output: {
                criteria: [
                  'Resolve "Compromised Accounts" to its id via security.list_watchlists, then call security.delete_watchlist.',
                  'Surface the confirmation step and warn the user that the action cannot be undone.',
                  'Do not claim the deletion succeeded without first confirming with the user.',
                ],
                toolCalls: [
                  {
                    id: 'security.list_watchlists',
                    criteria: [
                      'The tool is called with a nameContains parameter matching "Compromised Accounts" to resolve the watchlist id.',
                    ],
                  },
                  {
                    id: 'security.delete_watchlist',
                    criteria: [
                      'The tool is called with the watchlistId resolved from list_watchlists.',
                    ],
                  },
                ],
              },
              metadata: { query_intent: 'Watchlist Delete' },
            },
          ],
        },
      });
    });

    evaluate('manage watchlists: add / remove entities flows', async ({ evaluateDataset }) => {
      await evaluateDataset({
        dataset: {
          name: 'entity-analytics-v2: manage watchlists (entity membership)',
          description:
            'Questions that should route to the add/remove entity tools in the manage-watchlists skill, including the headline create-and-populate and query-then-add flows',
          examples: [
            {
              input: {
                question:
                  'Add user:jsmith123 and user:rjones456 to the Privileged Users watchlist.',
              },
              output: {
                criteria: [
                  'Resolve "Privileged Users" to its id via security.list_watchlists, then call security.add_entities_to_watchlist with the resolved id and both entity ids.',
                  'Surface the confirmation step.',
                ],
                toolCalls: [
                  {
                    id: 'security.list_watchlists',
                    criteria: [
                      'The tool is called with a nameContains parameter matching "Privileged Users" to resolve the watchlist id.',
                    ],
                  },
                  {
                    id: 'security.add_entities_to_watchlist',
                    criteria: [
                      'The tool is called with the watchlistId resolved from list_watchlists, and entityIds containing exactly ["user:jsmith123", "user:rjones456"] (order not significant).',
                    ],
                  },
                ],
              },
              metadata: { query_intent: 'Watchlist Add Entities' },
            },
            {
              input: {
                question:
                  'Create a watchlist called Suspicious Logins and add user:alice and user:bob to it.',
              },
              output: {
                criteria: [
                  'Create the watchlist via security.create_watchlist with name "Suspicious Logins", then use the returned id with security.add_entities_to_watchlist to assign user:alice and user:bob.',
                  'Surface the confirmation step for each mutating tool call.',
                ],
                toolCalls: [
                  {
                    id: 'security.create_watchlist',
                    criteria: [
                      'The tool is called with name "Suspicious Logins" (and ideally a brief description summarising the user\'s purpose).',
                    ],
                  },
                  {
                    id: 'security.add_entities_to_watchlist',
                    criteria: [
                      'The tool is called with a watchlistId that is the id returned by the preceding create_watchlist call, and entityIds containing ["user:alice", "user:bob"].',
                    ],
                  },
                ],
              },
              metadata: { query_intent: 'Watchlist Create and Populate' },
            },
            {
              input: {
                question: 'Add all critical-risk users to the Privileged Users watchlist.',
              },
              output: {
                criteria: [
                  'Resolve "Privileged Users" via security.list_watchlists, run security.search_entities to find critical-risk users, then call security.add_entities_to_watchlist with the entity ids from the search results.',
                  'Surface the confirmation step before adding.',
                  'In prose, indicate this is a one-time add (a persistent entity source is configured in the UI, not here).',
                ],
                toolCalls: [
                  {
                    id: 'security.list_watchlists',
                    criteria: [
                      'The tool is called with a nameContains parameter matching "Privileged Users" to resolve the watchlist id.',
                    ],
                  },
                  {
                    id: 'security.search_entities',
                    criteria: [
                      'The tool is called with entityTypes containing "user" and riskLevels containing "Critical" (or equivalent filters) to find the candidate entities.',
                    ],
                  },
                  {
                    id: 'security.add_entities_to_watchlist',
                    criteria: [
                      'The tool is called with the watchlistId from list_watchlists and entityIds populated from the entity.id values returned by search_entities (not fabricated).',
                    ],
                  },
                ],
              },
              metadata: { query_intent: 'Watchlist Query-then-Add' },
            },
            {
              input: {
                question: 'Remove user:jsmith123 from the Privileged Users watchlist.',
              },
              output: {
                criteria: [
                  'Resolve "Privileged Users" via security.list_watchlists, then call security.remove_entities_from_watchlist with that id and user:jsmith123.',
                  'Surface the confirmation step. If the entity is reported as not_found with the "Entity not manually assigned" message, the agent should explain that the entity was added via an entity source and cannot be removed by this tool — directing the user to reconfigure the source in the UI.',
                ],
                toolCalls: [
                  {
                    id: 'security.list_watchlists',
                    criteria: [
                      'The tool is called with a nameContains parameter matching "Privileged Users" to resolve the watchlist id.',
                    ],
                  },
                  {
                    id: 'security.remove_entities_from_watchlist',
                    criteria: [
                      'The tool is called with the watchlistId resolved from list_watchlists and entityIds containing exactly ["user:jsmith123"].',
                    ],
                  },
                ],
              },
              metadata: { query_intent: 'Watchlist Remove Entities' },
            },
          ],
        },
      });
    });
  }
);
