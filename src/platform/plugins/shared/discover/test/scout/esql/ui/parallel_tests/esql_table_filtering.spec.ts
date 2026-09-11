/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { expect } from '@kbn/scout/ui';
import { spaceTest, tags } from '../fixtures';

const STATS_QUERY =
  'from logstash-* | sort @timestamp desc | limit 10000 | stats countB = count(bytes) by geo.dest | sort countB';

spaceTest.describe(
  'Discover ES|QL filtering from the table',
  { tag: tags.deploymentAgnostic },
  () => {
    spaceTest.beforeAll(async ({ discoverScoutSpace }) => {
      await discoverScoutSpace.setupDiscoverDefaults();
    });

    spaceTest.beforeEach(async ({ browserAuth, pageObjects }) => {
      await browserAuth.loginAsPrivilegedUser();
      await pageObjects.discover.goto({ queryMode: 'esql' });
      await pageObjects.discover.waitUntilTabIsLoaded();
    });

    spaceTest.afterAll(async ({ discoverScoutSpace }) => {
      await discoverScoutSpace.teardownDiscoverDefaults();
    });

    spaceTest(
      'appends a WHERE clause from the filter-for and filter-out cell actions',
      async ({ pageObjects }) => {
        const { discover, dataGrid } = pageObjects;

        await discover.writeAndSubmitEsqlQuery(STATS_QUERY);
        // `STATS ... BY` lands in the cascade layout; the cell actions need the flat table.
        await discover.optOutOfCascadeLayout();
        await dataGrid.waitForDocTableRendered();

        await dataGrid.filterCell({ rowIndex: 0, columnId: 'geo.dest', mode: 'for' });
        expect(await discover.getEsqlQueryValue()).toContain('| WHERE `geo.dest` == "BT"');

        await dataGrid.waitForDocTableRendered();

        // Negating replaces the clause rather than appending a second one.
        await dataGrid.filterCell({ rowIndex: 0, columnId: 'geo.dest', mode: 'out' });
        const negated = await discover.getEsqlQueryValue();
        expect(negated).toContain('| WHERE `geo.dest`!= "BT"');
        expect(negated).not.toContain('== "BT"');
      }
    );

    spaceTest(
      'appends an AND clause when the query already has a WHERE',
      async ({ pageObjects }) => {
        const { discover, dataGrid } = pageObjects;

        await discover.writeAndSubmitEsqlQuery(`${STATS_QUERY} | where countB > 0`);
        await discover.optOutOfCascadeLayout();
        await dataGrid.waitForDocTableRendered();

        await dataGrid.filterCell({ rowIndex: 0, columnId: 'geo.dest', mode: 'for' });
        expect(await discover.getEsqlQueryValue()).toContain('AND `geo.dest` == "BT"');
      }
    );

    spaceTest(
      'keeps the visualization type and colour when appending a filter',
      async ({ pageObjects }) => {
        const { discover, dataGrid, lens } = pageObjects;

        await discover.writeAndSubmitEsqlQuery(STATS_QUERY);
        await discover.optOutOfCascadeLayout();
        await dataGrid.waitForDocTableRendered();

        await discover.openLensEditFlyout();
        await lens.switchToVisualization('line');

        await lens.openXYDimensionEditor();
        await lens.dimensionColorPicker.fill('#ff0000');
        // Committing the value rather than sleeping for the debounce.
        await expect(lens.dimensionColorPicker).toHaveValue('#FF0000');
        await lens.closeDimensionEditor();
        await lens.applyFlyoutChanges();

        await dataGrid.filterCell({ rowIndex: 0, columnId: 'geo.dest', mode: 'for' });
        expect(await discover.getEsqlQueryValue()).toContain('| WHERE `geo.dest` == "BT"');

        await discover.openLensEditFlyout();
        expect(await lens.getChartSwitchType()).toBe('Line');

        await lens.openXYDimensionEditor();
        await expect(lens.dimensionColorPicker).toHaveValue('#FF0000');

        // Close the flyout rather than ending the test on open, dirty editor state.
        // The dimension editor has to go first: opening one sets the flyout's
        // `isInlineFlyoutVisible` to false, which unmounts the footer holding the
        // cancel button, so cancelling while it is open waits on an element the
        // product never renders.
        await lens.closeDimensionEditor();
        await lens.cancelFlyoutChanges();
      }
    );
  }
);
