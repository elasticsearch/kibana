/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import expect from '@kbn/expect';
import { OBSERVABILITY_STREAMS_ENABLE_QUERY_STREAMS } from '@kbn/management-settings-ids';
import {
  disableStreams,
  enableStreams,
  indexDocument,
  putStream,
  putQueryStream,
  deleteStream,
  linkAttachment,
  unlinkAttachment,
  getAttachments,
  bulkAttachments,
  getAttachmentSuggestions,
} from '../helpers/requests';
import type { StreamsSupertestRepositoryClient } from '../helpers/repository_client';
import { createStreamsRepositoryAdminClient } from '../helpers/repository_client';
import type { DeploymentAgnosticFtrProviderContext } from '../../../ftr_provider_context';
import { loadDashboards, unloadDashboards } from '../helpers/dashboards';

export default function ({ getService }: DeploymentAgnosticFtrProviderContext) {
  const roleScopedSupertest = getService('roleScopedSupertest');
  const esClient = getService('es');
  const spaces = getService('spaces');
  const log = getService('log');

  let apiClient: StreamsSupertestRepositoryClient;

  const kibanaServer = getService('kibanaServer');

  const SPACE_ID = 'default';
  const DASHBOARD_ARCHIVES = [
    'src/platform/test/api_integration/fixtures/kbn_archiver/saved_objects/search.json',
    'src/platform/test/api_integration/fixtures/kbn_archiver/saved_objects/basic.json',
    'x-pack/platform/test/api_integration/fixtures/kbn_archives/streams/tagged_dashboard.json',
  ];
  const RULE_ARCHIVE =
    'x-pack/platform/test/api_integration/fixtures/kbn_archives/streams/rules.json';

  const SEARCH_DASHBOARD_ID = 'b70c7ae0-3224-11e8-a572-ffca06da1357';
  const BASIC_DASHBOARD_ID = 'be3733a0-9efe-11e7-acb3-3dab96693fab';
  const BASIC_DASHBOARD_TITLE = 'Requests';
  const TAG_ID = '00ad6a46-6ac3-4f6c-892c-2f72c54a5e7d';
  const FIRST_RULE_ID = '09cef989-3ded-4a1e-b2b0-53d491d13397';
  const SECOND_RULE_ID = '312638da-43d1-4d6e-8fb8-9cae201cdd3a';

  describe('Attachments API', function () {
    before(async () => {
      apiClient = await createStreamsRepositoryAdminClient(roleScopedSupertest);
      await enableStreams(apiClient);

      await indexDocument(esClient, 'logs.otel', {
        '@timestamp': '2024-01-01T00:00:10.000Z',
        message: '2023-01-01T00:00:10.000Z error test',
      });
    });

    after(async () => {
      await disableStreams(apiClient);
    });

    describe('List attachments', () => {
      before(async () => {
        await loadDashboards(kibanaServer, DASHBOARD_ARCHIVES, SPACE_ID);
        await kibanaServer.importExport.load(RULE_ARCHIVE, { space: SPACE_ID });

        await linkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'dashboard',
          id: SEARCH_DASHBOARD_ID,
        });
        await linkAttachment({ apiClient, stream: 'logs.otel', type: 'rule', id: FIRST_RULE_ID });
      });

      after(async () => {
        await unlinkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'dashboard',
          id: SEARCH_DASHBOARD_ID,
        });
        await unlinkAttachment({ apiClient, stream: 'logs.otel', type: 'rule', id: FIRST_RULE_ID });
        await unloadDashboards(kibanaServer, DASHBOARD_ARCHIVES, SPACE_ID);
        await kibanaServer.importExport.unload(RULE_ARCHIVE, { space: SPACE_ID });
      });

      it('lists all attachments without type filter', async () => {
        const response = await getAttachments({ apiClient, stream: 'logs.otel' });

        expect(response.attachments.length).to.eql(2);
        const types = response.attachments.map((a) => a.type).sort();
        expect(types).to.eql(['dashboard', 'rule']);
      });

      it('lists only dashboards when type filter is dashboard', async () => {
        const response = await getAttachments({
          apiClient,
          stream: 'logs.otel',
          filters: { types: ['dashboard'] },
        });

        expect(response.attachments.length).to.eql(1);
        const dashboard = response.attachments[0];
        expect(dashboard.type).to.eql('dashboard');
        expect(dashboard.id).to.eql(SEARCH_DASHBOARD_ID);
        // Verify metadata fields
        expect(dashboard.streamNames).to.be.an('array');
        expect(dashboard.streamNames).to.contain('logs.otel');
        expect(dashboard).to.have.property('description');
        expect(dashboard.createdAt).to.be.a('string');
        expect(dashboard.updatedAt).to.be.a('string');
      });

      it('lists only rules when type filter is rule', async () => {
        const response = await getAttachments({
          apiClient,
          stream: 'logs.otel',
          filters: { types: ['rule'] },
        });

        expect(response.attachments.length).to.eql(1);
        const rule = response.attachments[0];
        expect(rule.type).to.eql('rule');
        expect(rule.id).to.eql(FIRST_RULE_ID);
        // Verify metadata fields
        expect(rule.streamNames).to.be.an('array');
        expect(rule.streamNames).to.contain('logs.otel');
        expect(rule.createdAt).to.be.a('string');
        expect(rule.updatedAt).to.be.a('string');
      });

      it('lists multiple types when types array contains dashboard and rule', async () => {
        const response = await getAttachments({
          apiClient,
          stream: 'logs.otel',
          filters: { types: ['dashboard', 'rule'] },
        });

        expect(response.attachments.length).to.eql(2);
        const types = response.attachments.map((a) => a.type).sort();
        expect(types).to.eql(['dashboard', 'rule']);

        // Verify both types are present
        const dashboard = response.attachments.find((a) => a.type === 'dashboard');
        const rule = response.attachments.find((a) => a.type === 'rule');
        expect(dashboard).to.not.be(undefined);
        expect(rule).to.not.be(undefined);
      });
    });

    describe('Link and unlink attachments', () => {
      describe('dashboard attachments', () => {
        before(async () => {
          await loadDashboards(kibanaServer, DASHBOARD_ARCHIVES, SPACE_ID);
        });

        after(async () => {
          await unloadDashboards(kibanaServer, DASHBOARD_ARCHIVES, SPACE_ID);
        });

        it('links a dashboard to a stream', async () => {
          const linkResponse = await linkAttachment({
            apiClient,
            stream: 'logs.otel',
            type: 'dashboard',
            id: SEARCH_DASHBOARD_ID,
          });
          expect(linkResponse.acknowledged).to.eql(true);

          const listResponse = await getAttachments({
            apiClient,
            stream: 'logs.otel',
            filters: { types: ['dashboard'] },
          });
          expect(listResponse.attachments.length).to.eql(1);
          expect(listResponse.attachments[0].id).to.eql(SEARCH_DASHBOARD_ID);

          // Clean up
          await unlinkAttachment({
            apiClient,
            stream: 'logs.otel',
            type: 'dashboard',
            id: SEARCH_DASHBOARD_ID,
          });
        });

        it('unlinks a dashboard from a stream', async () => {
          await linkAttachment({
            apiClient,
            stream: 'logs.otel',
            type: 'dashboard',
            id: SEARCH_DASHBOARD_ID,
          });

          const unlinkResponse = await unlinkAttachment({
            apiClient,
            stream: 'logs.otel',
            type: 'dashboard',
            id: SEARCH_DASHBOARD_ID,
          });
          expect(unlinkResponse.acknowledged).to.eql(true);

          const listResponse = await getAttachments({
            apiClient,
            stream: 'logs.otel',
            filters: { types: ['dashboard'] },
          });
          expect(listResponse.attachments.length).to.eql(0);
        });

        it('links the same dashboard to multiple streams', async () => {
          // Create child stream
          await putStream(apiClient, 'logs.otel.child', {
            dashboards: [],
            rules: [],
            stream: {
              type: 'wired',
              description: '',
              ingest: {
                lifecycle: { inherit: {} },
                processing: { steps: [] },
                settings: {},
                wired: {
                  routing: [],
                  fields: {},
                },
                failure_store: { inherit: {} },
              },
            },
          });

          await linkAttachment({
            apiClient,
            stream: 'logs.otel',
            type: 'dashboard',
            id: SEARCH_DASHBOARD_ID,
          });
          await linkAttachment({
            apiClient,
            stream: 'logs.otel.child',
            type: 'dashboard',
            id: SEARCH_DASHBOARD_ID,
          });

          const logsResponse = await getAttachments({
            apiClient,
            stream: 'logs.otel',
            filters: { types: ['dashboard'] },
          });
          const childResponse = await getAttachments({
            apiClient,
            stream: 'logs.otel.child',
            filters: { types: ['dashboard'] },
          });

          expect(logsResponse.attachments.length).to.eql(1);
          expect(childResponse.attachments.length).to.eql(1);

          // Verify streamNames contains both streams
          expect(logsResponse.attachments[0].streamNames).to.contain('logs.otel');
          expect(logsResponse.attachments[0].streamNames).to.contain('logs.otel.child');

          // Clean up
          await unlinkAttachment({
            apiClient,
            stream: 'logs.otel',
            type: 'dashboard',
            id: SEARCH_DASHBOARD_ID,
          });
          await unlinkAttachment({
            apiClient,
            stream: 'logs.otel.child',
            type: 'dashboard',
            id: SEARCH_DASHBOARD_ID,
          });
          await deleteStream(apiClient, 'logs.otel.child');
        });
      });

      describe('Rule attachments', () => {
        before(async () => {
          await kibanaServer.importExport.load(RULE_ARCHIVE, { space: SPACE_ID });
        });

        after(async () => {
          await kibanaServer.importExport.unload(RULE_ARCHIVE, { space: SPACE_ID });
        });

        it('links a rule to a stream', async () => {
          const linkResponse = await linkAttachment({
            apiClient,
            stream: 'logs.otel',
            type: 'rule',
            id: FIRST_RULE_ID,
          });
          expect(linkResponse.acknowledged).to.eql(true);

          const listResponse = await getAttachments({
            apiClient,
            stream: 'logs.otel',
            filters: { types: ['rule'] },
          });
          expect(listResponse.attachments.length).to.eql(1);
          expect(listResponse.attachments[0].id).to.eql(FIRST_RULE_ID);

          // Clean up
          await unlinkAttachment({
            apiClient,
            stream: 'logs.otel',
            type: 'rule',
            id: FIRST_RULE_ID,
          });
        });

        it('unlinks a rule from a stream', async () => {
          await linkAttachment({ apiClient, stream: 'logs.otel', type: 'rule', id: FIRST_RULE_ID });

          const unlinkResponse = await unlinkAttachment({
            apiClient,
            stream: 'logs.otel',
            type: 'rule',
            id: FIRST_RULE_ID,
          });
          expect(unlinkResponse.acknowledged).to.eql(true);

          const listResponse = await getAttachments({
            apiClient,
            stream: 'logs.otel',
            filters: { types: ['rule'] },
          });
          expect(listResponse.attachments.length).to.eql(0);
        });
      });
    });

    describe('Bulk operations', () => {
      before(async () => {
        await loadDashboards(kibanaServer, DASHBOARD_ARCHIVES, SPACE_ID);
        await kibanaServer.importExport.load(RULE_ARCHIVE, { space: SPACE_ID });
      });

      after(async () => {
        await unloadDashboards(kibanaServer, DASHBOARD_ARCHIVES, SPACE_ID);
        await kibanaServer.importExport.unload(RULE_ARCHIVE, { space: SPACE_ID });
      });

      it('bulk links multiple dashboards', async () => {
        await bulkAttachments({
          apiClient,
          stream: 'logs.otel',
          operations: [
            { index: { type: 'dashboard', id: SEARCH_DASHBOARD_ID } },
            { index: { type: 'dashboard', id: BASIC_DASHBOARD_ID } },
          ],
        });

        const listResponse = await getAttachments({
          apiClient,
          stream: 'logs.otel',
          filters: { types: ['dashboard'] },
        });
        expect(listResponse.attachments.length).to.eql(2);

        // Clean up
        await bulkAttachments({
          apiClient,
          stream: 'logs.otel',
          operations: [
            { delete: { type: 'dashboard', id: SEARCH_DASHBOARD_ID } },
            { delete: { type: 'dashboard', id: BASIC_DASHBOARD_ID } },
          ],
        });
      });

      it('bulk unlinks multiple dashboards', async () => {
        await bulkAttachments({
          apiClient,
          stream: 'logs.otel',
          operations: [
            { index: { type: 'dashboard', id: SEARCH_DASHBOARD_ID } },
            { index: { type: 'dashboard', id: BASIC_DASHBOARD_ID } },
          ],
        });

        await bulkAttachments({
          apiClient,
          stream: 'logs.otel',
          operations: [
            { delete: { type: 'dashboard', id: SEARCH_DASHBOARD_ID } },
            { delete: { type: 'dashboard', id: BASIC_DASHBOARD_ID } },
          ],
        });

        const listResponse = await getAttachments({
          apiClient,
          stream: 'logs.otel',
          filters: { types: ['dashboard'] },
        });
        expect(listResponse.attachments.length).to.eql(0);
      });

      it('bulk links mixed attachment types (dashboards and rules)', async () => {
        await bulkAttachments({
          apiClient,
          stream: 'logs.otel',
          operations: [
            { index: { type: 'dashboard', id: SEARCH_DASHBOARD_ID } },
            { index: { type: 'dashboard', id: BASIC_DASHBOARD_ID } },
            { index: { type: 'rule', id: FIRST_RULE_ID } },
            { index: { type: 'rule', id: SECOND_RULE_ID } },
          ],
        });

        const allAttachments = await getAttachments({ apiClient, stream: 'logs.otel' });
        expect(allAttachments.attachments.length).to.eql(4);

        const dashboards = await getAttachments({
          apiClient,
          stream: 'logs.otel',
          filters: { types: ['dashboard'] },
        });
        expect(dashboards.attachments.length).to.eql(2);

        const rules = await getAttachments({
          apiClient,
          stream: 'logs.otel',
          filters: { types: ['rule'] },
        });
        expect(rules.attachments.length).to.eql(2);

        // Clean up
        await bulkAttachments({
          apiClient,
          stream: 'logs.otel',
          operations: [
            { delete: { type: 'dashboard', id: SEARCH_DASHBOARD_ID } },
            { delete: { type: 'dashboard', id: BASIC_DASHBOARD_ID } },
            { delete: { type: 'rule', id: FIRST_RULE_ID } },
            { delete: { type: 'rule', id: SECOND_RULE_ID } },
          ],
        });
      });

      it('bulk operations with mixed actions (index and delete)', async () => {
        // First, link some attachments
        await bulkAttachments({
          apiClient,
          stream: 'logs.otel',
          operations: [
            { index: { type: 'dashboard', id: SEARCH_DASHBOARD_ID } },
            { index: { type: 'rule', id: FIRST_RULE_ID } },
          ],
        });

        // Now do a mixed operation: add new ones and delete existing ones
        await bulkAttachments({
          apiClient,
          stream: 'logs.otel',
          operations: [
            { delete: { type: 'dashboard', id: SEARCH_DASHBOARD_ID } },
            { index: { type: 'dashboard', id: BASIC_DASHBOARD_ID } },
            { index: { type: 'rule', id: SECOND_RULE_ID } },
          ],
        });

        const allAttachments = await getAttachments({ apiClient, stream: 'logs.otel' });
        expect(allAttachments.attachments.length).to.eql(3);

        const attachmentIds = allAttachments.attachments.map((a) => a.id).sort();
        expect(attachmentIds).to.eql([BASIC_DASHBOARD_ID, FIRST_RULE_ID, SECOND_RULE_ID].sort());

        // Clean up
        await bulkAttachments({
          apiClient,
          stream: 'logs.otel',
          operations: [
            { delete: { type: 'dashboard', id: BASIC_DASHBOARD_ID } },
            { delete: { type: 'rule', id: FIRST_RULE_ID } },
            { delete: { type: 'rule', id: SECOND_RULE_ID } },
          ],
        });
      });
    });

    describe('Unlink deleted attachments', () => {
      before(async () => {
        await loadDashboards(kibanaServer, DASHBOARD_ARCHIVES, SPACE_ID);
        await kibanaServer.importExport.load(RULE_ARCHIVE, { space: SPACE_ID });
      });

      after(async () => {
        // Make sure dashboards and rules are loaded for subsequent tests
        await loadDashboards(kibanaServer, DASHBOARD_ARCHIVES, SPACE_ID);
        await kibanaServer.importExport.load(RULE_ARCHIVE, { space: SPACE_ID });
      });

      it('unlinks a dashboard even if the dashboard has been deleted', async () => {
        // Link a dashboard to the stream
        await linkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'dashboard',
          id: SEARCH_DASHBOARD_ID,
        });

        // Verify the link was created
        const linkedAttachments = await getAttachments({
          apiClient,
          stream: 'logs.otel',
          filters: { types: ['dashboard'] },
        });
        expect(linkedAttachments.attachments.length).to.eql(1);
        expect(linkedAttachments.attachments[0].id).to.eql(SEARCH_DASHBOARD_ID);

        // Delete the dashboard
        await unloadDashboards(kibanaServer, DASHBOARD_ARCHIVES, SPACE_ID);

        // Try to unlink the attachment - should succeed even though dashboard no longer exists
        const unlinkResponse = await unlinkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'dashboard',
          id: SEARCH_DASHBOARD_ID,
        });
        expect(unlinkResponse.acknowledged).to.eql(true);

        // Verify the link was removed
        const unlinkedAttachments = await getAttachments({
          apiClient,
          stream: 'logs.otel',
          filters: { types: ['dashboard'] },
        });
        expect(unlinkedAttachments.attachments.length).to.eql(0);

        // Restore dashboards for subsequent tests
        await loadDashboards(kibanaServer, DASHBOARD_ARCHIVES, SPACE_ID);
      });

      it('bulk unlinks a dashboard even if the dashboard has been deleted', async () => {
        // Link a dashboard to the stream
        await linkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'dashboard',
          id: BASIC_DASHBOARD_ID,
        });

        // Verify the link was created
        const linkedAttachments = await getAttachments({
          apiClient,
          stream: 'logs.otel',
          filters: { types: ['dashboard'] },
        });
        expect(linkedAttachments.attachments.length).to.eql(1);
        expect(linkedAttachments.attachments[0].id).to.eql(BASIC_DASHBOARD_ID);

        // Delete the dashboard
        await unloadDashboards(kibanaServer, DASHBOARD_ARCHIVES, SPACE_ID);

        // Try to unlink the attachment using bulk operation - should succeed even though dashboard no longer exists
        await bulkAttachments({
          apiClient,
          stream: 'logs.otel',
          operations: [{ delete: { type: 'dashboard', id: BASIC_DASHBOARD_ID } }],
        });

        // Verify the link was removed
        const unlinkedAttachments = await getAttachments({
          apiClient,
          stream: 'logs.otel',
          filters: { types: ['dashboard'] },
        });
        expect(unlinkedAttachments.attachments.length).to.eql(0);

        // Restore dashboards for subsequent tests
        await loadDashboards(kibanaServer, DASHBOARD_ARCHIVES, SPACE_ID);
      });
    });

    describe('Suggestions', () => {
      before(async () => {
        await loadDashboards(kibanaServer, DASHBOARD_ARCHIVES, SPACE_ID);
        await kibanaServer.importExport.load(RULE_ARCHIVE, { space: SPACE_ID });
      });

      after(async () => {
        await unloadDashboards(kibanaServer, DASHBOARD_ARCHIVES, SPACE_ID);
        await kibanaServer.importExport.unload(RULE_ARCHIVE, { space: SPACE_ID });
      });

      it('suggests all attachment types without type filter', async () => {
        const response = await getAttachmentSuggestions({
          apiClient,
          stream: 'logs.otel',
        });

        expect(response.suggestions.length).to.be.greaterThan(0);
        const types = response.suggestions.map((a) => a.type);
        expect(types).to.contain('dashboard');
        expect(types).to.contain('rule');
      });

      it('suggests only dashboards when type filter is dashboard', async () => {
        const response = await getAttachmentSuggestions({
          apiClient,
          stream: 'logs.otel',
          filters: { types: ['dashboard'] },
        });

        expect(response.suggestions.length).to.be.greaterThan(0);
        response.suggestions.forEach((suggestion) => {
          expect(suggestion.type).to.eql('dashboard');
        });
      });

      it('suggests only rules when type filter is rule', async () => {
        const response = await getAttachmentSuggestions({
          apiClient,
          stream: 'logs.otel',
          filters: { types: ['rule'] },
        });

        expect(response.suggestions.length).to.be.greaterThan(0);
        response.suggestions.forEach((suggestion) => {
          expect(suggestion.type).to.eql('rule');
        });
      });

      it('filters dashboard suggestions based on query', async () => {
        const response = await getAttachmentSuggestions({
          apiClient,
          stream: 'logs.otel',
          filters: {
            types: ['dashboard'],
            query: BASIC_DASHBOARD_TITLE,
          },
        });

        expect(response.suggestions.length).to.eql(1);
        expect(response.suggestions[0].id).to.eql(BASIC_DASHBOARD_ID);
        expect(response.suggestions[0].type).to.eql('dashboard');
      });

      it('filters dashboard suggestions based on tags', async () => {
        const response = await getAttachmentSuggestions({
          apiClient,
          stream: 'logs.otel',
          filters: {
            types: ['dashboard'],
            tags: [TAG_ID],
          },
        });

        expect(response.suggestions.length).to.eql(1);
        response.suggestions.forEach((suggestion) => {
          expect(suggestion.type).to.eql('dashboard');
        });
      });

      it('suggests multiple types when types array contains dashboard and rule', async () => {
        const response = await getAttachmentSuggestions({
          apiClient,
          stream: 'logs.otel',
          filters: { types: ['dashboard', 'rule'] },
        });

        expect(response.suggestions.length).to.be.greaterThan(0);
        const types = response.suggestions.map((s) => s.type);
        expect(types).to.contain('dashboard');
        expect(types).to.contain('rule');

        // Verify at least one of each type exists
        const hasDashboard = response.suggestions.some((s) => s.type === 'dashboard');
        const hasRule = response.suggestions.some((s) => s.type === 'rule');
        expect(hasDashboard).to.eql(true);
        expect(hasRule).to.eql(true);
      });

      it('excludes already linked attachments from suggestions', async () => {
        // First, get suggestions before linking to verify the attachments exist
        const beforeResponse = await getAttachmentSuggestions({
          apiClient,
          stream: 'logs.otel',
          filters: { types: ['dashboard', 'rule'] },
        });

        // Verify the attachments we're about to link are in the suggestions
        const dashboardInSuggestionsBefore = beforeResponse.suggestions.some(
          (s) => s.id === SEARCH_DASHBOARD_ID && s.type === 'dashboard'
        );
        const ruleInSuggestionsBefore = beforeResponse.suggestions.some(
          (s) => s.id === FIRST_RULE_ID && s.type === 'rule'
        );
        expect(dashboardInSuggestionsBefore).to.eql(true);
        expect(ruleInSuggestionsBefore).to.eql(true);

        // Link the dashboard and rule to the stream
        await linkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'dashboard',
          id: SEARCH_DASHBOARD_ID,
        });
        await linkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'rule',
          id: FIRST_RULE_ID,
        });

        // Get suggestions after linking
        const afterResponse = await getAttachmentSuggestions({
          apiClient,
          stream: 'logs.otel',
          filters: { types: ['dashboard', 'rule'] },
        });

        // Verify the linked dashboard is NOT in the suggestions
        const dashboardInSuggestionsAfter = afterResponse.suggestions.some(
          (s) => s.id === SEARCH_DASHBOARD_ID && s.type === 'dashboard'
        );
        expect(dashboardInSuggestionsAfter).to.eql(false);

        // Verify the linked rule is NOT in the suggestions
        const ruleInSuggestionsAfter = afterResponse.suggestions.some(
          (s) => s.id === FIRST_RULE_ID && s.type === 'rule'
        );
        expect(ruleInSuggestionsAfter).to.eql(false);

        // Verify other attachments are still suggested (the other dashboard and rule)
        const otherDashboardInSuggestions = afterResponse.suggestions.some(
          (s) => s.id === BASIC_DASHBOARD_ID && s.type === 'dashboard'
        );
        const otherRuleInSuggestions = afterResponse.suggestions.some(
          (s) => s.id === SECOND_RULE_ID && s.type === 'rule'
        );
        expect(otherDashboardInSuggestions).to.eql(true);
        expect(otherRuleInSuggestions).to.eql(true);

        // Clean up
        await unlinkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'dashboard',
          id: SEARCH_DASHBOARD_ID,
        });
        await unlinkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'rule',
          id: FIRST_RULE_ID,
        });
      });
    });

    describe('Cross-space linking', () => {
      const TEST_SPACE_ID = 'test-space';

      before(async () => {
        // Create a new space
        await spaces.create({
          id: TEST_SPACE_ID,
          name: 'Test Space',
          disabledFeatures: [],
        });

        // Load dashboards and rules in the test space
        await loadDashboards(kibanaServer, DASHBOARD_ARCHIVES, TEST_SPACE_ID);
        await kibanaServer.importExport.load(RULE_ARCHIVE, { space: TEST_SPACE_ID });
      });

      after(async () => {
        await unloadDashboards(kibanaServer, DASHBOARD_ARCHIVES, TEST_SPACE_ID);
        await kibanaServer.importExport.unload(RULE_ARCHIVE, { space: TEST_SPACE_ID });
        await spaces.delete(TEST_SPACE_ID);
      });

      it('should return 404 when trying to link a dashboard from another space', async () => {
        await linkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'dashboard',
          id: SEARCH_DASHBOARD_ID,
          expectedStatusCode: 404,
        });
      });

      it('should return 404 when trying to link a rule from another space', async () => {
        await linkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'rule',
          id: FIRST_RULE_ID,
          expectedStatusCode: 404,
        });
      });

      it('should successfully link a dashboard from the same space', async () => {
        await linkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'dashboard',
          id: SEARCH_DASHBOARD_ID,
          spaceId: TEST_SPACE_ID,
        });

        // Verify the link was created
        const attachments = await getAttachments({
          apiClient,
          stream: 'logs.otel',
          filters: { types: ['dashboard'] },
          spaceId: TEST_SPACE_ID,
        });
        expect(attachments.attachments.length).to.eql(1);
        expect(attachments.attachments[0].id).to.eql(SEARCH_DASHBOARD_ID);

        // Clean up
        await unlinkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'dashboard',
          id: SEARCH_DASHBOARD_ID,
          spaceId: TEST_SPACE_ID,
        });
      });

      it('should successfully link a rule from the same space', async () => {
        await linkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'rule',
          id: FIRST_RULE_ID,
          spaceId: TEST_SPACE_ID,
        });

        // Verify the link was created
        const attachments = await getAttachments({
          apiClient,
          stream: 'logs.otel',
          filters: { types: ['rule'] },
          spaceId: TEST_SPACE_ID,
        });
        expect(attachments.attachments.length).to.eql(1);
        expect(attachments.attachments[0].id).to.eql(FIRST_RULE_ID);

        // Clean up
        await unlinkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'rule',
          id: FIRST_RULE_ID,
          spaceId: TEST_SPACE_ID,
        });
      });

      it('should fail bulk operation when one attachment is from another space', async () => {
        await bulkAttachments({
          apiClient,
          stream: 'logs.otel',
          operations: [
            { index: { type: 'dashboard', id: SEARCH_DASHBOARD_ID } },
            { index: { type: 'dashboard', id: BASIC_DASHBOARD_ID } },
          ],
          expectedStatusCode: 404,
        });
      });

      it('should return suggestions in the test space', async () => {
        const response = await getAttachmentSuggestions({
          apiClient,
          stream: 'logs.otel',
          spaceId: TEST_SPACE_ID,
        });

        expect(response.suggestions.length).to.be.greaterThan(0);
      });

      it('should not return suggestions in the default space', async () => {
        const response = await getAttachmentSuggestions({
          apiClient,
          stream: 'logs.otel',
        });

        expect(response.suggestions.length).to.eql(0);
      });

      it('should not see attachments from test space when querying from default space', async () => {
        // Link a dashboard to the stream in the test space
        await linkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'dashboard',
          id: SEARCH_DASHBOARD_ID,
          spaceId: TEST_SPACE_ID,
        });

        // Try to get attachments from the default space
        const response = await getAttachments({
          apiClient,
          stream: 'logs.otel',
        });

        // Should not see any attachments because the dashboard was linked from test space
        expect(response.attachments.length).to.eql(0);

        // Clean up
        await unlinkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'dashboard',
          id: SEARCH_DASHBOARD_ID,
          spaceId: TEST_SPACE_ID,
        });
      });
    });

    describe('Space ownership validation for unlink operations', () => {
      const TEST_SPACE_ID = 'test-space-unlink-validation';

      before(async () => {
        // Create a new space
        await spaces.create({
          id: TEST_SPACE_ID,
          name: 'Test Space Unlink Validation',
          disabledFeatures: [],
        });

        // Load dashboards and rules only in test space
        // The tests will link from test space and try to unlink from default space
        await loadDashboards(kibanaServer, DASHBOARD_ARCHIVES, TEST_SPACE_ID);
        await kibanaServer.importExport.load(RULE_ARCHIVE, { space: TEST_SPACE_ID });
      });

      after(async () => {
        await unloadDashboards(kibanaServer, DASHBOARD_ARCHIVES, TEST_SPACE_ID);
        await kibanaServer.importExport.unload(RULE_ARCHIVE, { space: TEST_SPACE_ID });
        await spaces.delete(TEST_SPACE_ID);
      });

      it('should prevent unlinking dashboard from different space', async () => {
        // Link dashboard in test space (where it exists)
        await linkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'dashboard',
          id: SEARCH_DASHBOARD_ID,
          spaceId: TEST_SPACE_ID,
        });

        // Try to unlink from default space - should fail with 403
        await unlinkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'dashboard',
          id: SEARCH_DASHBOARD_ID,
          expectedStatusCode: 403,
        });

        // Clean up - unlink from test space
        await unlinkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'dashboard',
          id: SEARCH_DASHBOARD_ID,
          spaceId: TEST_SPACE_ID,
        });
      });

      it('should prevent unlinking rule from different space', async () => {
        // Link rule in test space (where it exists)
        await linkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'rule',
          id: FIRST_RULE_ID,
          spaceId: TEST_SPACE_ID,
        });

        // Try to unlink from default space - should fail with 403
        await unlinkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'rule',
          id: FIRST_RULE_ID,
          expectedStatusCode: 403,
        });

        // Clean up - unlink from test space
        await unlinkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'rule',
          id: FIRST_RULE_ID,
          spaceId: TEST_SPACE_ID,
        });
      });

      it('should allow unlinking dashboard from current space', async () => {
        // Link dashboard in test space (where it exists)
        await linkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'dashboard',
          id: SEARCH_DASHBOARD_ID,
          spaceId: TEST_SPACE_ID,
        });

        // Unlink from test space - should succeed
        const response = await unlinkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'dashboard',
          id: SEARCH_DASHBOARD_ID,
          spaceId: TEST_SPACE_ID,
        });

        expect(response.acknowledged).to.eql(true);
      });

      it('should allow unlinking deleted dashboard', async () => {
        // Link dashboard in test space (where it exists)
        await linkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'dashboard',
          id: SEARCH_DASHBOARD_ID,
          spaceId: TEST_SPACE_ID,
        });

        // Verify the link was created
        const linkedAttachments = await getAttachments({
          apiClient,
          stream: 'logs.otel',
          filters: { types: ['dashboard'] },
          spaceId: TEST_SPACE_ID,
        });
        expect(linkedAttachments.attachments.length).to.eql(1);

        // Delete the dashboard
        await unloadDashboards(kibanaServer, DASHBOARD_ARCHIVES, TEST_SPACE_ID);

        // Unlink should succeed even though dashboard is deleted
        const unlinkResponse = await unlinkAttachment({
          apiClient,
          stream: 'logs.otel',
          type: 'dashboard',
          id: SEARCH_DASHBOARD_ID,
          spaceId: TEST_SPACE_ID,
        });
        expect(unlinkResponse.acknowledged).to.eql(true);

        // Restore dashboards for subsequent tests
        await loadDashboards(kibanaServer, DASHBOARD_ARCHIVES, TEST_SPACE_ID);
      });

      it('should prevent bulk unlink from different space', async () => {
        // Link dashboards in test space (where they exist)
        await bulkAttachments({
          apiClient,
          stream: 'logs.otel',
          operations: [
            { index: { type: 'dashboard', id: SEARCH_DASHBOARD_ID } },
            { index: { type: 'dashboard', id: BASIC_DASHBOARD_ID } },
          ],
          spaceId: TEST_SPACE_ID,
        });

        // Try to bulk unlink from default space - should fail with 403
        await bulkAttachments({
          apiClient,
          stream: 'logs.otel',
          operations: [
            { delete: { type: 'dashboard', id: SEARCH_DASHBOARD_ID } },
            { delete: { type: 'dashboard', id: BASIC_DASHBOARD_ID } },
          ],
          expectedStatusCode: 403,
        });

        // Clean up - unlink from test space
        await bulkAttachments({
          apiClient,
          stream: 'logs.otel',
          operations: [
            { delete: { type: 'dashboard', id: SEARCH_DASHBOARD_ID } },
            { delete: { type: 'dashboard', id: BASIC_DASHBOARD_ID } },
          ],
          spaceId: TEST_SPACE_ID,
        });
      });
    });

    describe('query stream attachments', function () {
      // Query streams rely on ES|QL Views, which are not yet available on serverless/MKI/Cloud.
      this.tags(['skipCloud', 'skipMKI', 'skipServerless']);

      const QUERY_ATTACH_TEST_STREAM = 'query-attach-test-stream';

      before(async () => {
        await kibanaServer.uiSettings.update({
          [OBSERVABILITY_STREAMS_ENABLE_QUERY_STREAMS]: true,
        });
        await kibanaServer.uiSettings.waitForEventualCacheRefresh();
        await loadDashboards(kibanaServer, DASHBOARD_ARCHIVES, SPACE_ID);
        await kibanaServer.importExport.load(RULE_ARCHIVE, { space: SPACE_ID });
      });

      after(async () => {
        await unloadDashboards(kibanaServer, DASHBOARD_ARCHIVES, SPACE_ID);
        await kibanaServer.importExport.unload(RULE_ARCHIVE, { space: SPACE_ID });
        await kibanaServer.uiSettings.update({
          [OBSERVABILITY_STREAMS_ENABLE_QUERY_STREAMS]: false,
        });
        await kibanaServer.uiSettings.waitForEventualCacheRefresh();
      });

      beforeEach(async () => {
        await putQueryStream(apiClient, QUERY_ATTACH_TEST_STREAM, {
          query: { esql: 'FROM logs.otel' },
        });
      });

      afterEach(async () => {
        try {
          await deleteStream(apiClient, QUERY_ATTACH_TEST_STREAM);
        } catch (err) {
          const message = String(err?.message ?? err);
          if (!/\b404\b/.test(message)) {
            throw err;
          }
          log.debug(`Query stream cleanup: ${QUERY_ATTACH_TEST_STREAM} already absent`);
        }
      });

      it('attaches a dashboard to a query stream', async () => {
        const linkResponse = await linkAttachment({
          apiClient,
          stream: QUERY_ATTACH_TEST_STREAM,
          type: 'dashboard',
          id: SEARCH_DASHBOARD_ID,
        });
        expect(linkResponse.acknowledged).to.eql(true);

        const listResponse = await getAttachments({
          apiClient,
          stream: QUERY_ATTACH_TEST_STREAM,
          filters: { types: ['dashboard'] },
        });
        expect(listResponse.attachments.length).to.eql(1);
        expect(listResponse.attachments[0].id).to.eql(SEARCH_DASHBOARD_ID);
      });

      it('attaches a rule to a query stream', async () => {
        const linkResponse = await linkAttachment({
          apiClient,
          stream: QUERY_ATTACH_TEST_STREAM,
          type: 'rule',
          id: FIRST_RULE_ID,
        });
        expect(linkResponse.acknowledged).to.eql(true);

        const listResponse = await getAttachments({
          apiClient,
          stream: QUERY_ATTACH_TEST_STREAM,
          filters: { types: ['rule'] },
        });
        expect(listResponse.attachments.length).to.eql(1);
        expect(listResponse.attachments[0].id).to.eql(FIRST_RULE_ID);
      });

      it('lists multiple attachments on a query stream', async () => {
        await linkAttachment({
          apiClient,
          stream: QUERY_ATTACH_TEST_STREAM,
          type: 'dashboard',
          id: SEARCH_DASHBOARD_ID,
        });
        await linkAttachment({
          apiClient,
          stream: QUERY_ATTACH_TEST_STREAM,
          type: 'rule',
          id: FIRST_RULE_ID,
        });

        const response = await getAttachments({ apiClient, stream: QUERY_ATTACH_TEST_STREAM });

        expect(response.attachments.length).to.eql(2);
        const types = response.attachments.map((a) => a.type).sort();
        expect(types).to.eql(['dashboard', 'rule']);
      });

      it('unlinks an attachment from a query stream', async () => {
        await linkAttachment({
          apiClient,
          stream: QUERY_ATTACH_TEST_STREAM,
          type: 'dashboard',
          id: SEARCH_DASHBOARD_ID,
        });
        await linkAttachment({
          apiClient,
          stream: QUERY_ATTACH_TEST_STREAM,
          type: 'rule',
          id: FIRST_RULE_ID,
        });

        const unlinkResponse = await unlinkAttachment({
          apiClient,
          stream: QUERY_ATTACH_TEST_STREAM,
          type: 'dashboard',
          id: SEARCH_DASHBOARD_ID,
        });
        expect(unlinkResponse.acknowledged).to.eql(true);

        const dashboards = await getAttachments({
          apiClient,
          stream: QUERY_ATTACH_TEST_STREAM,
          filters: { types: ['dashboard'] },
        });
        expect(dashboards.attachments.length).to.eql(0);

        const rules = await getAttachments({
          apiClient,
          stream: QUERY_ATTACH_TEST_STREAM,
          filters: { types: ['rule'] },
        });
        expect(rules.attachments.length).to.eql(1);
        expect(rules.attachments[0].id).to.eql(FIRST_RULE_ID);
      });
    });

    describe('SLO cascade-unlink on stream deletion', () => {
      const SLO_TEST_STREAM = 'logs.otel.slo_test';
      const SLO_QUERY_TEST_STREAM = 'query-attach-slo-test-stream';

      const resolveSloSavedObjectId = async (logicalSloId: string): Promise<string> => {
        const { saved_objects: sloSavedObjects } = await kibanaServer.savedObjects.find<{
          id: string;
        }>({ type: 'slo' });
        const match = sloSavedObjects.find((so) => so.attributes.id === logicalSloId);
        if (!match) {
          throw new Error(`Could not find SLO saved object for logical id ${logicalSloId}`);
        }
        return match.id;
      };

      const wiredChildStreamBody = {
        dashboards: [],
        rules: [],
        stream: {
          type: 'wired' as const,
          description: '',
          ingest: {
            lifecycle: { inherit: {} },
            processing: { steps: [] },
            settings: {},
            wired: {
              routing: [],
              fields: {},
            },
            failure_store: { inherit: {} },
          },
        },
      };

      const sloFixture = (name: string) => ({
        name,
        description: 'Regression fixture for SLO cascade-unlink on stream delete',
        indicator: {
          type: 'sli.kql.custom',
          params: {
            index: 'logs.otel',
            filter: '*',
            good: 'message: *',
            total: 'message: *',
            timestampField: '@timestamp',
          },
        },
        budgetingMethod: 'occurrences',
        timeWindow: {
          duration: '7d',
          type: 'rolling',
        },
        objective: {
          target: 0.99,
        },
        tags: ['streams-test'],
      });

      it('removes SLO attachment links when the stream is deleted', async () => {
        let sloId = '';
        const supertest = await roleScopedSupertest.getSupertestWithRoleScope('admin', {
          useCookieHeader: true,
          withInternalHeaders: true,
        });

        try {
          await putStream(apiClient, SLO_TEST_STREAM, wiredChildStreamBody);

          const createSloResponse = await supertest
            .post('/api/observability/slos')
            .set('kbn-xsrf', 'foo')
            .send(sloFixture('streams-attachments-slo-unlink-regression'))
            .expect(200);

          expect(createSloResponse.body.id).to.be.a('string');
          sloId = createSloResponse.body.id as string;
          expect(sloId).to.not.be.empty();

          const sloSavedObjectId = await resolveSloSavedObjectId(sloId);

          await linkAttachment({
            apiClient,
            stream: SLO_TEST_STREAM,
            type: 'slo',
            id: sloSavedObjectId,
          });

          const linked = await getAttachments({
            apiClient,
            stream: SLO_TEST_STREAM,
            filters: { types: ['slo'] },
          });
          expect(linked.attachments.length).to.eql(1);
          expect(linked.attachments[0].id).to.eql(sloSavedObjectId);

          await deleteStream(apiClient, SLO_TEST_STREAM);
          await putStream(apiClient, SLO_TEST_STREAM, wiredChildStreamBody);

          const afterDelete = await getAttachments({
            apiClient,
            stream: SLO_TEST_STREAM,
            filters: { types: ['slo'] },
          });
          expect(afterDelete.attachments.length).to.eql(0);
        } finally {
          await deleteStream(apiClient, SLO_TEST_STREAM).catch((err) => {
            const message = String(err?.message ?? err);
            if (!/\b404\b/.test(message)) {
              log.warning(
                `SLO cascade cleanup: deleteStream failed for ${SLO_TEST_STREAM}: ${message}`
              );
            }
          });
          if (sloId) {
            await supertest
              .delete(`/api/observability/slos/${encodeURIComponent(sloId)}`)
              .set('kbn-xsrf', 'foo')
              .expect(204);
          }
        }
      });

      describe('query stream', function () {
        // Query streams rely on ES|QL Views, which are not yet available on serverless/MKI/Cloud.
        this.tags(['skipCloud', 'skipMKI', 'skipServerless']);

        before(async () => {
          await kibanaServer.uiSettings.update({
            [OBSERVABILITY_STREAMS_ENABLE_QUERY_STREAMS]: true,
          });
          await kibanaServer.uiSettings.waitForEventualCacheRefresh();
        });

        after(async () => {
          await kibanaServer.uiSettings.update({
            [OBSERVABILITY_STREAMS_ENABLE_QUERY_STREAMS]: false,
          });
          await kibanaServer.uiSettings.waitForEventualCacheRefresh();
        });

        it('removes SLO attachment links when a query stream is deleted', async () => {
          let sloId = '';
          const supertest = await roleScopedSupertest.getSupertestWithRoleScope('admin', {
            useCookieHeader: true,
            withInternalHeaders: true,
          });
          const queryStreamBody = { query: { esql: 'FROM logs.otel' } };

          try {
            await putQueryStream(apiClient, SLO_QUERY_TEST_STREAM, queryStreamBody);

            const createSloResponse = await supertest
              .post('/api/observability/slos')
              .set('kbn-xsrf', 'foo')
              .send(sloFixture('streams-attachments-slo-query-unlink-regression'))
              .expect(200);

            expect(createSloResponse.body.id).to.be.a('string');
            sloId = createSloResponse.body.id as string;
            expect(sloId).to.not.be.empty();

            const sloSavedObjectId = await resolveSloSavedObjectId(sloId);

            await linkAttachment({
              apiClient,
              stream: SLO_QUERY_TEST_STREAM,
              type: 'slo',
              id: sloSavedObjectId,
            });

            const linked = await getAttachments({
              apiClient,
              stream: SLO_QUERY_TEST_STREAM,
              filters: { types: ['slo'] },
            });
            expect(linked.attachments.length).to.eql(1);
            expect(linked.attachments[0].id).to.eql(sloSavedObjectId);

            await deleteStream(apiClient, SLO_QUERY_TEST_STREAM);

            await putQueryStream(apiClient, SLO_QUERY_TEST_STREAM, queryStreamBody);

            const afterDelete = await getAttachments({
              apiClient,
              stream: SLO_QUERY_TEST_STREAM,
              filters: { types: ['slo'] },
            });
            expect(afterDelete.attachments.length).to.eql(0);
          } finally {
            // Throwing from finally would mask a real test failure above, so log-and-continue.
            await deleteStream(apiClient, SLO_QUERY_TEST_STREAM).catch((err) => {
              const message = String(err?.message ?? err);
              if (!/\b404\b/.test(message)) {
                log.warning(
                  `SLO cascade cleanup: deleteStream failed for ${SLO_QUERY_TEST_STREAM}: ${message}`
                );
              }
            });
            if (sloId) {
              await supertest
                .delete(`/api/observability/slos/${encodeURIComponent(sloId)}`)
                .set('kbn-xsrf', 'foo')
                .expect(204);
            }
          }
        });
      });
    });
  });
}
