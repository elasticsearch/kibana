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
} from '../../../cloud_security_posture_api/utils';
import type { SecurityTelemetryFtrProviderContext } from '../../config.base';

// eslint-disable-next-line import/no-default-export
export default function ({ getPageObjects, getService }: SecurityTelemetryFtrProviderContext) {
  const es = getService('es');
  const retry = getService('retry');
  const logger = getService('log');
  const supertest = getService('supertest');
  const esArchiver = getService('esArchiver');
  const ebtUIHelper = getService('kibana_ebt_ui');
  const kibanaServer = getService('kibanaServer');
  const pageObjects = getPageObjects([
    'common',
    'header',
    'networkEvents',
    'expandedFlyoutGraph',
    'timeline',
  ]);
  const networkEventsPage = pageObjects.networkEvents;
  const expandedFlyoutGraph = pageObjects.expandedFlyoutGraph;
  const timelinePage = pageObjects.timeline;

  describe('Security Network Page - Graph visualization', function () {
    this.tags(['cloud_security_posture_graph_viz']);

    before(async () => {
      // Clean up any leftover alerts indices from previous failed runs
      for (const suffix of ['000001', '000002']) {
        try {
          await es.indices.delete({
            index: `.internal.alerts-security.alerts-default-${suffix}`,
          });
        } catch (e) {
          // Ignore if index doesn't exist
        }
      }

      // security_alerts_modified_mappings - contains mappings for actor and target
      // security_alerts - does not contain mappings for actor and target
      await esArchiver.load(
        'x-pack/solutions/security/test/cloud_security_posture_functional/es_archives/security_alerts_modified_mappings'
      );
      await esArchiver.load(
        'x-pack/solutions/security/test/cloud_security_posture_functional/es_archives/logs_gcp_audit'
      );

      await waitForPluginInitialized({ retry, supertest, logger });
      await ebtUIHelper.setOptIn(true); // starts the recording of events from this moment

      // Enable asset inventory and entity store v2 settings
      await kibanaServer.uiSettings.update({
        'securitySolution:enableAssetInventory': true,
        'securitySolution:entityStoreEnableV2': true,
      });

      // Initialize security-solution-default data-view (required by entity store)
      const dataView = dataViewRouteHelpersFactory(supertest);
      await dataView.create('security-solution');

      // Install Entity Store V2 (required for graph visualization)
      await installEntityStoreV2({ supertest, logger });
      await waitForEntityStoreV2Running({ supertest, retry, logger });
    });

    after(async () => {
      await uninstallEntityStoreV2({ supertest, logger });
      // Using unload destroys index's alias of .alerts-security.alerts-default which causes a failure in other tests
      // Instead we delete all alerts from the index
      await es.deleteByQuery({
        index: '.internal.alerts-*',
        query: { match_all: {} },
        conflicts: 'proceed',
      });
      await esArchiver.unload(
        'x-pack/solutions/security/test/cloud_security_posture_functional/es_archives/logs_gcp_audit'
      );
    });

    it('expanded flyout - filter by node', async () => {
      // Setting the timerange to fit the data and open the flyout for a specific alert
      await networkEventsPage.navigateToNetworkEventsPage(
        `${networkEventsPage.getAbsoluteTimerangeFilter(
          '2024-09-01T00:00:00.000Z',
          '2024-09-02T00:00:00.000Z'
        )}&${networkEventsPage.getFlyoutFilter('1')}`
      );
      await networkEventsPage.waitForListToHaveEvents();

      await networkEventsPage.flyout.expandVisualizations();
      await networkEventsPage.flyout.assertGraphPreviewVisible();
      await networkEventsPage.flyout.assertGraphNodesNumber(3);

      await expandedFlyoutGraph.expandGraph();
      await expandedFlyoutGraph.waitGraphIsLoaded();
      await expandedFlyoutGraph.assertGraphNodesNumber(3);
      await expandedFlyoutGraph.toggleSearchBar();

      // Show actions by entity
      await expandedFlyoutGraph.showActionsByEntity('user:admin@example.com@gcp');
      await expandedFlyoutGraph.expectFilterTextEquals(0, 'user.id: admin@example.com');
      await expandedFlyoutGraph.expectFilterPreviewEquals(0, 'user.id: admin@example.com');

      // Show actions on entity
      await expandedFlyoutGraph.showActionsOnEntity('user:admin@example.com@gcp');
      await expandedFlyoutGraph.expectFilterTextEquals(
        0,
        'user.id: admin@example.com OR user.target.id: admin@example.com'
      );

      await expandedFlyoutGraph.expectFilterPreviewEquals(
        0,
        'user.id: admin@example.com OR user.target.id: admin@example.com'
      );

      // Explore related entities
      await expandedFlyoutGraph.exploreRelatedEntities('user:admin@example.com@gcp');
      await expandedFlyoutGraph.expectFilterTextEquals(
        0,
        'user.id: admin@example.com OR user.target.id: admin@example.com OR related.entity: user:admin@example.com@gcp'
      );
      await expandedFlyoutGraph.expectFilterPreviewEquals(
        0,
        'user.id: admin@example.com OR user.target.id: admin@example.com OR related.entity: user:admin@example.com@gcp'
      );

      // Show events with the same action
      await expandedFlyoutGraph.showEventsOfSameAction(
        'label(google.iam.admin.v1.CreateRole)ln(b0f4971b57721f2778832a4f81523af433a4f974671ce49770e1846d12e20760)oe(1)oa(0)'
      );

      await expandedFlyoutGraph.expectFilterTextEquals(
        0,
        'user.id: admin@example.com OR user.target.id: admin@example.com OR related.entity: user:admin@example.com@gcp OR event.action: google.iam.admin.v1.CreateRole'
      );
      await expandedFlyoutGraph.expectFilterPreviewEquals(
        0,
        'user.id: admin@example.com OR user.target.id: admin@example.com OR related.entity: user:admin@example.com@gcp OR event.action: google.iam.admin.v1.CreateRole'
      );

      await expandedFlyoutGraph.clickOnFitGraphIntoViewControl();

      // Hide events with the same action
      await expandedFlyoutGraph.hideEventsOfSameAction(
        'label(google.iam.admin.v1.CreateRole)ln(b0f4971b57721f2778832a4f81523af433a4f974671ce49770e1846d12e20760)oe(1)oa(0)'
      );
      await expandedFlyoutGraph.expectFilterTextEquals(
        0,
        'user.id: admin@example.com OR user.target.id: admin@example.com OR related.entity: user:admin@example.com@gcp'
      );
      await expandedFlyoutGraph.expectFilterPreviewEquals(
        0,
        'user.id: admin@example.com OR user.target.id: admin@example.com OR related.entity: user:admin@example.com@gcp'
      );

      // Hide actions on entity
      await expandedFlyoutGraph.hideActionsOnEntity('user:admin@example.com@gcp');
      await expandedFlyoutGraph.expectFilterTextEquals(
        0,
        'user.id: admin@example.com OR related.entity: user:admin@example.com@gcp'
      );
      await expandedFlyoutGraph.expectFilterPreviewEquals(
        0,
        'user.id: admin@example.com OR related.entity: user:admin@example.com@gcp'
      );

      // Clear filters
      await expandedFlyoutGraph.clearAllFilters();

      // Add custom filter
      await expandedFlyoutGraph.addFilter({
        field: 'user.id',
        operation: 'is',
        value: 'admin2@example.com',
      });
      await pageObjects.header.waitUntilLoadingHasFinished();

      await expandedFlyoutGraph.clickOnFitGraphIntoViewControl();
      await expandedFlyoutGraph.assertGraphNodesNumber(5);

      // Open timeline
      await expandedFlyoutGraph.clickOnInvestigateInTimelineButton();
      await timelinePage.ensureTimelineIsOpen();
      await timelinePage.waitForEvents();
      await timelinePage.closeTimeline();

      // Test query bar
      await expandedFlyoutGraph.setKqlQuery('cannotFindThis');
      await expandedFlyoutGraph.clickOnInvestigateInTimelineButton();
      await timelinePage.ensureTimelineIsOpen();
      await timelinePage.waitForEvents();
    });

    it('expanded flyout - show event details', async () => {
      // Setting the timerange to fit the data and open the flyout for a specific alert
      await networkEventsPage.navigateToNetworkEventsPage(
        `${networkEventsPage.getAbsoluteTimerangeFilter(
          '2024-09-01T00:00:00.000Z',
          '2024-09-02T00:00:00.000Z'
        )}&${networkEventsPage.getFlyoutFilter('5')}`
      );
      await networkEventsPage.waitForListToHaveEvents();

      await networkEventsPage.flyout.expandVisualizations();
      await networkEventsPage.flyout.assertGraphPreviewVisible();
      await networkEventsPage.flyout.assertGraphNodesNumber(3);

      await expandedFlyoutGraph.expandGraph();
      await expandedFlyoutGraph.waitGraphIsLoaded();
      await expandedFlyoutGraph.assertGraphNodesNumber(3);

      await expandedFlyoutGraph.showEventOrAlertDetails(
        'label(google.iam.admin.v1.CreateRole)ln(5)oe(1)oa(0)'
      );
      await networkEventsPage.flyout.assertPreviewPanelIsOpen('event');
    });

    it('expanded flyout - show grouped event details', async () => {
      // Navigate to events page with filters for specific event action and actor entity
      await networkEventsPage.navigateToNetworkEventsPage(
        `${networkEventsPage.getAbsoluteTimerangeFilter(
          '2024-09-01T00:00:00.000Z',
          '2024-09-02T00:00:00.000Z'
        )}&${networkEventsPage.getFlyoutFilter('1')}`
      );
      await networkEventsPage.waitForListToHaveEvents();

      await networkEventsPage.flyout.expandVisualizations();
      await networkEventsPage.flyout.assertGraphPreviewVisible();

      await expandedFlyoutGraph.expandGraph();
      await expandedFlyoutGraph.waitGraphIsLoaded();

      // Add filter for actor entity
      await expandedFlyoutGraph.showSearchBar();
      await expandedFlyoutGraph.addFilter({
        field: 'user.id',
        operation: 'is',
        value: 'admin3@example.com',
      });

      await pageObjects.header.waitUntilLoadingHasFinished();
      await expandedFlyoutGraph.clickOnFitGraphIntoViewControl();

      // Graph should render 5 nodes:
      // - 2 actor entity nodes
      // - 1 label node that groups 2 non-origin events
      // - 1 label node (the origin event, separated from the group) that contains 1 event and 1 alert
      // - 1 target entity node
      await expandedFlyoutGraph.assertGraphNodesNumber(5);
      // when we deduct alerts from the events count, this will become 1
      await expandedFlyoutGraph.assertGraphGroupNodesNumber(2);

      // Show event details from group node
      await expandedFlyoutGraph.showEventOrAlertDetails(
        'label(google.iam.admin.v1.CreateRole)ln(5cc3ec012284b76c9ebb137c692826dcba12e4cc6792de419b51667b02df4b58)oe(0)oa(0)'
      );
      await networkEventsPage.flyout.assertPreviewPanelIsOpen('group');
      await networkEventsPage.flyout.assertPreviewPanelGroupedItemsNumber(2);
    });

    it('expanded flyout - test IP popover functionality', async () => {
      await networkEventsPage.navigateToNetworkEventsPage(
        `${networkEventsPage.getAbsoluteTimerangeFilter(
          '2024-09-01T00:00:00.000Z',
          '2024-09-02T00:00:00.000Z'
        )}&${networkEventsPage.getFlyoutFilter('1')}`
      );
      await networkEventsPage.waitForListToHaveEvents();

      await networkEventsPage.flyout.expandVisualizations();
      await networkEventsPage.flyout.assertGraphPreviewVisible();
      await networkEventsPage.flyout.assertGraphNodesNumber(3);

      await expandedFlyoutGraph.expandGraph();
      await expandedFlyoutGraph.waitGraphIsLoaded();
      await expandedFlyoutGraph.assertGraphNodesNumber(3);

      await expandedFlyoutGraph.addFilter({
        field: 'event.action',
        operation: 'is',
        value: 'google.iam.admin.v1.CreateRole',
      });
      await pageObjects.header.waitUntilLoadingHasFinished();
      await expandedFlyoutGraph.clickOnFitGraphIntoViewControl();

      await expandedFlyoutGraph.clickOnIpsPlusButton();
      await expandedFlyoutGraph.assertIpsPopoverIsOpen();
      await expandedFlyoutGraph.assertIpsPopoverContainsIps(['10.0.0.1', '10.0.0.3']);
      await expandedFlyoutGraph.clickOnFirstIpInPopover();
      await expandedFlyoutGraph.assertPreviewPopoverIsOpen();
    });

    it('show related alerts', async () => {
      // Setting the timerange to fit the data and open the flyout for a specific alert
      await networkEventsPage.navigateToNetworkEventsPage(
        `${networkEventsPage.getAbsoluteTimerangeFilter(
          '2024-09-01T00:00:00.000Z',
          '2024-09-02T00:00:00.000Z'
        )}&${networkEventsPage.getFlyoutFilter('6')}`
      );
      await networkEventsPage.waitForListToHaveEvents();

      await networkEventsPage.flyout.expandVisualizations();
      await networkEventsPage.flyout.assertGraphPreviewVisible();
      await networkEventsPage.flyout.assertGraphNodesNumber(3);

      await expandedFlyoutGraph.expandGraph();
      await expandedFlyoutGraph.waitGraphIsLoaded();
      await expandedFlyoutGraph.assertGraphNodesNumber(3);

      await expandedFlyoutGraph.showEventOrAlertDetails(
        'label(google.iam.admin.v1.CreateRole2)ln(fe63b16ddd48d7792e4391e9067cdf4f273045a23d5596074c89afe7c03b3083)oe(1)oa(0)'
      );
      // An alert is always coupled with an event, so we open the group preview panel instead of the alert panel
      await networkEventsPage.flyout.assertPreviewPanelIsOpen('group');
      await networkEventsPage.flyout.assertPreviewPanelGroupedItemsNumber(2);
    });

    describe('ECS fields only', function () {
      // Entity store v2 is installed at the parent level for graph visibility.
      // Enrichment tests use LOOKUP JOIN (v2) with custom entity data loaded via esArchiver.

      // Shared test suite that registers all test cases - called from both v1 and v2 describe blocks
      const runEnrichmentTests = () => {
        it('expanded flyout - entity enrichment for multiple actors and targets', async () => {
          // Navigate to events page with the multi-actor multi-target event
          await networkEventsPage.navigateToNetworkEventsPage(
            `${networkEventsPage.getAbsoluteTimerangeFilter(
              '2024-09-01T00:00:00.000Z',
              '2024-09-02T00:00:00.000Z'
            )}&${networkEventsPage.getFlyoutFilter('MultiActorMultiTargetEvent123')}`
          );
          await networkEventsPage.waitForListToHaveEvents();

          await networkEventsPage.flyout.expandVisualizations();
          await networkEventsPage.flyout.assertGraphPreviewVisible();
          // Expected nodes:
          // - 1 grouped actor node (2 actors: multi-actor-1, multi-actor-2 - same Identity/GCP IAM User)
          // - 1 grouped storage node (2 buckets: target-bucket-1, target-bucket-2 - same Storage/GCP Storage Bucket)
          // - 1 single service node (service:TargetMultiService1 - Service)
          // - 1 label node (actor group -> storage group and service node)
          const expectedNodes = 4;
          await networkEventsPage.flyout.assertGraphNodesNumber(expectedNodes);

          await expandedFlyoutGraph.expandGraph();
          await expandedFlyoutGraph.waitGraphIsLoaded();
          await expandedFlyoutGraph.assertGraphNodesNumber(expectedNodes);

          const actorNodeId = '0dd7df1e4e0a04a8dcde50181928557ceff5b21dfa0a46b1e173feef4bb3ddbc';
          await expandedFlyoutGraph.assertNodeEntityTag(actorNodeId, 'Identity');
          await expandedFlyoutGraph.assertNodeEntityDetails(actorNodeId, 'GCP IAM User');

          const storageBucketNodeId =
            '1abcf2b7cb329695e152ab9f1838188e0f61f5796fd20518c73488748e05b935';
          await expandedFlyoutGraph.assertNodeEntityTag(storageBucketNodeId, 'Storage');
          await expandedFlyoutGraph.assertNodeEntityDetails(
            storageBucketNodeId,
            'GCP Storage Bucket'
          );

          const serviceNodeId = 'service:TargetMultiService1';
          await expandedFlyoutGraph.assertNodeEntityTag(serviceNodeId, 'Service');
          await expandedFlyoutGraph.assertNodeEntityDetails(serviceNodeId, 'TargetMultiService1');
        });

        it('expanded flyout - MV_EXPAND deduplication: single label node for targets with different entity types', async () => {
          // This test verifies the fix for GitHub issue #245739
          // A single document with targets that have DIFFERENT entity types after enrichment
          // should create only ONE label node (not multiple) because they share the same document ID
          //
          // Document: MvExpandBugTest123
          // - Actor: mv-expand-test-actor@example.com (Identity/GCP IAM User)
          // - Target 1: mv-expand-target-identity (Identity/GCP IAM User)
          // - Target 2: mv-expand-target-storage (Storage/GCP Storage Bucket)
          //
          // Before fix: MV_EXPAND creates 2 rows, which after enrichment have different targetEntityType,
          // causing ESQL to create 2 separate groups -> 2 label nodes
          //
          // After fix: Both rows share the same labelNodeId (document ID "MvExpandBugTest123"),
          // so only ONE label node is created with edges to both targets

          await networkEventsPage.navigateToNetworkEventsPage(
            `${networkEventsPage.getAbsoluteTimerangeFilter(
              '2024-09-01T00:00:00.000Z',
              '2024-09-02T00:00:00.000Z'
            )}&${networkEventsPage.getFlyoutFilter('MvExpandBugTest123')}`
          );
          await networkEventsPage.waitForListToHaveEvents();

          await networkEventsPage.flyout.expandVisualizations();
          await networkEventsPage.flyout.assertGraphPreviewVisible();

          // Expected nodes with the fix:
          // - 1 actor node (mv-expand-test-actor@example.com - Identity/GCP IAM User)
          // - 1 target node (mv-expand-target-identity - Identity/GCP IAM User)
          // - 1 target node (mv-expand-target-storage - Storage/GCP Storage Bucket)
          // - 1 label node (shared by both edges because they come from the same document)
          //
          // Before the fix, this would incorrectly create 5 nodes (2 label nodes instead of 1)
          const expectedNodes = 4;
          await networkEventsPage.flyout.assertGraphNodesNumber(expectedNodes);

          await expandedFlyoutGraph.expandGraph();
          await expandedFlyoutGraph.waitGraphIsLoaded();
          await expandedFlyoutGraph.assertGraphNodesNumber(expectedNodes);

          // Verify actor node
          const actorNodeId = 'user:mv-expand-test-actor@example.com@gcp';
          await expandedFlyoutGraph.assertNodeEntityTag(actorNodeId, 'Identity');
          await expandedFlyoutGraph.assertNodeEntityDetails(actorNodeId, 'MvExpandTestActor');

          // Verify first target (Identity type - user entity in entity store)
          const identityTargetNodeId = 'user:mv-expand-target-identity@gcp';
          await expandedFlyoutGraph.assertNodeEntityTag(identityTargetNodeId, 'Identity');
          await expandedFlyoutGraph.assertNodeEntityDetails(
            identityTargetNodeId,
            'MvExpandTargetIdentity'
          );

          // Verify second target (Storage type - different from first target!)
          const storageTargetNodeId = 'mv-expand-target-storage';
          await expandedFlyoutGraph.assertNodeEntityTag(storageTargetNodeId, 'Storage');
          await expandedFlyoutGraph.assertNodeEntityDetails(
            storageTargetNodeId,
            'MvExpandTargetStorage'
          );

          // Verify the label node exists
          // Format: label(action)ln(labelNodeId)oe(isOrigin)oa(isOriginAlert)
          // The labelNodeId is the document ID since there's only one document
          const labelNodeId =
            'label(google.iam.admin.v1.MvExpandTest)ln(MvExpandBugTest123)oe(1)oa(0)';
          await expandedFlyoutGraph.assertNodeExists(labelNodeId);
        });
      };

      describe('via LOOKUP JOIN (v2)', () => {
        before(async () => {
          // Load v2 entity data into the entity store index created by v2 install
          await esArchiver.load(
            'x-pack/solutions/security/test/cloud_security_posture_functional/es_archives/entity_store_v2'
          );

          // Wait for entity data to be fully indexed
          await waitForEntityDataIndexed({
            es,
            logger,
            retry,
            entitiesIndex: '.entities.v2.latest.security_*',
            expectedCount: 45,
          });
        });

        after(async () => {
          await esArchiver.unload(
            'x-pack/solutions/security/test/cloud_security_posture_functional/es_archives/entity_store_v2'
          );
        });

        runEnrichmentTests();

        describe('Entity Relationships', () => {
          it('expanded flyout - event with service target and entity relationships', async () => {
            // Navigate to events page with the SetIamPolicy event
            // Note: getFlyoutFilter uses document id, not event.id
            await networkEventsPage.navigateToNetworkEventsPage(
              `${networkEventsPage.getAbsoluteTimerangeFilter(
                '2024-09-01T00:00:00.000Z',
                '2024-09-02T00:00:00.000Z'
              )}&${networkEventsPage.getFlyoutFilter('multi-relationships-event-1')}`
            );
            await networkEventsPage.waitForListToHaveEvents();

            await networkEventsPage.flyout.expandVisualizations();
            await networkEventsPage.flyout.assertGraphPreviewVisible();

            // Expected nodes:
            // - 1 actor node (gcp-admin-user)
            // - 1 service target node (data-pipeline)
            // - 1 label node (SetIamPolicy action)
            const expectedNodes = 3;
            await networkEventsPage.flyout.assertGraphNodesNumber(expectedNodes);

            await expandedFlyoutGraph.expandGraph();
            await expandedFlyoutGraph.waitGraphIsLoaded();
            await expandedFlyoutGraph.assertGraphNodesNumber(expectedNodes);
            // Verify actor node
            const actorNodeId = 'user:gcp-admin-user@my-gcp-project.iam.gserviceaccount.com@gcp';
            await expandedFlyoutGraph.assertNodeEntityTag(actorNodeId, 'Service Account');
            await expandedFlyoutGraph.assertNodeEntityDetails(actorNodeId, 'GCP Admin User');

            // Verify service target node (user type entity in entity store)
            const serviceTargetNodeId =
              'user:data-pipeline@my-gcp-project.iam.gserviceaccount.com@gcp';
            await expandedFlyoutGraph.assertNodeEntityTag(serviceTargetNodeId, 'Service Account');
            await expandedFlyoutGraph.assertNodeEntityDetails(
              serviceTargetNodeId,
              'data-pipeline Service Account'
            );

            await expandedFlyoutGraph.showEntityDetails(
              'user:data-pipeline@my-gcp-project.iam.gserviceaccount.com@gcp'
            );
            await expandedFlyoutGraph.assertPreviewPopoverIsOpen();

            await expandedFlyoutGraph.closePreviewSection();

            await expandedFlyoutGraph.showEntityRelationships(
              'user:data-pipeline@my-gcp-project.iam.gserviceaccount.com@gcp'
            );

            await expandedFlyoutGraph.clickOnFitGraphIntoViewControl();

            // Expected nodes:
            // - 1 actor node (gcp-admin-user)
            // - 1 service target node (data-pipeline)
            // - 1 label node (SetIamPolicy action)
            // - 2 relationship nodes (Owns, Communicates_with)
            // - 2 grouped target nodes (Owns targets: 3 items, Communicates_with targets: 2 items)
            const expectedNodesWithRelationships = 7;
            await expandedFlyoutGraph.assertGraphNodesNumber(expectedNodesWithRelationships);

            const communicatesWithRelationshipNodeId =
              'rel(user:data-pipeline@my-gcp-project.iam.gserviceaccount.com@gcp-communicates_with)';
            await expandedFlyoutGraph.assertNodeExists(communicatesWithRelationshipNodeId);

            const ownsRelationshipNodeId =
              'rel(user:data-pipeline@my-gcp-project.iam.gserviceaccount.com@gcp-owns)';
            await expandedFlyoutGraph.assertNodeExists(ownsRelationshipNodeId);

            const communicatesWithIdRelationshipTargetNodeId =
              'c7d2fb4084505889f751c7a8ffcee9eb7d836a60c2e34f751b64faf34ac0b932';
            await expandedFlyoutGraph.assertNodeEntityTag(
              communicatesWithIdRelationshipTargetNodeId,
              'Host'
            );
            await expandedFlyoutGraph.assertNodeEntityDetails(
              communicatesWithIdRelationshipTargetNodeId,
              'GCP Compute Instance'
            );
            await expandedFlyoutGraph.assertNodeEntityTagCount(
              communicatesWithIdRelationshipTargetNodeId,
              2
            );

            const ownsIdRelationshipTargetNodeId =
              'f30eb27265a364641d6b15acdf5cffc78f581d08acfa6af82b26587f6b3c353b';
            await expandedFlyoutGraph.assertNodeEntityTag(ownsIdRelationshipTargetNodeId, 'Host');
            await expandedFlyoutGraph.assertNodeEntityDetails(
              ownsIdRelationshipTargetNodeId,
              'GCP Compute Instance'
            );
            await expandedFlyoutGraph.assertNodeEntityTagCount(ownsIdRelationshipTargetNodeId, 3);

            // Click on "Show this entity's actions" for data-pipeline entity
            // This should reveal another event where data-pipeline is the actor
            await expandedFlyoutGraph.showActionsByEntity(serviceTargetNodeId);

            await expandedFlyoutGraph.clickOnFitGraphIntoViewControl();

            // Expected nodes after showing entity's actions:
            // - 1 actor node (gcp-admin-user)
            // - 1 service target node (data-pipeline) - now also an actor
            // - 1 label node (SetIamPolicy action)
            // - 2 relationship nodes (Owns, Communicates_with)
            // - 2 grouped target nodes (Owns targets: 3 items, Communicates_with targets: 2 items)
            // - 1 new label node (google.storage.buckets.update action)
            // - 1 new target node (db-server-prod-1)
            const expectedNodesWithActions = 9;
            await expandedFlyoutGraph.assertGraphNodesNumber(expectedNodesWithActions);

            const eventTargetNodeId =
              'host:projects/my-gcp-project/zones/us-west1-a/instances/db-server-prod-1';
            await expandedFlyoutGraph.assertNodeEntityTag(eventTargetNodeId, 'Host');
            await expandedFlyoutGraph.assertNodeEntityDetails(
              eventTargetNodeId,
              'db-server-prod-1'
            );

            // assrt that that existing grouped target nodes still exist
            await expandedFlyoutGraph.assertNodeEntityTag(
              communicatesWithIdRelationshipTargetNodeId,
              'Host'
            );
            await expandedFlyoutGraph.assertNodeEntityDetails(
              communicatesWithIdRelationshipTargetNodeId,
              'GCP Compute Instance'
            );
            await expandedFlyoutGraph.assertNodeEntityTagCount(
              communicatesWithIdRelationshipTargetNodeId,
              2
            );

            await expandedFlyoutGraph.assertNodeEntityTag(ownsIdRelationshipTargetNodeId, 'Host');
            await expandedFlyoutGraph.assertNodeEntityDetails(
              ownsIdRelationshipTargetNodeId,
              'GCP Compute Instance'
            );
            await expandedFlyoutGraph.assertNodeEntityTagCount(ownsIdRelationshipTargetNodeId, 3);
          });

          it('expanded flyout - hierarchical relationships with grouped targets and event', async () => {
            // Test scenario matching the API integration test:
            // - Root user owns 3 entities (Host, Service, Identity) - each with different type
            // - Each of those 3 entities communicates_with 2 entities of the same type (grouped)
            // - Identity-1 also supervises AND depends_on a delegate entity (different type: User)
            // - Root user performs an action (event) targeting host-1 and identity-1
            // - Identity-1 performs 2 different actions targeting delegate-1 (these get stacked)
            // - External-caller has Communicates_with relationship targeting identity-1

            // Navigate to the event - include all 3 events
            await networkEventsPage.navigateToNetworkEventsPage(
              `${networkEventsPage.getAbsoluteTimerangeFilter(
                '2024-09-01T00:00:00.000Z',
                '2024-09-02T00:00:00.000Z'
              )}&${networkEventsPage.getFlyoutFilter('rel-hierarchy-event-ftr-1')}`
            );
            await networkEventsPage.waitForListToHaveEvents();

            await networkEventsPage.flyout.expandVisualizations();
            await networkEventsPage.flyout.assertGraphPreviewVisible();

            await expandedFlyoutGraph.expandGraph();
            await expandedFlyoutGraph.waitGraphIsLoaded();

            // Expected nodes:
            // - 1 actor node: root user
            // - 1 label node: for the event action (google.iam.admin.v1.UpdatePolicy)
            // - 2 target nodes: host-1 and identity-1
            // Total: 4 nodes
            const expectedTotalNodes = 4;
            await expandedFlyoutGraph.assertGraphNodesNumber(expectedTotalNodes);

            // Verify root user (actor) node
            const rootNodeId = 'user:rel-hierarchy-root-user@gcp';
            await expandedFlyoutGraph.assertNodeEntityTag(rootNodeId, 'Identity');
            await expandedFlyoutGraph.assertNodeEntityDetails(rootNodeId, 'Hierarchy Root User');

            // Verify intermediate identity node
            const hostNodeId = 'user:rel-hierarchy-identity-1@gcp';
            await expandedFlyoutGraph.assertNodeEntityTag(hostNodeId, 'Identity');
            await expandedFlyoutGraph.assertNodeEntityDetails(hostNodeId, 'Hierarchy Identity 1');

            // Verify intermediate host node
            const serviceNodeId = 'host:rel-hierarchy-host-1';
            await expandedFlyoutGraph.assertNodeEntityTag(serviceNodeId, 'Host');
            await expandedFlyoutGraph.assertNodeEntityDetails(serviceNodeId, 'Hierarchy Host 1');

            await expandedFlyoutGraph.showEntityRelationships('user:rel-hierarchy-root-user@gcp');
            await expandedFlyoutGraph.clickOnFitGraphIntoViewControl();

            const expectedNodesWithSingleOwnsRelationship = 6;
            await expandedFlyoutGraph.assertGraphNodesNumber(
              expectedNodesWithSingleOwnsRelationship
            );

            const ownsRelationshipNodeId = 'rel(user:rel-hierarchy-root-user@gcp-owns)';
            await expandedFlyoutGraph.assertNodeExists(ownsRelationshipNodeId);

            await expandedFlyoutGraph.showEntityRelationships(hostNodeId);
            await expandedFlyoutGraph.clickOnFitGraphIntoViewControl();

            await expandedFlyoutGraph.showEntityRelationships(serviceNodeId);
            await expandedFlyoutGraph.clickOnFitGraphIntoViewControl();

            await expandedFlyoutGraph.showEntityRelationships('service:Hierarchy Service 1');
            await expandedFlyoutGraph.clickOnFitGraphIntoViewControl();

            // Expected nodes with multiple relationships:
            // - 9 entity nodes: root + 3 intermediate + 3 grouped targets + 1 delegate + 1 external-caller
            // - 7 relationship nodes: 1 Owns + 4 Communicates_with + 1 Supervises + 1 Depends_on
            // - 1 label node: UpdatePolicy (not stacked)
            // - 1 group node: for stacking Supervises and Depends_on (same source-target pair)
            const expectedNodesWithMultipleRelationships = 18;
            await expandedFlyoutGraph.assertGraphNodesNumber(
              expectedNodesWithMultipleRelationships
            );

            // rel-hierarchy-identity-1 entity has the following relationships:
            // - Supervises: rel-hierarchy-delegate-1
            // - Depends_on: rel-hierarchy-delegate-1
            // - Communicates_with: rel-hierarchy-network-1, rel-hierarchy-network-2
            // Supervises and Depends_on share the same target (delegate-1), so they are stacked in a group
            const supervisesRelationshipNodeId =
              'rel(user:rel-hierarchy-identity-1@gcp-supervises)';
            await expandedFlyoutGraph.assertNodeExists(supervisesRelationshipNodeId);

            const dependsOnRelationshipNodeId = 'rel(user:rel-hierarchy-identity-1@gcp-depends_on)';
            await expandedFlyoutGraph.assertNodeExists(dependsOnRelationshipNodeId);

            const communicatesWithRelationshipNodeId =
              'rel(user:rel-hierarchy-identity-1@gcp-communicates_with)';
            await expandedFlyoutGraph.assertNodeExists(communicatesWithRelationshipNodeId);

            const delegateTargetNodeId = 'user:rel-hierarchy-delegate-1@gcp';
            await expandedFlyoutGraph.assertNodeEntityTag(delegateTargetNodeId, 'User');
            await expandedFlyoutGraph.assertNodeEntityDetails(
              delegateTargetNodeId,
              'Hierarchy Delegate Agent'
            );

            const communicatesWithIdRelationshipTargetNodeId =
              '28ddbf3f780ac0c16071a33d0ae9d8d92ed7bf0c28ed9ad9b606f9ddacdb589b';
            await expandedFlyoutGraph.assertNodeEntityTag(
              communicatesWithIdRelationshipTargetNodeId,
              'Networking'
            );
            await expandedFlyoutGraph.assertNodeEntityDetails(
              communicatesWithIdRelationshipTargetNodeId,
              'AWS VPC'
            );

            await expandedFlyoutGraph.showEntityDetails(communicatesWithIdRelationshipTargetNodeId);
            // check the preview panel grouped items rendered correctly
            await networkEventsPage.flyout.assertPreviewPanelIsOpen('group');
            await networkEventsPage.flyout.assertPreviewPanelGroupedItemsNumber(2);
            await expandedFlyoutGraph.assertPreviewPanelGroupedItemTitleLinkNumber(2);

            await expandedFlyoutGraph.closePreviewSection();

            const communicatesWithHostRelationshipNodeId =
              'rel(host:rel-hierarchy-host-1-communicates_with)';
            await expandedFlyoutGraph.assertNodeExists(communicatesWithHostRelationshipNodeId);

            const communicatesWithStorageRelationshipNodeId =
              'rel(service:Hierarchy Service 1-communicates_with)';
            await expandedFlyoutGraph.assertNodeExists(communicatesWithStorageRelationshipNodeId);

            // Verify external-caller entity and its relationship
            const externalCallerNodeId = 'service:Hierarchy External Caller';
            await expandedFlyoutGraph.assertNodeEntityTag(externalCallerNodeId, 'Service');
            await expandedFlyoutGraph.assertNodeEntityDetails(
              externalCallerNodeId,
              'Hierarchy External Caller'
            );

            const externalCallerRelationshipNodeId =
              'rel(service:Hierarchy External Caller-communicates_with)';
            await expandedFlyoutGraph.assertNodeExists(externalCallerRelationshipNodeId);
            // Show actions by identity-1 to see the two new events (AuditLog and UserOperation)
            await expandedFlyoutGraph.showActionsByEntity(hostNodeId);
            await expandedFlyoutGraph.clickOnFitGraphIntoViewControl();

            // Expected nodes after showing entity's actions:
            // Previous 18 nodes + 2 new label nodes (join existing relationship group) = 20
            const expectedNodesAfterShowingActions = 20;
            await expandedFlyoutGraph.assertGraphNodesNumber(expectedNodesAfterShowingActions);

            await expandedFlyoutGraph.assertNodeEntityTag(delegateTargetNodeId, 'User');

            await expandedFlyoutGraph.showEntityRelationships('user:rel-hierarchy-identity-1@gcp');
            await expandedFlyoutGraph.clickOnFitGraphIntoViewControl();

            // Verify the group node exists that contains 2 label and 2 relationship nodes
            // (stacked together because they share the same source-target pair: identity-1 → delegate-1)
            const stackedGroupNodeId =
              'grp(5984ac700cba276bc19d9466132abd9809f6342b58a5294a695be4957d9eb8b0)';
            await expandedFlyoutGraph.assertNodeExists(stackedGroupNodeId);

            // hide entity relationships
            await expandedFlyoutGraph.assertNodeDoesNotExist(supervisesRelationshipNodeId);
            await expandedFlyoutGraph.assertNodeDoesNotExist(dependsOnRelationshipNodeId);
            await expandedFlyoutGraph.assertNodeDoesNotExist(communicatesWithRelationshipNodeId);

            await expandedFlyoutGraph.assertNodeExists(delegateTargetNodeId);
            await expandedFlyoutGraph.assertNodeDoesNotExist(
              communicatesWithIdRelationshipTargetNodeId
            );
          });
        });
      });
    });
  });
}
