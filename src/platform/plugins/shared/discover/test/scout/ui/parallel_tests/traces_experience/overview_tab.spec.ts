/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import type { PageObjects } from '@kbn/scout';
import {
  spaceTest,
  TRACES,
  RICH_TRACE,
  MINIMAL_TRACE,
  setupTracesExperience,
  teardownTracesExperience,
} from '../../fixtures/traces_experience';

type DiscoverPage = PageObjects['discover'];

const queryModes = [
  {
    name: 'Classic',
    value: 'classic' as const,
    filterMinimal: (discover: DiscoverPage) =>
      discover.writeAndSubmitKqlQuery(`transaction.name: "${MINIMAL_TRACE.TRANSACTION_NAME}"`),
    filterRichSpan: (discover: DiscoverPage) =>
      discover.writeAndSubmitKqlQuery(`span.name: "${RICH_TRACE.INTERNAL_SPAN_NAME}"`),
  },
  {
    name: 'ES|QL',
    value: 'esql' as const,
    filterMinimal: (discover: DiscoverPage) =>
      discover.writeAndSubmitEsqlQuery(
        `${TRACES.ESQL_QUERY} | WHERE transaction.name == "${MINIMAL_TRACE.TRANSACTION_NAME}"`
      ),
    filterRichSpan: (discover: DiscoverPage) =>
      discover.writeAndSubmitEsqlQuery(
        `${TRACES.ESQL_QUERY} | WHERE span.name == "${RICH_TRACE.INTERNAL_SPAN_NAME}"`
      ),
  },
];

spaceTest.describe(
  'Traces in Discover - Overview tab',
  {
    tag: [...tags.stateful.all, ...tags.serverless.observability.complete],
  },
  () => {
    spaceTest.beforeAll(async ({ scoutSpace, config }) => {
      await setupTracesExperience(scoutSpace, config);
    });

    spaceTest.beforeEach(async ({ browserAuth }) => {
      await browserAuth.loginAsViewer();
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await teardownTracesExperience(scoutSpace);
    });

    for (const mode of queryModes) {
      spaceTest(
        `${mode.name} mode - should render always-visible sections and hide conditional ones for a minimal document`,
        async ({ pageObjects }) => {
          await pageObjects.discover.goto({ queryMode: mode.value });

          await spaceTest.step(`${mode.name} mode - filter for minimal trace`, async () => {
            await mode.filterMinimal(pageObjects.discover);
          });

          await spaceTest.step('open Overview tab', async () => {
            await pageObjects.tracesExperience.openOverviewTab();
          });

          await spaceTest.step('verify About section is visible', async () => {
            await expect(pageObjects.tracesExperience.flyout.about.section).toBeVisible();
          });

          await spaceTest.step('verify Similar Spans section is visible', async () => {
            await expect(pageObjects.tracesExperience.flyout.similarSpans.section).toBeVisible();
          });

          await spaceTest.step('verify Trace Summary section is visible', async () => {
            await expect(pageObjects.tracesExperience.flyout.traceSummary.section).toBeVisible();
          });

          await spaceTest.step('verify Logs section is visible', async () => {
            await expect(pageObjects.tracesExperience.flyout.logs.section).toBeVisible();
          });

          await spaceTest.step('verify Errors section is hidden', async () => {
            await expect(pageObjects.tracesExperience.flyout.errors.section).toBeHidden();
          });

          await spaceTest.step('verify Span Links section is hidden', async () => {
            await expect(pageObjects.tracesExperience.flyout.spanLinks.section).toBeHidden();
          });
        }
      );

      spaceTest(
        `${mode.name} mode - should render conditional sections for a document with errors and span links`,
        async ({ pageObjects }) => {
          await pageObjects.discover.goto({ queryMode: mode.value });

          await spaceTest.step(
            `${mode.name} mode - filter for span with errors and span links`,
            async () => {
              await mode.filterRichSpan(pageObjects.discover);
            }
          );

          await spaceTest.step('open Overview tab', async () => {
            await pageObjects.tracesExperience.openOverviewTab();
          });

          await spaceTest.step('verify Errors section is visible', async () => {
            await expect(pageObjects.tracesExperience.flyout.errors.section).toBeVisible();
          });

          await spaceTest.step('verify Span Links section is visible', async () => {
            await expect(pageObjects.tracesExperience.flyout.spanLinks.section).toBeVisible();
          });
        }
      );
    }

    spaceTest(
      'ES|QL mode only - logs section shows only logs correlated to the opened trace',
      async ({ pageObjects }) => {
        const { flyout } = pageObjects.tracesExperience;

        await pageObjects.discover.goto({ queryMode: 'esql' });

        await spaceTest.step('filter for minimal trace transaction', async () => {
          await pageObjects.discover.writeAndSubmitEsqlQuery(
            `${TRACES.ESQL_QUERY} | WHERE transaction.name == "${MINIMAL_TRACE.TRANSACTION_NAME}"`
          );
        });

        await spaceTest.step('open Overview tab', async () => {
          await pageObjects.tracesExperience.openOverviewTab();
        });

        await spaceTest.step('expand the Logs section', async () => {
          await flyout.logs.section.click();
        });

        await spaceTest.step(
          'logs count reflects only this trace — not all logs in the index',
          async () => {
            await expect(flyout.logs.totalDocuments).toBeVisible();
            await expect(flyout.logs.totalDocuments).toHaveText('2');
          }
        );
      }
    );
  }
);
