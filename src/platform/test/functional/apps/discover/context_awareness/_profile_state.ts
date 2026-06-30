/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';
import kbnRison from '@kbn/rison';
import type { FtrProviderContext } from '../ftr_provider_context';

interface ModeDefinition {
  name: string;
  loadDefaultProfile: () => Promise<void>;
  switchToNoDefaultProfile: () => Promise<void>;
  switchToDefaultProfile: () => Promise<void>;
}

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { common, discover, unifiedFieldList, unifiedTabs } = getPageObjects([
    'common',
    'discover',
    'unifiedFieldList',
    'unifiedTabs',
  ]);
  const browser = getService('browser');
  const dataGrid = getService('dataGrid');
  const dataViews = getService('dataViews');
  const esql = getService('esql');
  const retry = getService('retry');
  const testSubjects = getService('testSubjects');
  const timestampColorSelectTestSubj = 'exampleProfileStateTimestampColorSelect';

  const expectRowHeight = async (expectedValue: string, expectedCustomHeight?: number) => {
    await discover.waitUntilTabIsLoaded();
    await dataGrid.clickGridSettings();

    try {
      await retry.try(async () => {
        expect(await dataGrid.getCurrentRowHeightValue()).to.be(expectedValue);

        if (expectedCustomHeight !== undefined) {
          expect(await dataGrid.getCustomRowHeightNumber()).to.be(expectedCustomHeight);
        }
      });
    } finally {
      await dataGrid.clickGridSettings();
    }
  };

  const changeRowHeight = async (nextValue: string, customHeight?: number) => {
    await discover.waitUntilTabIsLoaded();
    await dataGrid.clickGridSettings();

    try {
      await dataGrid.changeRowHeightValue(nextValue);

      if (customHeight !== undefined) {
        await dataGrid.changeCustomRowHeightNumber(customHeight);
      }

      await retry.try(async () => {
        expect(await dataGrid.getCurrentRowHeightValue()).to.be(nextValue);

        if (customHeight !== undefined) {
          expect(await dataGrid.getCustomRowHeightNumber()).to.be(customHeight);
        }
      });
    } finally {
      await dataGrid.clickGridSettings();
    }
  };

  const submitEsqlQuery = async (query: string) => {
    await esql.setEsqlEditorQuery(query);
    await esql.submitEsqlEditorQuery();
    await discover.waitUntilTabIsLoaded();
  };

  const getTimestampColor = async () => {
    return await testSubjects.getAttribute(timestampColorSelectTestSubj, 'value');
  };

  const expectTimestampColor = async (expectedValue: string) => {
    await retry.try(async () => {
      expect(await getTimestampColor()).to.be(expectedValue);
      expect(await testSubjects.getAttribute('exampleRootProfileTimestamp', 'data-color')).to.be(
        expectedValue
      );
    });
  };

  const changeTimestampColor = async (nextValue: string) => {
    await testSubjects.selectValue(timestampColorSelectTestSubj, nextValue);
    await expectTimestampColor(nextValue);
  };

  const modeDefinitions: ModeDefinition[] = [
    {
      name: 'ES|QL',
      loadDefaultProfile: async () => {
        const state = kbnRison.encode({
          dataSource: { type: 'esql' },
          query: { esql: 'from my-example-logs' },
        });

        await common.navigateToActualUrl('discover', `?_a=${state}`, {
          ensureCurrentUrl: false,
        });
        await discover.waitUntilTabIsLoaded();
      },
      switchToNoDefaultProfile: async () => {
        await submitEsqlQuery('from my-example-*');
      },
      switchToDefaultProfile: async () => {
        await submitEsqlQuery('from my-example-logs');
      },
    },
    {
      name: 'classic',
      loadDefaultProfile: async () => {
        await common.navigateToActualUrl('discover', undefined, {
          ensureCurrentUrl: false,
        });
        await discover.waitUntilTabIsLoaded();
        await dataViews.switchToAndValidate('my-example-logs');
        await discover.waitUntilTabIsLoaded();
      },
      switchToNoDefaultProfile: async () => {
        await dataViews.switchToAndValidate('my-example-*');
        await discover.waitUntilTabIsLoaded();
      },
      switchToDefaultProfile: async () => {
        await dataViews.switchToAndValidate('my-example-logs');
        await discover.waitUntilTabIsLoaded();
      },
    },
  ];

  describe('profile state', () => {
    afterEach(async () => {
      await browser.clearSessionStorage();
      await browser.clearLocalStorage();
      await discover.resetQueryMode();
    });

    for (const mode of modeDefinitions) {
      describe(`${mode.name} mode`, () => {
        it('applies default profile state on first resolve and keeps it isolated per tab', async () => {
          await mode.loadDefaultProfile();
          await expectRowHeight('Custom', 5);

          await changeRowHeight('Auto');
          await expectRowHeight('Auto');

          await unifiedTabs.createNewTab();
          await discover.waitUntilTabIsLoaded();
          await expectRowHeight('Custom', 5);

          await unifiedTabs.selectTab(0);
          await discover.waitUntilTabIsLoaded();
          await expectRowHeight('Auto');
        });

        it('restores isolated profile state and carries it into profiles without defaults', async () => {
          await mode.loadDefaultProfile();
          await expectRowHeight('Custom', 5);

          await changeRowHeight('Auto');

          await mode.switchToNoDefaultProfile();
          await expectRowHeight('Auto');

          await changeRowHeight('Custom', 2);

          await mode.switchToDefaultProfile();
          await expectRowHeight('Auto');

          await mode.switchToNoDefaultProfile();
          await expectRowHeight('Custom', 2);
        });

        it('updates profile state from the example doc viewer', async () => {
          await mode.loadDefaultProfile();
          await unifiedFieldList.clickFieldListItemAdd('@timestamp');
          await discover.waitUntilTabIsLoaded();
          await dataGrid.clickRowToggle({
            rowIndex: 0,
            defaultTabId: 'doc_view_profile_state_example',
          });
          await expectTimestampColor('hollow');

          await changeTimestampColor('danger');

          await dataGrid.closeFlyout();
          await dataGrid.clickRowToggle({
            rowIndex: 0,
            defaultTabId: 'doc_view_profile_state_example',
          });
          await expectTimestampColor('danger');
        });
      });
    }
  });
}
