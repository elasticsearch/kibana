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

export const ARTIFACT_TAB_POLICY_DETAILS_TAGS = [
  ...tags.stateful.classic,
  ...tags.serverless.security.complete,
];

/**
 * Local only. New deployments auto-opt-in (`reason: 'newDeployment'`). Cypress
 * resets via a system-index DELETE of the reference-data doc, which is not
 * MKI-safe, and the opt-in POST is an internal route. Keep EE off cloud/MKI
 * until there is a supported revert.
 */
export const ARTIFACT_TAB_POLICY_DETAILS_LOCAL_TAGS = ARTIFACT_TAB_POLICY_DETAILS_TAGS.filter(
  (tag) => tag.startsWith('@local-')
);

const STATEFUL_ONLY_REASON =
  'There is no serverless role that can read a policy without the matching artifact privilege';

/**
 * One file per artifact type so Playwright can run files in parallel. Each
 * file owns a single agnostic list id (spaces do not isolate those lists).
 * Policy-tab ALL/READ/NONE and list-page RBAC stay in the same file so they
 * cannot race on that list.
 */
export const describeArtifactTabPolicyDetails = (
  artifact: ArtifactTabCase,
  options?: { tag?: string[] }
): void => {
  spaceTest.describe(
    `Artifact tabs in Policy Details page — ${artifact.title}`,
    { tag: options?.tag ?? ARTIFACT_TAB_POLICY_DETAILS_TAGS },
    () => {
      spaceTest.beforeAll(async ({ apiServices }) => {
        // Agnostic opt-in SO. This file is the only consumer; local tags keep it off MKI.
        if (artifact.kind === 'endpointExceptions') {
          await apiServices.endpointArtifacts.optInEndpointExceptionsPerPolicy();
        }
        await apiServices.endpointArtifacts.deleteList(artifact.listId);
      });

      spaceTest.afterEach(async ({ apiServices }) => {
        await apiServices.endpointArtifacts.deleteList(artifact.listId);
      });

      spaceTest(
        `Tab is hidden when the user has no artifact privilege`,
        async ({ browserAuth, pageObjects, endpointPolicy, config }) => {
          spaceTest.skip(Boolean(config.serverless), STATEFUL_ONLY_REASON);

          await browserAuth.loginWithCustomRole(getArtifactRole(artifact.privilegePrefix, 'none'));
          await pageObjects.policyDetailsPage.goto(endpointPolicy.id);

          await expect(pageObjects.policyDetailsPage.artifactTab(artifact.tabTestSubj)).toHaveCount(
            0
          );
        }
      );

      spaceTest(
        `READ user can view artifacts but cannot add, assign, or remove`,
        async ({ browserAuth, pageObjects, apiServices, endpointPolicy, config }) => {
          spaceTest.skip(Boolean(config.serverless), STATEFUL_ONLY_REASON);
          // One login plus two policy-details reloads; default 60s is tight.
          spaceTest.setTimeout(90_000);

          await browserAuth.loginWithCustomRole(getArtifactRole(artifact.privilegePrefix, 'read'));
          await pageObjects.policyDetailsPage.goto(endpointPolicy.id);

          const openTab = async () => {
            await pageObjects.policyDetailsPage.openArtifactTab(artifact.tabTestSubj);
          };

          await spaceTest.step('cannot add an artifact from an empty tab', async () => {
            await openTab();
            await pageObjects.policyArtifactsPage.waitForEmptyUnexisting();
            await expect(pageObjects.policyArtifactsPage.unexistingManageButton).toHaveCount(0);
            await expect(pageObjects.policyArtifactsPage.unexistingImportButton).toHaveCount(0);
          });

          await spaceTest.step('cannot manage or assign unassigned artifacts', async () => {
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
            await pageObjects.policyDetailsPage.reload();
            await openTab();
            await pageObjects.policyArtifactsPage.waitForEmptyUnassigned();
            await expect(pageObjects.policyArtifactsPage.unassignedManageButton).toHaveCount(0);
            await expect(pageObjects.policyArtifactsPage.unassignedAssignButton).toHaveCount(0);
          });

          await spaceTest.step(
            'can see assigned artifacts but cannot assign or remove',
            async () => {
              await apiServices.endpointArtifacts.deleteList(artifact.listId);
              await apiServices.endpointArtifacts.createList({
                listId: artifact.listId,
                type: artifact.listType,
              });
              await apiServices.endpointArtifacts.createItem({
                name: artifact.artifactName,
                listId: artifact.listId,
                entries: artifact.entries,
                osTypes: artifact.osTypes,
                policyId: endpointPolicy.id,
              });
              await pageObjects.policyDetailsPage.reload();
              await openTab();
              await pageObjects.policyArtifactsPage.waitForAssignedList();

              await expect(pageObjects.policyArtifactsPage.artifactCard).toHaveCount(1);
              await expect(pageObjects.policyArtifactsPage.artifactCardTitle).toContainText(
                artifact.artifactName
              );
              await expect(pageObjects.policyArtifactsPage.assignButton).toHaveCount(0);

              await pageObjects.policyArtifactsPage.openCardActions();
              await expect(pageObjects.policyArtifactsPage.viewFullDetailsAction).toBeVisible();
              await expect(pageObjects.policyArtifactsPage.removeFromPolicyAction).toHaveCount(0);
            }
          );
        }
      );

      spaceTest(
        `ALL user can add an artifact from an empty tab`,
        async ({ browserAuth, pageObjects, endpointPolicy }) => {
          await browserAuth.loginAsSecurityRole('endpoint_policy_manager');
          await pageObjects.policyDetailsPage.goto(endpointPolicy.id);
          await pageObjects.policyDetailsPage.openArtifactTab(artifact.tabTestSubj);
          await pageObjects.policyArtifactsPage.waitForEmptyUnexisting();

          await expect(pageObjects.policyArtifactsPage.unexistingImportButton).toBeVisible();

          await spaceTest.step('create a per-policy artifact from the empty tab', async () => {
            await pageObjects.policyArtifactsPage.openCreateFromEmptyTab();
            await pageObjects.policyArtifactsPage.fillCreateForm(artifact.kind);
            await pageObjects.policyArtifactsPage.selectPerPolicyAssignment();
            await pageObjects.policyArtifactsPage.submitCreateForm(artifact.pagePrefix);
            await expect(
              pageObjects.policyArtifactsPage.criteria(artifact.createCriteria.selector)
            ).toHaveText(artifact.createCriteria.value);
          });

          await spaceTest.step(
            'back link returns to policy details and the next tab is reachable',
            async () => {
              await expect(pageObjects.policyDetailsPage.pageContainer).toHaveCount(0);
              await expect(pageObjects.policyDetailsPage.backToOrigin).toHaveText(
                `Back to ${endpointPolicy.name} policy`
              );
              await pageObjects.policyDetailsPage.clickBackToOrigin();
              await pageObjects.policyDetailsPage.openArtifactTab(artifact.nextTabTestSubj);
              await pageObjects.policyDetailsPage.waitForPolicyDetailsVisible();
            }
          );
        }
      );

      spaceTest(
        `ALL user can manage and assign unassigned artifacts`,
        async ({ browserAuth, page, pageObjects, apiServices, endpointPolicy }) => {
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
          await browserAuth.loginAsSecurityRole('endpoint_policy_manager');
          await pageObjects.policyDetailsPage.goto(endpointPolicy.id);
          await pageObjects.policyDetailsPage.openArtifactTab(artifact.tabTestSubj);
          await pageObjects.policyArtifactsPage.waitForEmptyUnassigned();

          await spaceTest.step('manage artifacts and return to the policy tab', async () => {
            await pageObjects.policyArtifactsPage.openManageFromUnassigned();
            await expect(page).toHaveURL(
              new RegExp(`/app/security/administration/${artifact.urlPath}(?:\\?|#|$)`)
            );
            await pageObjects.policyDetailsPage.clickBackToOrigin();
          });

          await spaceTest.step('assign the unassigned artifact to the policy', async () => {
            await pageObjects.policyArtifactsPage.openAssignFromUnassigned();
            await expect(pageObjects.policyArtifactsPage.assignConfirmButton).toBeDisabled();
            await pageObjects.policyArtifactsPage.assignArtifact(artifact.artifactName);
            // Each type uses a different sentence; the quoted name is shared.
            // Scope to the toast list so this cannot match the assigned card.
            await pageObjects.toasts.waitForToastWithText(`"${artifact.artifactName}"`);
            await pageObjects.policyArtifactsPage.waitForAssignedList();
            await expect(pageObjects.policyArtifactsPage.artifactCard).toHaveCount(1);
          });
        }
      );

      spaceTest(
        `ALL user can assign and remove artifacts from the policy`,
        async ({ browserAuth, pageObjects, apiServices, endpointPolicy }) => {
          await apiServices.endpointArtifacts.createList({
            listId: artifact.listId,
            type: artifact.listType,
          });
          await apiServices.endpointArtifacts.createItem({
            name: artifact.artifactName,
            listId: artifact.listId,
            entries: artifact.entries,
            osTypes: artifact.osTypes,
            policyId: endpointPolicy.id,
          });
          await browserAuth.loginAsSecurityRole('endpoint_policy_manager');
          await pageObjects.policyDetailsPage.goto(endpointPolicy.id);
          await pageObjects.policyDetailsPage.openArtifactTab(artifact.tabTestSubj);
          await pageObjects.policyArtifactsPage.waitForAssignedList();

          await expect(pageObjects.policyArtifactsPage.artifactCard).toHaveCount(1);
          await expect(pageObjects.policyArtifactsPage.artifactCardTitle).toContainText(
            artifact.artifactName
          );

          await spaceTest.step('assign flyout opens from the assigned list', async () => {
            await pageObjects.policyArtifactsPage.openAssignFlyout();
            await pageObjects.policyArtifactsPage.cancelAssignFlyout();
          });

          await spaceTest.step('remove the artifact from the policy', async () => {
            await pageObjects.policyArtifactsPage.removeAssignedArtifactFromPolicy();
            await pageObjects.toasts.waitForToastWithText('Successfully removed');
          });
        }
      );
    }
  );
};
