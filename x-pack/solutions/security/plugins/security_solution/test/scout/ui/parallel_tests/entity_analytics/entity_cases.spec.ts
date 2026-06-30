/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Entity attachment cases E2E tests.
 *
 * PREREQUISITE — server must be started with the experimental feature flag enabled:
 *
 *   node scripts/kibana --dev \
 *     --xpack.securitySolution.enableExperimental='["entityAttachmentsEnabled"]'
 *
 * The entity store must also be running so that entities have a canonical `entity.id`
 * (entityStoreId). Without it the "Add to new/existing case" actions are hidden even
 * when the flag is on. Start the entity store via the Entity Analytics management page
 * or via:
 *
 *   curl -X POST 'http://localhost:5601/api/entity_store/enable' \
 *     -H 'kbn-xsrf: true' -H 'Content-Type: application/json' -d '{}'
 *
 * SKIPPED IN CI (intentionally): `entityAttachmentsEnabled` gates server-side
 * attachment-type registration in the plugin `setup` lifecycle (see
 * `server/cases/attachments/register.ts`), so it must be set at server boot and
 * cannot be enabled at runtime via Scout's `apiServices.core.settings()`. Running
 * this suite in CI requires a dedicated custom server config set (boot-time
 * `serverArgs`) plus the entity store running — tracked in
 * https://github.com/elastic/security-team/issues/17889 and must land before
 * `entityAttachmentsEnabled` defaults on. Until then the core logic is covered by
 * unit/integration tests (attachments service guard, server registration gating,
 * and metadata builder).
 *
 * To run them locally: remove the `.skip` from `spaceTest.describe.skip` below,
 * start the server with the flag above, and run:
 *
 *   node scripts/scout.js run-tests --arch stateful --domain classic \
 *     --testFiles x-pack/solutions/security/plugins/security_solution/test/scout/ui/parallel_tests/entity_analytics/entity_cases.spec.ts
 */

import { expect } from '@kbn/scout-security/ui';
import { CUSTOM_QUERY_RULE } from '@kbn/scout-security/src/playwright/constants/detection_rules';
import { SECURITY_ENTITY_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import { spaceTest, tags } from '../../fixtures';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CASE_DEFAULTS = {
  connector: { id: 'none', name: 'none', type: '.none', fields: null },
  settings: { syncAlerts: false, extractObservables: false },
  owner: 'securitySolution',
} as const;

// ── Test suite ────────────────────────────────────────────────────────────────

const ALERT_RULE: typeof CUSTOM_QUERY_RULE = {
  ...CUSTOM_QUERY_RULE,
  name: 'Entity Cases E2E Rule',
  query: 'host.name:* or user.name:*',
  rule_id: 'entity-cases-e2e-rule',
};

/*
 * Skipped in CI pending a custom server config set that enables
 * `entityAttachmentsEnabled` at boot — see file-level JSDoc and
 * https://github.com/elastic/security-team/issues/17889. To run locally, remove
 * `.skip` and start the server with the flag.
 */
// eslint-disable-next-line playwright/no-skipped-test
spaceTest.describe.skip(
  'Entity attachment cases – flyout add-to-case actions and Entities tab',
  { tag: [...tags.stateful.classic] },
  () => {
    spaceTest.beforeEach(async ({ browserAuth, apiServices, scoutSpace }) => {
      await apiServices.cases.cleanup.deleteAllCases(scoutSpace.id);
      await apiServices.detectionRule.deleteAll();

      await apiServices.detectionRule.createCustomQueryRule({
        ...ALERT_RULE,
        name: `${ALERT_RULE.name}_${scoutSpace.id}`,
      });

      await browserAuth.loginAsPlatformEngineer();
    });

    spaceTest.afterEach(async ({ apiServices, scoutSpace }) => {
      await apiServices.cases.cleanup.deleteAllCases(scoutSpace.id);
      await apiServices.detectionRule.deleteAll();
    });

    spaceTest(
      'adds a host entity to a new case and the Entities tab shows the attached entity',
      async ({ pageObjects, scoutSpace }) => {
        const { entityCases } = pageObjects;
        const caseName = `Scout entity case – host – ${scoutSpace.id}`;

        await spaceTest.step('open host flyout and click Add to new case', async () => {
          await entityCases.navigateToAlerts();
          await entityCases.openHostFlyoutForRule(`${ALERT_RULE.name}_${scoutSpace.id}`);
          await entityCases.openTakeActionMenu();
          await entityCases.clickAddToNewCase();
        });

        await spaceTest.step('create the case via the Cases flyout', async () => {
          await entityCases.fillCaseName(caseName);
          await entityCases.submitNewCase();
        });

        await spaceTest.step('navigate to the new case and check the Entities tab', async () => {
          await entityCases.clickCaseToastLink();

          await expect(entityCases.entitiesTab).toBeVisible();
          await entityCases.clickEntitiesTab();

          await expect(entityCases.entityTabTable).toBeVisible();
        });
      }
    );

    spaceTest(
      'Entities tab renders the entity table when attachments were added via API',
      async ({ pageObjects, scoutSpace, apiServices }) => {
        const { entityCases } = pageObjects;
        const { data: created } = await apiServices.cases.create(
          {
            title: `Scout entity case – API – ${scoutSpace.id}`,
            description: 'Created by Scout entity attachment test',
            tags: ['scout'],
            ...CASE_DEFAULTS,
          },
          scoutSpace.id
        );
        // Entity attachment is a unified type not present in the shared AttachmentRequest
        // union — double-assert to bridge the gap without widening to `any`.
        type CasesCommentParam = Parameters<typeof apiServices.cases.comments.create>[1];
        await apiServices.cases.comments.create(
          created.id,
          {
            type: SECURITY_ENTITY_ATTACHMENT_TYPE,
            attachmentId: 'test-entity-store-id',
            metadata: { entityName: 'scout-host', entityType: 'host' },
            owner: 'securitySolution',
          } as unknown as CasesCommentParam,
          scoutSpace.id
        );
        const caseId = created.id;

        await entityCases.navigateToCase(caseId);

        await expect(entityCases.entitiesTab).toBeVisible();
        await entityCases.clickEntitiesTab();

        await expect(entityCases.entityTabTable).toBeVisible();
      }
    );

    spaceTest(
      'Entities tab renders the empty state when a case has no entity attachments',
      async ({ pageObjects, scoutSpace, apiServices }) => {
        const { entityCases } = pageObjects;
        const { data: created } = await apiServices.cases.create(
          {
            title: `Scout entity case – empty – ${scoutSpace.id}`,
            description: 'No entity attachments',
            tags: [],
            ...CASE_DEFAULTS,
          },
          scoutSpace.id
        );
        const caseId = created.id;

        await entityCases.navigateToCase(caseId);

        await expect(entityCases.entitiesTab).toBeVisible();
        await entityCases.clickEntitiesTab();

        await expect(entityCases.entityTabEmpty).toBeVisible();
        await expect(entityCases.entityTabTable).toBeHidden();
      }
    );
  }
);
