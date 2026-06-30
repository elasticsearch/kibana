/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { tags } from '@kbn/scout-security';
import { evaluate } from '../../src/evaluate';
import {
  assignEntitiesToWatchlist,
  bulkIndexEntities,
  createWatchlist,
  deleteEntityEngines,
  deleteWatchlistsByName,
  installEntityStoreV2AndWait,
} from '../../src/setup_helpers';

/**
 * list_watchlists tool routing evals.
 *
 * These specs validate that the entity-analytics skill correctly routes:
 * - watchlist-discovery queries
 * - "who is on watchlist X" queries to the `security.list_watchlists` →
 *   `security.search_entities` chain
 * - "which watchlists is this entity on" queries to `security.get_entity`
 */

const SEEDED_USER_EUIDS = ['user:jsmith123', 'user:rjones456', 'user:alice', 'user:bob'];
const SEEDED_HOST_EUIDS = ['host:server01'];
const ALL_SEEDED_EUIDS = [...SEEDED_USER_EUIDS, ...SEEDED_HOST_EUIDS];

const MANAGED_WATCHLIST_NAMES = ['Privileged Users'];

evaluate.describe(
  'SIEM Entity Analytics V2 Skill - List Watchlists',
  { tag: tags.serverless.security.complete },
  () => {
    evaluate.beforeAll(async ({ log, esClient, supertest }) => {
      await installEntityStoreV2AndWait({ supertest, log });

      await bulkIndexEntities({
        esClient,
        entities: ALL_SEEDED_EUIDS.map((euid) => ({ euid })),
      });

      // delete any prior runs' managed watchlists, then create fresh.
      await deleteWatchlistsByName({ supertest, names: MANAGED_WATCHLIST_NAMES });
      const { id: privilegedUsersId } = await createWatchlist({
        supertest,
        watchlist: {
          name: 'Privileged Users',
          description: 'Sensitive accounts under continuous review',
          riskModifier: 1.5,
        },
      });

      await assignEntitiesToWatchlist({
        supertest,
        watchlistId: privilegedUsersId,
        euids: ALL_SEEDED_EUIDS,
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

    evaluate('list watchlists questions', async ({ evaluateDataset }) => {
      await evaluateDataset({
        dataset: {
          name: 'entity-analytics-v2: list watchlists',
          description:
            'Questions that should route to the security.list_watchlists tool (and the list → search_entities chain for named-watchlist member queries) in Entity Store V2 mode',
          examples: [
            {
              input: {
                question: 'What watchlists do we have configured?',
              },
              output: {
                criteria: [
                  'List the watchlists configured in the current space, including the name and id for each watchlist, or clearly state that no watchlists are configured.',
                  'Include the watchlist description when present.',
                  'Do not fabricate watchlist data.',
                ],
                toolCalls: [
                  {
                    id: 'security.list_watchlists',
                    criteria: [
                      'The tool is called to enumerate watchlists. nameContains should be omitted (the user did not name a specific watchlist).',
                    ],
                  },
                ],
              },
              metadata: { query_intent: 'Factual' },
            },
            {
              input: {
                question: 'Who is on the Privileged Users watchlist?',
              },
              output: {
                criteria: [
                  'Resolve the watchlist named "Privileged Users" to its id, then list its members, or clearly state that no such watchlist exists / it has no members.',
                  'Present member entities with risk score and risk level where available.',
                  'Do not fabricate watchlist or entity data.',
                ],
                toolCalls: [
                  {
                    id: 'security.list_watchlists',
                    criteria: [
                      'The tool is called with a nameContains parameter matching "Privileged Users" (or a distinctive substring like "privileged") to resolve the watchlist id.',
                    ],
                  },
                  {
                    id: 'security.search_entities',
                    criteria: [
                      'The tool is called with a watchlists parameter containing the id resolved from the security.list_watchlists call, to enumerate members of the watchlist.',
                    ],
                  },
                ],
              },
              metadata: { query_intent: 'Factual' },
            },
            {
              input: {
                question: 'Which watchlists is host server01 on?',
              },
              output: {
                criteria: [
                  "Call security.get_entity FIRST — the entity's watchlist memberships are on the entity profile (entity.attributes.watchlists, an array of watchlist IDs). Or clearly state the entity was not found.",
                  "Optionally call security.list_watchlists AFTERWARDS to translate the watchlist IDs into human-readable names for the response — that's helpful, not an anti-pattern. The criterion is only that get_entity comes first and is the source of truth.",
                  "What's wrong is calling security.list_watchlists FIRST to iterate over all watchlists looking for this entity's memberships — that ignores the fact that the profile already has them.",
                  'Do not fabricate entity or watchlist data.',
                ],
                toolCalls: [
                  {
                    id: 'security.get_entity',
                    criteria: [
                      'The tool is called with an entityId matching "server01" or "host:server01".',
                    ],
                  },
                ],
              },
              metadata: { query_intent: 'Factual' },
            },
          ],
        },
      });
    });
  }
);
