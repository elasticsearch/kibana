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
  setupTracesExperience,
  teardownTracesExperience,
} from '../../fixtures/traces_experience';
import type { TracesFlyout } from '../../fixtures/traces_experience/page_objects/flyout';

type DiscoverPage = PageObjects['discover'];

const openTraceTimeline = async (pageObjects: {
  discover: DiscoverPage;
  tracesExperience: {
    openOverviewTab: () => Promise<void>;
    flyout: TracesFlyout;
  };
}) => {
  await pageObjects.discover.goto({ queryMode: 'esql' });
  await pageObjects.discover.writeAndSubmitEsqlQuery(
    `${TRACES.ESQL_QUERY} | WHERE transaction.name == "${RICH_TRACE.TRANSACTION_NAME}"`
  );
  await pageObjects.tracesExperience.openOverviewTab();
  const { flyout } = pageObjects.tracesExperience;
  await flyout.traceSummary.fullScreenButton.click();
  await expect(flyout.waterfallFlyout.container).toBeVisible();
};

spaceTest.describe(
  'Traces in Discover - Logs overview tab',
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

    spaceTest(
      'Similar errors - occurrences chart renders without error in the log child flyout',
      async ({ pageObjects }) => {
        const { flyout } = pageObjects.tracesExperience;

        await spaceTest.step('open the trace timeline', async () => {
          await openTraceTimeline(pageObjects);
        });

        await spaceTest.step(
          'click the error badge on the DB span to open the log flyout',
          async () => {
            const { errorBadge } = flyout.waterfallFlyout.getWaterfallItem(RICH_TRACE.DB_SPAN_NAME);
            await errorBadge.click();
          }
        );

        await spaceTest.step('occurrences chart renders without an error callout', async () => {
          await expect(
            flyout.waterfallFlyout.childDocFlyout.similarErrors.occurrencesChart
          ).toBeVisible();
          await expect(
            flyout.waterfallFlyout.childDocFlyout.similarErrors.errorCallout
          ).toBeHidden();
        });
      }
    );
  }
);
