/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default ({ getPageObjects, getService }: FtrProviderContext) => {
  const pageObjects = getPageObjects([
    'common',
    'remoteClusters',
    'indexManagement',
    'crossClusterReplication',
  ]);
  const security = getService('security');
  const retry = getService('retry');
  const testSubjects = getService('testSubjects');
  const remoteEs = getService('remoteEs' as 'es');
  const localEs = getService('es');

  describe('CCS Remote Clusters > Index Management', function () {
    const leaderName = 'my-index';
    const followerName = 'my-follower';
    before(async () => {
      await security.testUser.setRoles(['superuser']);
      // This test is temporarily using superuser because of an issue with the permissions
      // of the follower index creation wizard. There is an open issue to address the issue.
      // We can change the permissions to use follower_index_user once the issue is fixed.
      // https://github.com/elastic/kibana/issues/143720
      // await security.testUser.setRoles(['follower_index_user']);
    });

    describe('Remote Clusters', function () {
      before(async () => {
        await pageObjects.common.navigateToApp('remoteClusters');
      });

      it('Verify "ftr-remote" remote cluster exists', async () => {
        await retry.waitFor('table to be visible', async () => {
          return await testSubjects.isDisplayed('remoteClusterListTable');
        });
        const remotes = await pageObjects.remoteClusters.getRemoteClustersList();
        const filteredRemotes = remotes.filter((remote) => remote.remoteName === 'ftr-remote');
        expect(filteredRemotes.length).to.eql(1);
        expect(filteredRemotes[0].remoteAddress).to.contain('localhost');
        expect(filteredRemotes[0].remoteStatus).to.eql('Connected');
        expect(filteredRemotes[0].remoteConnectionCount).to.eql('1');
        expect(filteredRemotes[0].remoteMode).to.eql('default');
      });
    });

    describe('Cross Cluster Replication', function () {
      before(async () => {
        await remoteEs.indices.create({
          index: leaderName,
          settings: { number_of_shards: 1, soft_deletes: { enabled: true } },
        });
        await pageObjects.common.navigateToApp('crossClusterReplication');
        await retry.waitFor('indices table to be visible', async () => {
          return await testSubjects.isDisplayed('createFollowerIndexButton');
        });
      });
      it('Create Follower Index', async () => {
        await pageObjects.crossClusterReplication.clickCreateFollowerIndexButton();
        await pageObjects.crossClusterReplication.createFollowerIndex(
          leaderName,
          followerName,
          true,
          '1s'
        );
      });
    });
    describe('Index Management', function () {
      before(async () => {
        await remoteEs.index({
          index: leaderName,
          document: { a: 'b' },
        });
        await pageObjects.common.navigateToApp('indexManagement');
        await retry.waitForWithTimeout('indices table to be visible', 15000, async () => {
          return await testSubjects.isDisplayed('indicesList');
        });
      });
      it('Verify that the follower index is duplicating from the remote.', async () => {
        await pageObjects.indexManagement.clickIndexAt(0);
        await pageObjects.indexManagement.performIndexAction('flush');
        await testSubjects.click('appHeaderBack');
        await pageObjects.common.navigateToApp('indexManagement');
        await retry.waitForWithTimeout('indices table to be visible', 15000, async () => {
          return await testSubjects.isDisplayed('indicesList');
          const indicesList = await pageObjects.indexManagement.getIndexList();
          const followerIndex = indicesList.filter(
            (follower) => follower.indexName === followerName
          );
          expect(followerIndex[0].indexDocuments).to.eql('1');
        });
      });
    });

    after(async () => {
      await localEs.indices.delete({
        index: followerName,
      });
      await remoteEs.indices.delete({
        index: leaderName,
      });
      await security.testUser.restoreDefaults();
    });
  });
};
