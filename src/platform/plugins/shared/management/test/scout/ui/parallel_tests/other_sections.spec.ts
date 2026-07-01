/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Stack Management sidebar — ingest, security, and stack section visibility driven by ES cluster privileges.

import { expect } from '@kbn/scout/ui';
import { tags } from '@kbn/scout';
import { test, CUSTOM_ROLES } from '../fixtures';

test.describe(
  'Stack Management — ingest, security, and stack sections',
  { tag: tags.stateful.classic },
  () => {
    test('logstash_read_user sees only the ingest section with pipelines', async ({
      browserAuth,
      pageObjects,
    }) => {
      await browserAuth.loginWithCustomRole(CUSTOM_ROLES.dashboard_read_and_logstash);

      await test.step('navigate to management and assert nav link + sidebar', async () => {
        await pageObjects.management.goto();
        const navLinks = await pageObjects.collapsibleNav.getNavLinks();
        expect(navLinks).toContain('Stack Management');

        const sections = await pageObjects.management.readSidebarSections();
        // kibana section with 'settings' appears because advancedSettings:read is granted
        expect(sections).toHaveLength(2);
        expect(sections[0]).toStrictEqual({
          sectionId: 'ingest',
          sectionLinks: ['pipelines'],
        });
        expect(sections[1]).toStrictEqual({
          sectionId: 'kibana',
          sectionLinks: ['settings'],
        });
      });
    });

    // Pre-migration tag 'skipFIPS'
    test('manage_security sees only the security section with all four links', async ({
      browserAuth,
      pageObjects,
    }) => {
      await browserAuth.loginWithCustomRole(CUSTOM_ROLES.dashboard_read_and_manage_security);

      await test.step('navigate to management and assert nav link + sidebar', async () => {
        await pageObjects.management.goto();
        const navLinks = await pageObjects.collapsibleNav.getNavLinks();
        expect(navLinks).toContain('Stack Management');

        const sections = await pageObjects.management.readSidebarSections();
        // kibana section with 'settings' appears because advancedSettings:read is granted
        expect(sections).toHaveLength(2);
        expect(sections[0]).toStrictEqual({
          sectionId: 'security',
          sectionLinks: ['users', 'roles', 'api_keys', 'role_mappings'],
        });
        expect(sections[1]).toStrictEqual({
          sectionId: 'kibana',
          sectionLinks: ['settings'],
        });
      });
    });

    test('cluster:manage surfaces ingest, data (incl. remote_clusters) and stack (license_management) sections', async ({
      browserAuth,
      pageObjects,
    }) => {
      await browserAuth.loginWithCustomRole(CUSTOM_ROLES.dashboard_read_and_license_management);

      await test.step('navigate to management and assert nav link + sidebar', async () => {
        await pageObjects.management.goto();
        const navLinks = await pageObjects.collapsibleNav.getNavLinks();
        expect(navLinks).toContain('Stack Management');

        const sections = await pageObjects.management.readSidebarSections();
        // cluster:manage surfaces ingest (ingest_pipelines + logstash pipelines), data (incl. remote_clusters),
        // kibana (settings, from advancedSettings:read) and stack (license_management).
        expect(sections).toHaveLength(4);
        expect(sections[0]).toStrictEqual({
          sectionId: 'ingest',
          sectionLinks: ['ingest_pipelines', 'pipelines'],
        });
        expect(sections[1]).toStrictEqual({
          sectionId: 'data',
          sectionLinks: [
            'index_management',
            'index_lifecycle_management',
            'data_federation',
            'snapshot_restore',
            'rollup_jobs',
            'transform',
            'remote_clusters',
          ],
        });
        expect(sections[2]).toStrictEqual({
          sectionId: 'kibana',
          sectionLinks: ['settings'],
        });
        expect(sections[3]).toStrictEqual({
          sectionId: 'stack',
          sectionLinks: ['license_management'],
        });
      });
    });
  }
);
