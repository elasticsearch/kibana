/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-security/ui';
import { spaceTest, tags } from '.';
import type { ArtifactTabCase } from './artifact_tabs_test_data';
import { getArtifactRole } from './roles';

export const ARTIFACT_LIST_PAGE_TAGS = [
  ...tags.stateful.classic,
  ...tags.serverless.security.complete,
];

const STATEFUL_ONLY_REASON =
  'There is no serverless role that can read artifacts without write privilege';

/**
 * Administration list-page RBAC for one artifact type. Call from the same
 * spec file that already owns that agnostic list id so WRITE create cannot
 * race NONE / READ empty-state assertions.
 *
 * Does not port the Cypress SIEM version matrix — that belongs in API
 * `role_migrations`. Field-operator form coverage stays in leftover
 * `*.cy.ts` list CRUD specs until those migrate.
 */
export const describeArtifactListPage = (
  artifact: ArtifactTabCase,
  options?: { tag?: string[] }
): void => {
  const { pagePrefix } = artifact;
  const editedName = `${artifact.artifactName} edited`;
  const editedDescription = 'Edited description';

  spaceTest.describe(
    `Artifact list page — ${artifact.title}`,
    { tag: options?.tag ?? ARTIFACT_LIST_PAGE_TAGS },
    () => {
      spaceTest.beforeAll(async ({ apiServices }) => {
        if (artifact.kind === 'endpointExceptions') {
          await apiServices.endpointArtifacts.optInEndpointExceptionsPerPolicy();
        }
        await apiServices.endpointArtifacts.deleteList(artifact.listId);
      });

      spaceTest.afterEach(async ({ apiServices }) => {
        await apiServices.endpointArtifacts.deleteList(artifact.listId);
      });

      spaceTest(
        `T1 analyst sees no privileges on the list page`,
        async ({ browserAuth, pageObjects }) => {
          await browserAuth.loginAsT1Analyst();

          await pageObjects.artifactListPage.goto(artifact.urlPath);
          await pageObjects.artifactListPage.waitForNoPrivileges();

          await expect(pageObjects.artifactListPage.noPrivilegesPage).toBeVisible();
          await expect(pageObjects.artifactListPage.emptyPageFeatureAction).toBeVisible();
          await expect(pageObjects.artifactListPage.emptyState(pagePrefix)).toHaveCount(0);
          await expect(pageObjects.artifactListPage.emptyStateAddButton(pagePrefix)).toHaveCount(0);
        }
      );

      spaceTest(
        `READ user sees empty state without add`,
        async ({ browserAuth, pageObjects, config }) => {
          spaceTest.skip(Boolean(config.serverless), STATEFUL_ONLY_REASON);

          await browserAuth.loginWithCustomRole(getArtifactRole(artifact.privilegePrefix, 'read'));
          await pageObjects.artifactListPage.goto(artifact.urlPath);
          await pageObjects.artifactListPage.waitForEmpty(pagePrefix);

          await expect(pageObjects.artifactListPage.emptyState(pagePrefix)).toBeVisible();
          await expect(pageObjects.artifactListPage.emptyStateAddButton(pagePrefix)).toHaveCount(0);
        }
      );

      spaceTest(
        `READ user can view artifacts but cannot add, edit, or delete`,
        async ({ browserAuth, pageObjects, apiServices, config }) => {
          spaceTest.skip(Boolean(config.serverless), STATEFUL_ONLY_REASON);

          await apiServices.endpointArtifacts.createList({
            listId: artifact.listId,
            type: artifact.listType,
          });
          await apiServices.endpointArtifacts.createItem({
            name: artifact.artifactName,
            listId: artifact.listId,
            entries: artifact.entries,
            osTypes: artifact.osTypes,
          });

          await browserAuth.loginWithCustomRole(getArtifactRole(artifact.privilegePrefix, 'read'));
          await pageObjects.artifactListPage.goto(artifact.urlPath);
          await pageObjects.artifactListPage.waitForList(pagePrefix);

          await expect(pageObjects.artifactListPage.cardTitle(pagePrefix)).toContainText(
            artifact.artifactName
          );
          await expect(pageObjects.artifactListPage.pageAddButton(pagePrefix)).toHaveCount(0);
          await expect(pageObjects.artifactListPage.cardActionsButton(pagePrefix)).toHaveCount(0);
          await expect(pageObjects.artifactListPage.cardEditAction(pagePrefix)).toHaveCount(0);
          await expect(pageObjects.artifactListPage.cardDeleteAction(pagePrefix)).toHaveCount(0);
        }
      );

      spaceTest(
        `WRITE user can create, update, and delete`,
        async ({ browserAuth, pageObjects }) => {
          // Create form + edit + delete; default 60s is tight after a role login.
          spaceTest.setTimeout(120_000);

          await browserAuth.loginAsSecurityRole('endpoint_policy_manager');
          await pageObjects.artifactListPage.goto(artifact.urlPath);
          await pageObjects.artifactListPage.waitForEmpty(pagePrefix);

          await spaceTest.step('empty state shows add', async () => {
            await expect(pageObjects.artifactListPage.emptyState(pagePrefix)).toBeVisible();
            await expect(
              pageObjects.artifactListPage.emptyStateAddButton(pagePrefix)
            ).toBeVisible();
          });

          await spaceTest.step('create from the empty state', async () => {
            await pageObjects.artifactListPage.openCreateFromEmpty(pagePrefix);
            await pageObjects.policyArtifactsPage.fillCreateForm(artifact.kind);
            await pageObjects.artifactListPage.submitFlyout(pagePrefix);
            await expect(
              pageObjects.artifactListPage.criteria(artifact.createCriteria.selector)
            ).toHaveText(artifact.createCriteria.value);
            await expect(pageObjects.artifactListPage.cardTitle(pagePrefix)).toContainText(
              artifact.artifactName
            );
            await pageObjects.toasts.dismissAll();
          });

          await spaceTest.step('update name and description', async () => {
            await pageObjects.artifactListPage.openEdit(pagePrefix);
            await pageObjects.artifactListPage.fillTextField(artifact.formNameInput, editedName);
            await pageObjects.artifactListPage.fillTextField(
              artifact.formDescriptionInput,
              editedDescription
            );
            await pageObjects.artifactListPage.submitFlyout(pagePrefix);
            await expect(pageObjects.artifactListPage.cardTitle(pagePrefix)).toContainText(
              editedName
            );
            await expect(pageObjects.artifactListPage.cardDescription(pagePrefix)).toHaveText(
              editedDescription
            );
            await pageObjects.toasts.dismissAll();
          });

          await spaceTest.step('delete the artifact', async () => {
            await pageObjects.artifactListPage.deleteArtifact(pagePrefix);
            await expect(pageObjects.artifactListPage.card(pagePrefix)).toHaveCount(0);
            await expect(pageObjects.artifactListPage.emptyState(pagePrefix)).toBeVisible();
          });
        }
      );
    }
  );
};
