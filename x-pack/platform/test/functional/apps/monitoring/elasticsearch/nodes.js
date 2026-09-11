/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { getLifecycleMethods } from '../_get_lifecycle_methods';

export default function ({ getService, getPageObjects }) {
  const overview = getService('monitoringClusterOverview');
  const nodesList = getService('monitoringElasticsearchNodes');
  const esClusterSummaryStatus = getService('monitoringElasticsearchSummaryStatus');
  const retry = getService('retry');

  describe('Elasticsearch nodes listing', function () {
    // FF issue: https://github.com/elastic/kibana/issues/35551
    this.tags(['skipFirefox']);

    describe('with offline node', () => {
      const { setup, tearDown } = getLifecycleMethods(getService, getPageObjects);

      before(async () => {
        await setup(
          'x-pack/platform/test/fixtures/es_archives/monitoring/singlecluster_three_nodes_shard_relocation',
          {
            from: 'Oct 5, 2017 @ 20:28:28.475',
            to: 'Oct 5, 2017 @ 20:34:38.341',
          }
        );

        await overview.closeAlertsModal();

        // go to nodes listing
        await overview.clickEsNodes();
        expect(await nodesList.isOnListing()).to.be(true);
      });

      after(async () => {
        await tearDown();
      });

      it('should have an Elasticsearch Cluster Summary Status with correct info', async () => {
        expect(await esClusterSummaryStatus.getContent()).to.eql({
          nodesCount: 'Nodes\n2',
          indicesCount: 'Indices\n20',
          memory: 'JVM Heap\n696.6 MB / 1.3 GB',
          totalShards: 'Total shards\n79',
          unassignedShards: 'Unassigned shards\n7',
          documentCount: 'Documents\n25,758',
          dataSize: 'Data\n100.0 MB',
          health: 'Health: yellow',
        });
      });

      describe('skipCloud', function () {
        // TODO: https://github.com/elastic/stack-monitoring/issues/31
        this.tags(['skipCloud']);

        it('should have a nodes table with correct rows with default sorting', async () => {
          // retry in case the table hasn't had time to re-render
          await retry.try(async () => {
            const rows = await nodesList.getRows();
            expect(rows.length).to.be(3);

            const nodesAll = await nodesList.getNodesAll();
            const tableData = [
              {
                name: 'whatever-01',
                status: 'Status: Online',
                cpu: '0%',
                cpuText:
                  'Trending\nup\nMax value\n3%\nMin value\n0%\nApplies to current time period',
                load: '3.28',
                loadText:
                  'Trending\nup\nMax value\n3.71\nMin value\n2.19\nApplies to current time period',
                memory: '39%',
                memoryText:
                  'Trending\ndown\nMax value\n52%\nMin value\n25%\nApplies to current time period',
                disk: '173.9 GB',
                diskText:
                  'Trending\ndown\nMax value\n173.9 GB\nMin value\n173.9 GB\nApplies to current time period',
                shards: '38',
              },
              {
                name: 'whatever-02',
                status: 'Status: Online',
                cpu: '2%',
                cpuText:
                  'Trending\ndown\nMax value\n3%\nMin value\n0%\nApplies to current time period',
                load: '3.28',
                loadText:
                  'Trending\nup\nMax value\n3.73\nMin value\n2.29\nApplies to current time period',
                memory: '25%',
                memoryText:
                  'Trending\ndown\nMax value\n49%\nMin value\n25%\nApplies to current time period',
                disk: '173.9 GB',
                diskText:
                  'Trending\ndown\nMax value\n173.9 GB\nMin value\n173.9 GB\nApplies to current time period',
                shards: '38',
              },
              { name: 'whatever-03', status: 'Status: Offline' },
            ];
            nodesAll.forEach((obj, node) => {
              expect(nodesAll[node].name).to.be(tableData[node].name);
              expect(nodesAll[node].status).to.be(tableData[node].status);
              expect(nodesAll[node].cpu).to.be(tableData[node].cpu);
              expect(nodesAll[node].cpuText).to.be(tableData[node].cpuText);
              expect(nodesAll[node].load).to.be(tableData[node].load);
              expect(nodesAll[node].loadText).to.be(tableData[node].loadText);
              expect(nodesAll[node].memory).to.be(tableData[node].memory);
              expect(nodesAll[node].memoryText).to.be(tableData[node].memoryText);
              expect(nodesAll[node].disk).to.be(tableData[node].disk);
              expect(nodesAll[node].diskText).to.be(tableData[node].diskText);
              expect(nodesAll[node].shards).to.be(tableData[node].shards);
            });
          });
        });

        it('should sort by cpu', async () => {
          await nodesList.clickCpuCol();
          await nodesList.clickCpuCol();

          // retry in case the table hasn't had time to re-render
          await retry.try(async () => {
            const nodesAll = await nodesList.getNodesAll();
            const tableData = [
              {
                cpu: '2%',
                cpuText:
                  'Trending\ndown\nMax value\n3%\nMin value\n0%\nApplies to current time period',
              },
              {
                cpu: '0%',
                cpuText:
                  'Trending\nup\nMax value\n3%\nMin value\n0%\nApplies to current time period',
              },
              { cpu: undefined, cpuText: undefined },
            ];
            nodesAll.forEach((obj, node) => {
              expect(nodesAll[node].cpu).to.be(tableData[node].cpu);
              expect(nodesAll[node].cpuText).to.be(tableData[node].cpuText);
            });
          });
        });

        it('should sort by load average', async () => {
          await nodesList.clickLoadCol();
          await nodesList.clickLoadCol();

          // retry in case the table hasn't had time to re-render
          await retry.try(async () => {
            const nodesAll = await nodesList.getNodesAll();
            const tableData = [
              {
                load: '3.28',
                loadText:
                  'Trending\nup\nMax value\n3.71\nMin value\n2.19\nApplies to current time period',
              },
              {
                load: '3.28',
                loadText:
                  'Trending\nup\nMax value\n3.73\nMin value\n2.29\nApplies to current time period',
              },
              { load: undefined },
            ];
            nodesAll.forEach((obj, node) => {
              expect(nodesAll[node].load).to.be(tableData[node].load);
              expect(nodesAll[node].loadText).to.be(tableData[node].loadText);
            });
          });
        });
      });

      it('should sort by name', async () => {
        await nodesList.clickNameCol();
        await nodesList.clickNameCol();

        // retry in case the table hasn't had time to re-render
        await retry.try(async () => {
          const nodesAll = await nodesList.getNodesAll();
          const tableData = [
            { name: 'whatever-01' },
            { name: 'whatever-02' },
            { name: 'whatever-03' },
          ];
          nodesAll.forEach((obj, node) => {
            expect(nodesAll[node].name).to.be(tableData[node].name);
          });
        });
      });

      it('should sort by status', async () => {
        await nodesList.clickStatusCol();
        await nodesList.clickStatusCol();

        // retry in case the table hasn't had time to re-render
        await retry.try(async () => {
          const nodesAll = await nodesList.getNodesAll();
          const tableData = [
            { status: 'Status: Online' },
            { status: 'Status: Online' },
            { status: 'Status: Offline' },
          ];
          nodesAll.forEach((obj, node) => {
            expect(nodesAll[node].status).to.be(tableData[node].status);
          });
        });
      });

      it('should sort by memory', async () => {
        await nodesList.clickMemoryCol();
        await nodesList.clickMemoryCol();

        // retry in case the table hasn't had time to re-render
        await retry.try(async () => {
          const nodesAll = await nodesList.getNodesAll();
          const tableData = [
            {
              memory: '39%',
              memoryText:
                'Trending\ndown\nMax value\n52%\nMin value\n25%\nApplies to current time period',
            },
            {
              memory: '25%',
              memoryText:
                'Trending\ndown\nMax value\n49%\nMin value\n25%\nApplies to current time period',
            },
            { memory: undefined, memoryText: undefined },
          ];
          nodesAll.forEach((obj, node) => {
            expect(nodesAll[node].memory).to.be(tableData[node].memory);
            expect(nodesAll[node].memoryText).to.be(tableData[node].memoryText);
          });
        });
      });

      it('should sort by disk', async () => {
        await nodesList.clickDiskCol();
        await nodesList.clickDiskCol();

        // retry in case the table hasn't had time to re-render
        await retry.try(async () => {
          const nodesAll = await nodesList.getNodesAll();
          const tableData = [
            {
              disk: '173.9 GB',
              diskText:
                'Trending\ndown\nMax value\n173.9 GB\nMin value\n173.9 GB\nApplies to current time period',
            },
            {
              disk: '173.9 GB',
              diskText:
                'Trending\ndown\nMax value\n173.9 GB\nMin value\n173.9 GB\nApplies to current time period',
            },
            { disk: undefined },
          ];
          nodesAll.forEach((obj, node) => {
            expect(nodesAll[node].disk).to.be(tableData[node].disk);
            expect(nodesAll[node].diskText).to.be(tableData[node].diskText);
          });
        });
      });

      it('should sort by shards', async () => {
        await nodesList.clickShardsCol();
        await nodesList.clickShardsCol();

        // retry in case the table hasn't had time to re-render
        await retry.try(async () => {
          const nodesAll = await nodesList.getNodesAll();
          const tableData = [{ shards: '38' }, { shards: '38' }, { shards: undefined }];
          nodesAll.forEach((obj, node) => {
            expect(nodesAll[node].shards).to.be(tableData[node].shards);
          });
        });
      });
    });

    describe('with only online nodes', () => {
      const { setup, tearDown } = getLifecycleMethods(getService, getPageObjects);

      before(async () => {
        await setup(
          'x-pack/platform/test/fixtures/es_archives/monitoring/singlecluster_three_nodes_shard_relocation',
          {
            from: 'Oct 5, 2017 @ 20:31:48.354',
            to: 'Oct 5, 2017 @ 20:35:12.176',
          }
        );

        await overview.closeAlertsModal();

        // go to nodes listing
        await overview.clickEsNodes();
        expect(await nodesList.isOnListing()).to.be(true);
      });

      after(async () => {
        await tearDown();
      });

      it('should have an Elasticsearch Cluster Summary Status with correct info', async () => {
        expect(await esClusterSummaryStatus.getContent()).to.eql({
          nodesCount: 'Nodes\n3',
          indicesCount: 'Indices\n20',
          memory: 'JVM Heap\n575.3 MB / 2.0 GB',
          totalShards: 'Total shards\n80',
          unassignedShards: 'Unassigned shards\n5',
          documentCount: 'Documents\n25,927',
          dataSize: 'Data\n101.6 MB',
          health: 'Health: yellow',
        });
      });

      it('should filter for specific indices', async () => {
        await nodesList.setFilter('01');

        // retry in case the table hasn't had time to re-render
        await retry.try(async () => {
          const rows = await nodesList.getRows();
          expect(rows.length).to.be(1);
        });

        await nodesList.clearFilter();
      });

      it('should filter for non-existent index', async () => {
        await nodesList.setFilter('foobar');

        // retry in case the table hasn't had time to re-render
        await retry.try(async () => {
          await nodesList.assertNoData();
        });

        await nodesList.clearFilter();
      });
    });
  });
}
