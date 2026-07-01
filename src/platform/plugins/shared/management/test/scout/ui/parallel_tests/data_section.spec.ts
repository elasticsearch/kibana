/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Stack Management sidebar — data section visibility driven by ES cluster privileges.

import { expect } from '@kbn/scout/ui';
import { tags } from '@kbn/scout';
import { test, CUSTOM_ROLES } from '../fixtures';

test.describe('Stack Management — data section', { tag: tags.stateful.classic }, () => {
  test('transform_user sees only transform in the data section', async ({
    browserAuth,
    pageObjects,
  }) => {
    await browserAuth.loginWithCustomRole(CUSTOM_ROLES.dashboard_read_and_transform_user);

    await test.step('navigate to management and assert nav link + sidebar', async () => {
      await pageObjects.management.goto();
      const navLinks = await pageObjects.collapsibleNav.getNavLinks();
      expect(navLinks).toContain('Stack Management');

      const sections = await pageObjects.management.readSidebarSections();
      // kibana section with 'settings' appears because advancedSettings:read is granted
      expect(sections).toHaveLength(2);
      expect(sections[0]).toStrictEqual({
        sectionId: 'data',
        sectionLinks: ['transform'],
      });
      expect(sections[1]).toStrictEqual({
        sectionId: 'kibana',
        sectionLinks: ['settings'],
      });
    });
  });

  test('manage_ilm sees index_lifecycle_management in the data section', async ({
    browserAuth,
    pageObjects,
  }) => {
    await browserAuth.loginWithCustomRole(CUSTOM_ROLES.dashboard_read_and_manage_ilm);

    await test.step('navigate to management and assert nav link + sidebar', async () => {
      await pageObjects.management.goto();
      const navLinks = await pageObjects.collapsibleNav.getNavLinks();
      expect(navLinks).toContain('Stack Management');

      const sections = await pageObjects.management.readSidebarSections();
      // kibana section with 'settings' appears because advancedSettings:read is granted
      expect(sections).toHaveLength(2);
      expect(sections[0]).toStrictEqual({
        sectionId: 'data',
        sectionLinks: ['index_lifecycle_management'],
      });
      expect(sections[1]).toStrictEqual({
        sectionId: 'kibana',
        sectionLinks: ['settings'],
      });
    });
  });

  test('ccr_user sees cross_cluster_replication and the full cluster:manage data section', async ({
    browserAuth,
    pageObjects,
  }) => {
    await browserAuth.loginWithCustomRole(CUSTOM_ROLES.dashboard_read_and_ccr_user);

    await test.step('navigate to management and assert nav link + sidebar', async () => {
      await pageObjects.management.goto();
      const navLinks = await pageObjects.collapsibleNav.getNavLinks();
      expect(navLinks).toContain('Stack Management');

      const sections = await pageObjects.management.readSidebarSections();
      // cluster:manage also surfaces ingest (ingest_pipelines + logstash pipelines) and stack (license_management)
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
          'cross_cluster_replication',
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

  test('index_management_user sees index_management and transform in the data section', async ({
    browserAuth,
    pageObjects,
  }) => {
    await browserAuth.loginWithCustomRole(CUSTOM_ROLES.dashboard_read_and_index_management);

    await test.step('navigate to management and assert nav link + sidebar', async () => {
      await pageObjects.management.goto();
      const navLinks = await pageObjects.collapsibleNav.getNavLinks();
      expect(navLinks).toContain('Stack Management');

      const sections = await pageObjects.management.readSidebarSections();
      expect(sections).toHaveLength(2);
      expect(sections[0]).toStrictEqual({
        sectionId: 'data',
        sectionLinks: ['index_management', 'transform'],
      });
    });
  });
});
