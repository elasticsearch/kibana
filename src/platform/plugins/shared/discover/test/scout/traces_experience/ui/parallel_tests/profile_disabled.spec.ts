/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SpaceSolutionView } from '@kbn/scout';
import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import {
  spaceTest,
  TRACES,
  setupTracesExperience,
  teardownTracesExperience,
  expectTracesExperienceEnabled,
} from '../fixtures';

const NON_OBLT_VIEWS: Array<{ name: string; solutionView: SpaceSolutionView }> = [
  { name: 'Search', solutionView: 'es' },
  { name: 'Security', solutionView: 'security' },
];

spaceTest.describe(
  'Traces in Discover - Profile gated by solution view',
  {
    tag: tags.stateful.all,
  },
  () => {
    spaceTest.beforeAll(async ({ scoutSpace, config }) => {
      await setupTracesExperience(scoutSpace, config);
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await teardownTracesExperience(scoutSpace);
    });

    spaceTest(
      'should display trace-specific columns in data view mode (Classic)',
      async ({ scoutSpace, browserAuth, pageObjects }) => {
        await scoutSpace.setSolutionView('classic');
        await browserAuth.loginAsViewer();
        await pageObjects.discover.goto({ queryMode: 'classic' });

        await spaceTest.step('verify trace-specific columns are present', async () => {
          await expectTracesExperienceEnabled(pageObjects, false);
        });
      }
    );

    spaceTest(
      'should render RED metrics charts in ESQL mode (Classic)',
      async ({ scoutSpace, browserAuth, pageObjects }) => {
        await scoutSpace.setSolutionView('classic');
        await browserAuth.loginAsViewer();
        await pageObjects.discover.goto({ queryMode: 'esql' });

        await spaceTest.step('run ESQL query for traces', async () => {
          await pageObjects.discover.writeAndSubmitEsqlQuery(TRACES.ESQL_QUERY);
        });

        await spaceTest.step('verify RED metrics grid is visible', async () => {
          await expectTracesExperienceEnabled(pageObjects);
        });
      }
    );

    spaceTest(
      'should show Overview tab in document flyout (Classic)',
      async ({ scoutSpace, browserAuth, pageObjects }) => {
        await scoutSpace.setSolutionView('classic');
        await browserAuth.loginAsViewer();
        await pageObjects.discover.goto({ queryMode: 'classic' });

        await spaceTest.step('open first document in flyout', async () => {
          await pageObjects.tracesExperience.openDocumentFlyout();
        });

        await spaceTest.step('verify Overview tab is present', async () => {
          await expect(pageObjects.tracesExperience.flyout.overviewTab).toBeVisible();
        });
      }
    );

    for (const { name, solutionView } of NON_OBLT_VIEWS) {
      spaceTest(
        `should not display trace-specific columns in data view mode (${name})`,
        async ({ scoutSpace, browserAuth, pageObjects }) => {
          await scoutSpace.setSolutionView(solutionView);
          await browserAuth.loginAsViewer();
          await pageObjects.discover.goto({ queryMode: 'classic' });

          await spaceTest.step('wait for results to load', async () => {
            await pageObjects.dataGrid.waitForDocTableRendered();
          });

          await spaceTest.step('verify trace-specific columns are not present', async () => {
            for (const column of pageObjects.tracesExperience.grid.profileSpecificColumns) {
              await expect(pageObjects.dataGrid.getColumnHeader(column)).toBeHidden();
            }
          });
        }
      );

      spaceTest(
        `should not render RED metrics charts in ESQL mode (${name})`,
        async ({ scoutSpace, browserAuth, pageObjects }) => {
          await scoutSpace.setSolutionView(solutionView);
          await browserAuth.loginAsViewer();
          await pageObjects.discover.goto({ queryMode: 'esql' });

          await spaceTest.step('run ESQL query for traces', async () => {
            await pageObjects.discover.writeAndSubmitEsqlQuery(TRACES.ESQL_QUERY);
          });

          await spaceTest.step('verify RED metrics grid is not visible', async () => {
            await expect(pageObjects.tracesExperience.charts.redMetricsCharts).toBeHidden();
          });
        }
      );

      spaceTest(
        `should not show Overview tab in document flyout (${name})`,
        async ({ scoutSpace, browserAuth, pageObjects }) => {
          await scoutSpace.setSolutionView(solutionView);
          await browserAuth.loginAsViewer();
          await pageObjects.discover.goto({ queryMode: 'classic' });

          await spaceTest.step('open first document in flyout', async () => {
            await pageObjects.tracesExperience.openDocumentFlyout();
          });

          await spaceTest.step('verify Overview tab is not present', async () => {
            await expect(pageObjects.tracesExperience.flyout.overviewTab).toBeHidden();
          });
        }
      );
    }
  }
);
