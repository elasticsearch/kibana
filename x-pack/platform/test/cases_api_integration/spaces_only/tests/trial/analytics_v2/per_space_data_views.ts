/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { Client as ESClient } from '@elastic/elasticsearch';
import type { FtrProviderContext } from '../../../../common/ftr_provider_context';
import { getPostCaseRequest } from '../../../../common/lib/mock';
import { createCase, deleteAllCaseItems, getAuthWithSuperUser } from '../../../../common/lib/api';
import { DATA_VIEW_ID_PREFIX, resetV2 } from './helpers';

/**
 * Verifies the per-space data view model:
 *
 *   1. Visiting Cases in a space bootstraps a managed data view
 *      scoped to that space (`namespaces: [<spaceId>]`), with id
 *      `cases-analytics-managed-<spaceId>`.
 *   2. Different spaces produce different data view SOs.
 *   3. The `.cases` index itself stays cluster-level — only the
 *      view is per-space.
 *
 * Template-driven runtime field isolation (space-A's
 * template-declared extended fields shouldn't appear in space-B's
 * view) is covered structurally by the unit tests on the data view
 * service.
 */
export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const es = getService('es');
  const authSpace1 = getAuthWithSuperUser('space1');
  const authSpace2 = getAuthWithSuperUser('space2');

  describe('per-space data views', () => {
    afterEach(async () => {
      await deleteAllCaseItems(es);
      await resetV2(supertest);
    });

    it('bootstraps a separate data view per space on first cases request', async () => {
      // Fire a cases request in space1 — the request handler
      // context's ensure hook bootstraps
      // `cases-analytics-managed-space1`.
      await createCase(supertestWithoutAuth, getPostCaseRequest(), 200, authSpace1);

      // Same in space2 — bootstraps `cases-analytics-managed-space2`.
      await createCase(supertestWithoutAuth, getPostCaseRequest(), 200, authSpace2);

      // Poll for both SOs to appear. Bootstrap is fire-and-forget
      // via the route handler context, so the request returns
      // before the data view is necessarily persisted.
      const space1Id = `${DATA_VIEW_ID_PREFIX}space1`;
      const space2Id = `${DATA_VIEW_ID_PREFIX}space2`;
      await waitForDataViewExists(es, space1Id);
      await waitForDataViewExists(es, space2Id);

      // Each is scoped to its own namespace, not `['*']`.
      const space1View = await getDataViewSO(es, space1Id);
      const space2View = await getDataViewSO(es, space2Id);
      expect(space1View.namespaces).to.eql(['space1']);
      expect(space2View.namespaces).to.eql(['space2']);

      // Both views point at the same cluster-level index.
      expect(space1View['index-pattern'].title).to.eql('.cases');
      expect(space2View['index-pattern'].title).to.eql('.cases');
    });

    it('is idempotent: repeated cases requests in the same space do not create duplicates', async () => {
      // The in-process bootstrappedSpaces cache short-circuits
      // after the first ensure. Fire several requests and verify
      // only one SO exists.
      await createCase(supertestWithoutAuth, getPostCaseRequest(), 200, authSpace1);
      await createCase(supertestWithoutAuth, getPostCaseRequest(), 200, authSpace1);
      await createCase(supertestWithoutAuth, getPostCaseRequest(), 200, authSpace1);

      const space1Id = `${DATA_VIEW_ID_PREFIX}space1`;
      await waitForDataViewExists(es, space1Id);

      const result = await es.search({
        index: '.kibana*',
        query: {
          bool: {
            filter: [
              { term: { type: 'index-pattern' } },
              { term: { _id: `index-pattern:${space1Id}` } },
            ],
          },
        },
      });
      const total =
        typeof result.hits.total === 'number' ? result.hits.total : result.hits.total?.value ?? 0;
      expect(total).to.eql(1);
    });
  });
};

// Helpers below — local to this file because they query the Kibana
// SO index directly (not via the cases or data views REST APIs),
// which the standard test helpers don't expose.

const DATA_VIEW_SO_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 200;

async function waitForDataViewExists(es: ESClient, id: string): Promise<void> {
  const deadline = Date.now() + DATA_VIEW_SO_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const result = await es.search({
        index: '.kibana*',
        query: {
          bool: {
            filter: [{ term: { type: 'index-pattern' } }, { term: { _id: `index-pattern:${id}` } }],
          },
        },
      });
      const total =
        typeof result.hits.total === 'number' ? result.hits.total : result.hits.total?.value ?? 0;
      if (total > 0) return;
    } catch {
      // ignore — keep polling
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for data view SO ${id}`);
}

async function getDataViewSO(es: ESClient, id: string): Promise<DataViewSOShape> {
  const result = await es.search<DataViewSOShape>({
    index: '.kibana*',
    query: {
      bool: {
        filter: [{ term: { type: 'index-pattern' } }, { term: { _id: `index-pattern:${id}` } }],
      },
    },
  });
  const hit = result.hits.hits[0];
  if (!hit?._source) {
    throw new Error(`data view SO not found: ${id}`);
  }
  return hit._source;
}

interface DataViewSOShape {
  namespaces?: string[];
  'index-pattern': {
    title: string;
    name?: string;
  };
}
