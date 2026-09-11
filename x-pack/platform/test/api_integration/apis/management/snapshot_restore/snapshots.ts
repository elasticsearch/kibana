/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';

import type { SnapshotDetails } from '@kbn/snapshot-restore-plugin/common/types';
import type { FtrProviderContext } from '../../../ftr_provider_context';
import type { SlmPolicy } from './lib';
import { registerEsHelpers } from './lib';

const REPO_NAME_1 = 'test_repo_1';
const REPO_NAME_2 = 'test_another_repo_2';
const REPO_PATH_1 = '/tmp/repo_1';
const REPO_PATH_2 = '/tmp/repo_2';
// SLM policies to test policyName filter
const POLICY_NAME_1 = 'test_policy_1';
const POLICY_NAME_2 = 'test_another_policy_2';
const POLICY_SNAPSHOT_NAME_1 = 'backup_snapshot';
const POLICY_SNAPSHOT_NAME_2 = 'a_snapshot';
// snapshots created without SLM policies
const BATCH_SIZE_1 = 3;
const BATCH_SIZE_2 = 5;
const BATCH_SNAPSHOT_NAME_1 = 'another_snapshot';
const BATCH_SNAPSHOT_NAME_2 = 'xyz_another_snapshot';
// total count consists of both batches' sizes + 2 snapshots created by 2 SLM policies (one each)
const SNAPSHOT_COUNT = BATCH_SIZE_1 + BATCH_SIZE_2 + 2;
// API defaults used in the UI
const PAGE_INDEX = 0;
const PAGE_SIZE = 20;
const SORT_FIELD = 'startTimeInMillis';
const SORT_DIRECTION = 'desc';

interface ApiParams {
  pageIndex?: number;
  pageSize?: number;

  sortField?: string;
  sortDirection?: string;

  searchField?: string;
  searchValue?: string;
  searchMatch?: string;
  searchOperator?: string;
}
const getApiPath = ({
  pageIndex,
  pageSize,
  sortField,
  sortDirection,
  searchField,
  searchValue,
  searchMatch,
  searchOperator,
}: ApiParams): string => {
  let path = `/api/snapshot_restore/snapshots?sortField=${sortField ?? SORT_FIELD}&sortDirection=${
    sortDirection ?? SORT_DIRECTION
  }&pageIndex=${pageIndex ?? PAGE_INDEX}&pageSize=${pageSize ?? PAGE_SIZE}`;
  // all 4 parameters should be used at the same time to configure the correct search request
  if (searchField && searchValue && searchMatch && searchOperator) {
    path = `${path}&searchField=${searchField}&searchValue=${searchValue}&searchMatch=${searchMatch}&searchOperator=${searchOperator}`;
  }
  return path;
};
const getPolicyBody = (policy: Partial<SlmPolicy>): SlmPolicy => {
  return {
    policyName: 'default_policy',
    name: 'default_snapshot',
    schedule: '0 30 1 * * ?',
    repository: 'default_repo',
    isManagedPolicy: false,
    config: {
      indices: ['default_index'],
      ignoreUnavailable: true,
    },
    ...policy,
  };
};

export default function ({ getService }: FtrProviderContext) {
  const supertest = getService('supertest');
  const es = getService('es');

  const {
    createSnapshot,
    createRepository,
    createPolicy,
    executePolicy,
    cleanupPolicies,
    deleteSnapshots,
  } = registerEsHelpers(getService);

  describe('Snapshots', function () {
    this.tags(['skipCloud']); // file system repositories are not supported in cloud

    // names of snapshots created by SLM policies have random suffixes, save full names for tests
    let snapshotName1: string;
    let snapshotName2: string;

    before(async () => {
      /*
       * This setup creates following repos, SLM policies and snapshots:
       * Repo 1 "test_repo_1" with 5 snapshots
       * "backup_snapshot..." (created by SLM policy "test_policy_1")
       * "a_snapshot..." (created by SLM policy "test_another_policy_2")
       * "another_snapshot_0" to "another_snapshot_2" (no SLM policy)
       *
       * Repo 2 "test_another_repo_2" with 5 snapshots
       * "xyz_another_snapshot_0" to "xyz_another_snapshot_4" (no SLM policy)
       */
      try {
        await createRepository(REPO_NAME_1, REPO_PATH_1);
        await createRepository(REPO_NAME_2, REPO_PATH_2);
        await createPolicy(
          getPolicyBody({
            policyName: POLICY_NAME_1,
            repository: REPO_NAME_1,
            name: POLICY_SNAPSHOT_NAME_1,
          }),
          true
        );
        await createPolicy(
          getPolicyBody({
            policyName: POLICY_NAME_2,
            repository: REPO_NAME_1,
            name: POLICY_SNAPSHOT_NAME_2,
          }),
          true
        );
        ({ snapshot_name: snapshotName1 } = await executePolicy(POLICY_NAME_1));
        // a short timeout to let the 1st snapshot start, otherwise the sorting by start time might be flaky
        await new Promise((resolve) => setTimeout(resolve, 2000));
        ({ snapshot_name: snapshotName2 } = await executePolicy(POLICY_NAME_2));
        for (let i = 0; i < BATCH_SIZE_1; i++) {
          await createSnapshot(`${BATCH_SNAPSHOT_NAME_1}_${i}`, REPO_NAME_1);
        }
        for (let i = 0; i < BATCH_SIZE_2; i++) {
          await createSnapshot(`${BATCH_SNAPSHOT_NAME_2}_${i}`, REPO_NAME_2);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.log('[Setup error] Error creating snapshots');
        throw err;
      }
    });

    after(async () => {
      await cleanupPolicies();
      await deleteSnapshots(REPO_NAME_1);
      await deleteSnapshots(REPO_NAME_2);
    });

    describe('pagination', () => {
      it('returns pageSize number of snapshots', async () => {
        const pageSize = 7;
        const {
          body: { total, snapshots },
        } = await supertest
          .get(
            getApiPath({
              pageSize,
            })
          )
          .set('kbn-xsrf', 'xxx')
          .send();
        expect(total).to.eql(SNAPSHOT_COUNT);
        expect(snapshots.length).to.eql(pageSize);
      });

      it('returns next page of snapshots', async () => {
        const pageSize = 3;
        let pageIndex = 0;
        const {
          body: { snapshots: firstPageSnapshots },
        } = await supertest
          .get(
            getApiPath({
              pageIndex,
              pageSize,
            })
          )
          .set('kbn-xsrf', 'xxx')
          .send();

        const firstPageSnapshotName = firstPageSnapshots[0].snapshot;
        expect(firstPageSnapshots.length).to.eql(pageSize);

        pageIndex = 1;
        const {
          body: { snapshots: secondPageSnapshots },
        } = await supertest
          .get(
            getApiPath({
              pageIndex,
              pageSize,
            })
          )
          .set('kbn-xsrf', 'xxx')
          .send();

        const secondPageSnapshotName = secondPageSnapshots[0].snapshot;
        expect(secondPageSnapshots.length).to.eql(pageSize);
        expect(secondPageSnapshotName).to.not.eql(firstPageSnapshotName);
      });
    });

    describe('sorting', () => {
      it('sorts by snapshot name (asc)', async () => {
        const {
          body: { snapshots },
        } = await supertest
          .get(
            getApiPath({
              sortField: 'snapshot',
              sortDirection: 'asc',
            })
          )
          .set('kbn-xsrf', 'xxx')
          .send();

        /*
         * snapshots name in asc order:
         * "a_snapshot...", "another_snapshot...", "backup_snapshot...", "xyz_another_snapshot..."
         */
        const snapshotName = snapshots[0].snapshot;
        // snapshotName2 is "a_snapshot..."
        expect(snapshotName).to.eql(snapshotName2);
      });

      it('sorts by snapshot name (desc)', async () => {
        const {
          body: { snapshots },
        } = await supertest
          .get(
            getApiPath({
              sortField: 'snapshot',
              sortDirection: 'desc',
            })
          )
          .set('kbn-xsrf', 'xxx')
          .send();
        /*
         * snapshots name in desc order:
         * "xyz_another_snapshot...", "backup_snapshot...", "another_snapshot...", "a_snapshot..."
         */
        const snapshotName = snapshots[0].snapshot;
        expect(snapshotName).to.eql('xyz_another_snapshot_4');
      });

      it('sorts by repository name (asc)', async () => {
        const {
          body: { snapshots },
        } = await supertest
          .get(
            getApiPath({
              sortField: 'repository',
              sortDirection: 'asc',
            })
          )
          .set('kbn-xsrf', 'xxx')
          .send();
        // repositories in asc order: "test_another_repo_2", "test_repo_1"
        const repositoryName = snapshots[0].repository;
        expect(repositoryName).to.eql(REPO_NAME_2); // "test_another_repo_2"
      });

      it('sorts by repository name (desc)', async () => {
        const {
          body: { snapshots },
        } = await supertest
          .get(
            getApiPath({
              sortField: 'repository',
              sortDirection: 'desc',
            })
          )
          .set('kbn-xsrf', 'xxx')
          .send();
        // repositories in desc order: "test_repo_1", "test_another_repo_2"
        const repositoryName = snapshots[0].repository;
        expect(repositoryName).to.eql(REPO_NAME_1); // "test_repo_1"
      });

      it('sorts by startTimeInMillis (asc)', async () => {
        const {
          body: { snapshots },
        } = await supertest
          .get(
            getApiPath({
              sortField: 'startTimeInMillis',
              sortDirection: 'asc',
            })
          )
          .set('kbn-xsrf', 'xxx')
          .send();
        const snapshotName = snapshots[0].snapshot;
        // the 1st snapshot that was created during this test setup
        expect(snapshotName).to.eql(snapshotName1);
      });

      it('sorts by startTimeInMillis (desc)', async () => {
        const {
          body: { snapshots },
        } = await supertest
          .get(
            getApiPath({
              sortField: 'startTimeInMillis',
              sortDirection: 'desc',
            })
          )
          .set('kbn-xsrf', 'xxx')
          .send();
        const snapshotName = snapshots[0].snapshot;
        // the last snapshot that was created during this test setup
        expect(snapshotName).to.eql('xyz_another_snapshot_4');
      });

      // these properties are only tested as being accepted by the API
      const sortFields = ['indices', 'durationInMillis', 'shards.total', 'shards.failed'];
      sortFields.forEach((sortField: string) => {
        it(`allows sorting by ${sortField} (asc)`, async () => {
          await supertest
            .get(
              getApiPath({
                sortField,
                sortDirection: 'asc',
              })
            )
            .set('kbn-xsrf', 'xxx')
            .send()
            .expect(200);
        });

        it(`allows sorting by ${sortField} (desc)`, async () => {
          await supertest
            .get(
              getApiPath({
                sortField,
                sortDirection: 'desc',
              })
            )
            .set('kbn-xsrf', 'xxx')
            .send()
            .expect(200);
        });
      });
    });

    describe('search', () => {
      describe('snapshot name', () => {
        it('exact match', async () => {
          // list snapshots with the name "another_snapshot_2"
          const searchField = 'snapshot';
          const searchValue = 'another_snapshot_2';
          const searchMatch = 'must';
          const searchOperator = 'exact';
          const {
            body: { snapshots },
          } = await supertest
            .get(
              getApiPath({
                searchField,
                searchValue,
                searchMatch,
                searchOperator,
              })
            )
            .set('kbn-xsrf', 'xxx')
            .send();

          expect(snapshots.length).to.eql(1);
          expect(snapshots[0].snapshot).to.eql('another_snapshot_2');
        });

        it('partial match', async () => {
          // list snapshots with the name containing with "another"
          const searchField = 'snapshot';
          const searchValue = 'another';
          const searchMatch = 'must';
          const searchOperator = 'eq';
          const {
            body: { snapshots },
          } = await supertest
            .get(
              getApiPath({
                searchField,
                searchValue,
                searchMatch,
                searchOperator,
              })
            )
            .set('kbn-xsrf', 'xxx')
            .send();

          // both batches created snapshots containing "another" in the name
          expect(snapshots.length).to.eql(BATCH_SIZE_1 + BATCH_SIZE_2);
          const snapshotNamesContainSearch = snapshots.every((snapshot: SnapshotDetails) =>
            snapshot.snapshot.includes('another')
          );
          expect(snapshotNamesContainSearch).to.eql(true);
        });

        it('excluding search with exact match', async () => {
          // list snapshots with the name not "another_snapshot_2"
          const searchField = 'snapshot';
          const searchValue = 'another_snapshot_2';
          const searchMatch = 'must_not';
          const searchOperator = 'exact';
          const {
            body: { snapshots },
          } = await supertest
            .get(
              getApiPath({
                searchField,
                searchValue,
                searchMatch,
                searchOperator,
              })
            )
            .set('kbn-xsrf', 'xxx')
            .send();

          expect(snapshots.length).to.eql(SNAPSHOT_COUNT - 1);
          const snapshotIsExcluded = snapshots.every(
            (snapshot: SnapshotDetails) => snapshot.snapshot !== 'another_snapshot_2'
          );
          expect(snapshotIsExcluded).to.eql(true);
        });

        it('excluding search with partial match', async () => {
          // list snapshots with the name not starting with "another"
          const searchField = 'snapshot';
          const searchValue = 'another';
          const searchMatch = 'must_not';
          const searchOperator = 'eq';
          const {
            body: { snapshots },
          } = await supertest
            .get(
              getApiPath({
                searchField,
                searchValue,
                searchMatch,
                searchOperator,
              })
            )
            .set('kbn-xsrf', 'xxx')
            .send();

          // both batches created snapshots with names containing "another"
          expect(snapshots.length).to.eql(SNAPSHOT_COUNT - BATCH_SIZE_1 - BATCH_SIZE_2);
          const snapshotsAreExcluded = snapshots.every(
            (snapshot: SnapshotDetails) => !snapshot.snapshot.includes('another')
          );
          expect(snapshotsAreExcluded).to.eql(true);
        });
      });

      describe('repository name', () => {
        it('search for non-existent repository returns an empty snapshot array', async () => {
          // search for non-existent repository
          const searchField = 'repository';
          const searchValue = 'non-existent';
          const searchMatch = 'must';
          const searchOperator = 'exact';
          const {
            body: { snapshots },
          } = await supertest
            .get(
              getApiPath({
                searchField,
                searchValue,
                searchMatch,
                searchOperator,
              })
            )
            .set('kbn-xsrf', 'xxx')
            .send();

          expect(snapshots.length).to.eql(0);
        });

        it('exact match', async () => {
          // list snapshots from repository "test_repo_1"
          const searchField = 'repository';
          const searchValue = REPO_NAME_1;
          const searchMatch = 'must';
          const searchOperator = 'exact';
          const {
            body: { snapshots },
          } = await supertest
            .get(
              getApiPath({
                searchField,
                searchValue,
                searchMatch,
                searchOperator,
              })
            )
            .set('kbn-xsrf', 'xxx')
            .send();

          // repo 1 contains snapshots from batch 1 and 2 snapshots created by 2 SLM policies
          expect(snapshots.length).to.eql(BATCH_SIZE_1 + 2);
          const repositoryNameMatches = snapshots.every(
            (snapshot: SnapshotDetails) => snapshot.repository === REPO_NAME_1
          );
          expect(repositoryNameMatches).to.eql(true);
        });

        it('partial match', async () => {
          // list snapshots from repository with the name containing "another"
          // i.e. snapshots from repo 2
          const searchField = 'repository';
          const searchValue = 'another';
          const searchMatch = 'must';
          const searchOperator = 'eq';
          const {
            body: { snapshots },
          } = await supertest
            .get(
              getApiPath({
                searchField,
                searchValue,
                searchMatch,
                searchOperator,
              })
            )
            .set('kbn-xsrf', 'xxx')
            .send();

          // repo 2 only contains snapshots created by batch 2
          expect(snapshots.length).to.eql(BATCH_SIZE_2);
          const repositoryNameMatches = snapshots.every((snapshot: SnapshotDetails) =>
            snapshot.repository.includes('another')
          );
          expect(repositoryNameMatches).to.eql(true);
        });

        it('excluding search with exact match', async () => {
          // list snapshots from repositories with the name not "test_repo_1"
          const searchField = 'repository';
          const searchValue = REPO_NAME_1;
          const searchMatch = 'must_not';
          const searchOperator = 'exact';
          const {
            body: { snapshots },
          } = await supertest
            .get(
              getApiPath({
                searchField,
                searchValue,
                searchMatch,
                searchOperator,
              })
            )
            .set('kbn-xsrf', 'xxx')
            .send();

          // snapshots not in repo 1 are only snapshots created in batch 2
          expect(snapshots.length).to.eql(BATCH_SIZE_2);
          const repositoryNameMatches = snapshots.every(
            (snapshot: SnapshotDetails) => snapshot.repository !== REPO_NAME_1
          );
          expect(repositoryNameMatches).to.eql(true);
        });

        it('excluding search with partial match', async () => {
          // list snapshots from repository with the name not containing "test"
          const searchField = 'repository';
          const searchValue = 'test';
          const searchMatch = 'must_not';
          const searchOperator = 'eq';
          const {
            body: { snapshots },
          } = await supertest
            .get(
              getApiPath({
                searchField,
                searchValue,
                searchMatch,
                searchOperator,
              })
            )
            .set('kbn-xsrf', 'xxx')
            .send();

          expect(snapshots.length).to.eql(0);
        });
      });

      describe('policy name', () => {
        it('search for non-existent policy returns an empty snapshot array', async () => {
          // search for non-existent policy
          const searchField = 'policyName';
          const searchValue = 'non-existent';
          const searchMatch = 'must';
          const searchOperator = 'exact';
          const {
            body: { snapshots },
          } = await supertest
            .get(
              getApiPath({
                searchField,
                searchValue,
                searchMatch,
                searchOperator,
              })
            )
            .set('kbn-xsrf', 'xxx')
            .send();

          expect(snapshots.length).to.eql(0);
        });

        it('exact match', async () => {
          // list snapshots created by the policy "test_policy_1"
          const searchField = 'policyName';
          const searchValue = POLICY_NAME_1;
          const searchMatch = 'must';
          const searchOperator = 'exact';
          const {
            body: { snapshots },
          } = await supertest
            .get(
              getApiPath({
                searchField,
                searchValue,
                searchMatch,
                searchOperator,
              })
            )
            .set('kbn-xsrf', 'xxx')
            .send();

          expect(snapshots.length).to.eql(1);
          expect(snapshots[0].policyName).to.eql(POLICY_NAME_1);
        });

        it('partial match', async () => {
          // list snapshots created by the policy with the name containing "another"
          const searchField = 'policyName';
          const searchValue = 'another';
          const searchMatch = 'must';
          const searchOperator = 'eq';
          const {
            body: { snapshots },
          } = await supertest
            .get(
              getApiPath({
                searchField,
                searchValue,
                searchMatch,
                searchOperator,
              })
            )
            .set('kbn-xsrf', 'xxx')
            .send();

          // 1 snapshot was created by the policy "test_another_policy_2"
          expect(snapshots.length).to.eql(1);
          const policyNameMatches = snapshots.every((snapshot: SnapshotDetails) =>
            snapshot.policyName!.includes('another')
          );
          expect(policyNameMatches).to.eql(true);
        });

        it('excluding search with exact match', async () => {
          // list snapshots created by the policy with the name not "test_policy_1"
          const searchField = 'policyName';
          const searchValue = POLICY_NAME_1;
          const searchMatch = 'must_not';
          const searchOperator = 'exact';
          const {
            body: { snapshots },
          } = await supertest
            .get(
              getApiPath({
                searchField,
                searchValue,
                searchMatch,
                searchOperator,
              })
            )
            .set('kbn-xsrf', 'xxx')
            .send();

          // only 1 snapshot was created by policy 1
          // search results should also contain snapshots without SLM policy
          expect(snapshots.length).to.eql(SNAPSHOT_COUNT - 1);
          const snapshotsExcluded = snapshots.every(
            (snapshot: SnapshotDetails) => (snapshot.policyName ?? '') !== POLICY_NAME_1
          );
          expect(snapshotsExcluded).to.eql(true);
        });

        it('excluding search with partial match', async () => {
          // list snapshots created by the policy with the name not containing "another"
          const searchField = 'policyName';
          const searchValue = 'another';
          const searchMatch = 'must_not';
          const searchOperator = 'eq';
          const {
            body: { snapshots },
          } = await supertest
            .get(
              getApiPath({
                searchField,
                searchValue,
                searchMatch,
                searchOperator,
              })
            )
            .set('kbn-xsrf', 'xxx')
            .send();

          // only 1 snapshot was created by SLM policy containing "another" in the name
          // search results should also contain snapshots without SLM policy
          expect(snapshots.length).to.eql(SNAPSHOT_COUNT - 1);
          const snapshotsExcluded = snapshots.every(
            (snapshot: SnapshotDetails) => !(snapshot.policyName ?? '').includes('another')
          );
          expect(snapshotsExcluded).to.eql(true);
        });
      });
    });

    // Runs last: it creates and removes its own snapshots so the counts asserted above stay intact
    describe('bulk_delete', () => {
      const BULK_DELETE_SNAPSHOT_1 = 'bulk_delete_snapshot_1';
      const BULK_DELETE_SNAPSHOT_2 = 'bulk_delete_snapshot_2';
      const BULK_DELETE_SNAPSHOT_3 = 'bulk_delete_snapshot_3';
      const MISSING_SNAPSHOT_NAME = 'bulk_delete_missing_snapshot';

      const getSnapshotsTotal = async (): Promise<number> => {
        const {
          body: { total },
        } = await supertest.get(getApiPath({})).set('kbn-xsrf', 'xxx').send();
        return total;
      };

      const bulkDelete = (snapshots: Array<{ repository: string; snapshot: string }>) =>
        supertest
          .post('/api/snapshot_restore/snapshots/bulk_delete')
          .set('kbn-xsrf', 'xxx')
          .send(snapshots);

      beforeEach(async () => {
        await es.snapshot.create({
          repository: REPO_NAME_1,
          snapshot: BULK_DELETE_SNAPSHOT_1,
          wait_for_completion: true,
        });
        await es.snapshot.create({
          repository: REPO_NAME_1,
          snapshot: BULK_DELETE_SNAPSHOT_2,
          wait_for_completion: true,
        });
        await es.snapshot.create({
          repository: REPO_NAME_2,
          snapshot: BULK_DELETE_SNAPSHOT_3,
          wait_for_completion: true,
        });
      });

      afterEach(async () => {
        await es.snapshot.delete({ repository: REPO_NAME_1, snapshot: 'bulk_delete_*' });
        await es.snapshot.delete({ repository: REPO_NAME_2, snapshot: 'bulk_delete_*' });
      });

      it('deletes snapshots from several repositories in one request', async () => {
        const { body } = await bulkDelete([
          { repository: REPO_NAME_1, snapshot: BULK_DELETE_SNAPSHOT_1 },
          { repository: REPO_NAME_2, snapshot: BULK_DELETE_SNAPSHOT_3 },
          { repository: REPO_NAME_1, snapshot: BULK_DELETE_SNAPSHOT_2 },
        ]).expect(200);

        expect(body).to.eql({
          itemsDeleted: [
            { snapshot: BULK_DELETE_SNAPSHOT_1, repository: REPO_NAME_1 },
            { snapshot: BULK_DELETE_SNAPSHOT_2, repository: REPO_NAME_1 },
            { snapshot: BULK_DELETE_SNAPSHOT_3, repository: REPO_NAME_2 },
          ],
          errors: [],
        });
        expect(await getSnapshotsTotal()).to.eql(SNAPSHOT_COUNT);
      });

      it('reports only the missing snapshot and still deletes the others', async () => {
        const { body } = await bulkDelete([
          { repository: REPO_NAME_1, snapshot: MISSING_SNAPSHOT_NAME },
          { repository: REPO_NAME_1, snapshot: BULK_DELETE_SNAPSHOT_1 },
          { repository: REPO_NAME_2, snapshot: BULK_DELETE_SNAPSHOT_3 },
        ]).expect(200);

        expect(body.itemsDeleted).to.eql([
          { snapshot: BULK_DELETE_SNAPSHOT_1, repository: REPO_NAME_1 },
          { snapshot: BULK_DELETE_SNAPSHOT_3, repository: REPO_NAME_2 },
        ]);
        expect(body.errors.map(({ id }: { id: unknown }) => id)).to.eql([
          { snapshot: MISSING_SNAPSHOT_NAME, repository: REPO_NAME_1 },
        ]);
        expect(body.errors[0].error.statusCode).to.eql(404);
        // only BULK_DELETE_SNAPSHOT_2 in REPO_NAME_1 is left from this test's fixtures
        expect(await getSnapshotsTotal()).to.eql(SNAPSHOT_COUNT + 1);
      });
    });
  });
}
