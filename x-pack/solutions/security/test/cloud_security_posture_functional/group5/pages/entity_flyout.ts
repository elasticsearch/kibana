/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  waitForPluginInitialized,
  waitForEntityDataIndexed,
  dataViewRouteHelpersFactory,
  installEntityStoreV2,
  uninstallEntityStoreV2,
  waitForEntityStoreV2Running,
  initEntityEnginesWithRetry,
} from '../../../cloud_security_posture_api/utils';
import { testSubjectIds } from '../../constants/test_subject_ids';
import type { SecurityTelemetryFtrProviderContext } from '../../config.base';

const {
  VISUALIZATIONS_SECTION_HEADER_TEST_ID,
  VISUALIZATIONS_SECTION_CONTENT_TEST_ID,
  GRAPH_PREVIEW_CONTENT_TEST_ID,
  GRAPH_NODE_POPOVER_SHOW_ENTITY_RELATIONSHIPS_ITEM_ID,
} = testSubjectIds;

// eslint-disable-next-line import/no-default-export
export default function ({ getPageObjects, getService }: SecurityTelemetryFtrProviderContext) {
  const es = getService('es');
  const retry = getService('retry');
  const logger = getService('log');
  const supertest = getService('supertest');
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const testSubjects = getService('testSubjects');
  const pageObjects = getPageObjects(['common', 'header', 'expandedFlyoutGraph']);
  const expandedFlyoutGraph = pageObjects.expandedFlyoutGraph;

  describe.skip('Security Entity Analytics - Entity Flyout Graph', function () {
    this.tags(['cloud_security_posture_graph_viz']);

    before(async () => {
      await waitForPluginInitialized({ retry, supertest, logger });

      await kibanaServer.uiSettings.update({
        'securitySolution:enableAssetInventory': true,
        'securitySolution:entityStoreEnableV2': true,
      });

      // Initialize security-solution-default data-view (required by entity store)
      const dataView = dataViewRouteHelpersFactory(supertest);
      await dataView.create('security-solution');

      // Install Entity Store V2 and initialize engines so the entities table is visible
      await installEntityStoreV2({ supertest, logger });
      await initEntityEnginesWithRetry({
        supertest,
        retry,
        logger,
        entityTypes: ['host', 'user', 'service'],
      });
      await waitForEntityStoreV2Running({ supertest, retry, logger });
    });

    after(async () => {
      await uninstallEntityStoreV2({ supertest, logger });
      await kibanaServer.uiSettings.update({
        'securitySolution:enableAssetInventory': false,
        'securitySolution:entityStoreEnableV2': false,
      });
    });

    describe('via LOOKUP JOIN (v2)', () => {
      before(async () => {
        await esArchiver.load(
          'x-pack/solutions/security/test/cloud_security_posture_functional/es_archives/entity_store_v2'
        );

        await waitForEntityDataIndexed({
          es,
          logger,
          retry,
          entitiesIndex: '.entities.v2.latest.security_*',
          expectedCount: 41,
        });
      });

      after(async () => {
        await esArchiver.unload(
          'x-pack/solutions/security/test/cloud_security_posture_functional/es_archives/entity_store_v2'
        );
      });

      it('should handle correctly origin entity id and pinned entities relationships', async () => {
        // Scenario (matching the API integration test in graph.ts):
        // - origin-pinned-server (Linux Server / AWS EC2 Instance) is the origin entity.
        //   It is auto-pinned by the frontend when the entity flyout opens.
        //   It has a communicates_with relationship to relationship-target-server.
        // - grouped-actor-server-1 and grouped-actor-server-2 share the same type/subtype
        //   and both communicate with relationship-target-server.
        //   They should collapse into a single grouped relationship node.
        // - different-subtype-actor-server has a different subtype (GCP Compute Instance)
        //   and should produce its own separate relationship node.
        //
        // Expected graph after opening the entity flyout for origin-pinned-server
        // and clicking "show entity relationships" on relationship-target-server:
        //   Entity nodes (4):
        //     - origin-pinned-server (solo, pinned as origin)
        //     - grouped-actor-server-1 + grouped-actor-server-2 (merged group, count=2)
        //     - different-subtype-actor-server (solo, different subtype)
        //     - relationship-target-server (target)
        //   Relationship nodes (3): one per distinct actor group

        // Navigate directly to the entity analytics home page with the entity flyout
        // open for origin-pinned-server (host type). The flyout URL parameter opens
        // the flyout without needing to interact with the datagrid.
        await pageObjects.common.navigateToUrlWithBrowserHistory(
          'securitySolution',
          '/entity_analytics_home_page',
          `?cspq=(filters:!(),groupBy:!(none),pageFilters:!(),pageIndex:0,query:(language:kuery,query:%27%27),sort:!(!(%27@timestamp%27,desc)))&flyout=(preview:!(),right:(id:host-panel,params:(contextID:entity-analytics-home-table,entityId:%27host:origin-pinned-server%27,hostName:origin-pinned-server,scopeId:entity-analytics-home-table)))`,
          { ensureCurrentUrl: false }
        );
        await pageObjects.header.waitUntilLoadingHasFinished();

        // Wait for the host entity flyout right panel to open
        await testSubjects.existOrFail('rightSection', { timeout: 15000 });

        // Expand the Visualizations section in the flyout if it is collapsed
        // (same pattern as NetworkEventsPageObject.flyout.expandVisualizations)
        const vizContent = await testSubjects.find(VISUALIZATIONS_SECTION_CONTENT_TEST_ID);
        const isVizVisible = (await vizContent.getSize()).height > 0;
        if (!isVizVisible) {
          await testSubjects.click(VISUALIZATIONS_SECTION_HEADER_TEST_ID);
        }

        // Wait for the graph preview to appear, then expand to full view
        await testSubjects.existOrFail(GRAPH_PREVIEW_CONTENT_TEST_ID, { timeout: 10000 });
        await expandedFlyoutGraph.expandGraph();
        await expandedFlyoutGraph.waitGraphIsLoaded();

        // Initial graph: origin-pinned-server → (relationship-target-server as target entity from entityIds)
        // The origin entity is pinned automatically, so it appears as a solo node.

        // Show entity relationships for relationship-target-server
        await expandedFlyoutGraph.showEntityRelationships('host:relationship-target-server');
        await expandedFlyoutGraph.clickOnFitGraphIntoViewControl();

        // Assert 4 entity nodes: origin (solo), group of 2, different-subtype (solo), target
        await expandedFlyoutGraph.assertGraphNodesNumber(
          4 + // entity nodes
            3 // relationship nodes (one per actor group)
        );

        // origin-pinned-server must exist as its own solo node (pinned, never merged)
        await expandedFlyoutGraph.assertNodeExists('host:origin-pinned-server');

        // relationship-target-server is the target
        await expandedFlyoutGraph.assertNodeExists('host:relationship-target-server');

        // different-subtype-actor-server appears as a solo node (different subtype)
        await expandedFlyoutGraph.assertNodeExists('host:different-subtype-actor-server');

        // 3 relationship nodes with label "Communicates with"
        const relationshipNodeIds = [
          'rel(host:origin-pinned-server-communicates_with)',
          'rel(host:different-subtype-actor-server-communicates_with)',
        ];
        for (const nodeId of relationshipNodeIds) {
          await expandedFlyoutGraph.assertNodeExists(nodeId);
        }

        // The merged group node ID is the SHA-256 hash of the two actor IDs
        // (grouped-actor-server-1 and grouped-actor-server-2), stable across runs.
        const mergedGroupNodeId =
          '963a0686f85174e29eab1617a99b27256d5c627b666ea55e67aa3299d70c227e';
        await expandedFlyoutGraph.assertNodeExists(mergedGroupNodeId);

        // --- Phase 2: open the grouped node preview panel and show entity relationships
        //              for the first entity in the group ---
        // showEntityDetails clicks the node expand button then "Show entity details",
        // which opens the grouped preview panel listing both members.
        await expandedFlyoutGraph.showEntityDetails(mergedGroupNodeId);
        await expandedFlyoutGraph.assertPreviewPanelGroupedItemTitleLinkNumber(2);

        // Click the actions (⋯) button on the first entity row in the panel,
        // then select "Show entity relationships" from the popover.
        // This pins that entity so it splits out of the group into its own node.
        const groupedItemRows = await testSubjects.findAll(
          'GraphGroupedNodePreviewPanelGroupedItem'
        );
        const actionsBtn = await groupedItemRows[0].findByTestSubject(
          'GraphGroupedNodePreviewPanelGroupedItemActionsButton'
        );
        await actionsBtn.click();
        await testSubjects.click(GRAPH_NODE_POPOVER_SHOW_ENTITY_RELATIONSHIPS_ITEM_ID);
        await pageObjects.header.waitUntilLoadingHasFinished();
        await expandedFlyoutGraph.clickOnFitGraphIntoViewControl();

        // --- Phase 4: hide entity relationships from the same grouped panel row ---
        // The grouped panel is still open. Click the actions button on the same row
        // and select "Hide entity relationships" — this unpins the entity and it
        // merges back into the group.
        await actionsBtn.click();
        await testSubjects.click(GRAPH_NODE_POPOVER_SHOW_ENTITY_RELATIONSHIPS_ITEM_ID);
        await pageObjects.header.waitUntilLoadingHasFinished();

        // Close the grouped preview panel and fit the graph into view
        await expandedFlyoutGraph.closePreviewSection();
        await expandedFlyoutGraph.clickOnFitGraphIntoViewControl();

        // --- Phase 3+4 combined assertion ---
        // After hiding, the entity rejoins the group: back to the original 7 nodes
        //   Entity nodes (4): origin-pinned-server, merged-group (count=2),
        //                     different-subtype-actor-server, target
        //   Relationship nodes (3): back to the original 3
        await expandedFlyoutGraph.assertGraphNodesNumber(4 + 3);
        await expandedFlyoutGraph.assertNodeExists(mergedGroupNodeId);
        await expandedFlyoutGraph.assertNodeExists('host:relationship-target-server');
        await expandedFlyoutGraph.assertNodeExists('host:origin-pinned-server');
        await expandedFlyoutGraph.assertNodeExists('host:different-subtype-actor-server');
      });
    });
  });
}
