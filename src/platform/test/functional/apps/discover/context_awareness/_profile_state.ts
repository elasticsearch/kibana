/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Scout audit: MIGRATE TO SCOUT UI. Browser-only — asserts profile state survives localStorage,
 * URL state, the history stack, tab restore/duplicate, and share links. The underlying state
 * plumbing is unit tested (context_awareness/in_memory_toolkit.test.ts,
 * context_awareness/profile_state_adapter.test.ts); the persistence itself is not.
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
  const { common, discover, share, unifiedTabs } = getPageObjects([
    'common',
    'discover',
    'share',
    'unifiedTabs',
  ]);
  const browser = getService('browser');
  const dataGrid = getService('dataGrid');
  const dataViews = getService('dataViews');
  const esql = getService('esql');
  const retry = getService('retry');
  const testSubjects = getService('testSubjects');
  const timestampColorSelectTestSubj = 'exampleProfileStateTimestampColorSelect';
  const rowControlColorSelectTestSubj = 'exampleProfileStateRowControlColorSelect';
  const boxColorSelectTestSubj = 'exampleProfileStateBoxColorSelect';

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

  const getRowControlColor = async () => {
    return await testSubjects.getAttribute(rowControlColorSelectTestSubj, 'value');
  };

  const expectRowControlColor = async (expectedValue: string) => {
    await retry.try(async () => {
      expect(await getRowControlColor()).to.be(expectedValue);
    });
  };

  const changeRowControlColor = async (nextValue: string) => {
    await testSubjects.selectValue(rowControlColorSelectTestSubj, nextValue);
    await expectRowControlColor(nextValue);
  };

  const getBoxColor = async () => {
    return await testSubjects.getAttribute(boxColorSelectTestSubj, 'value');
  };

  const expectBoxColor = async (expectedValue: string) => {
    await retry.try(async () => {
      expect(await getBoxColor()).to.be(expectedValue);
    });
  };

  const changeBoxColor = async (nextValue: string) => {
    await testSubjects.selectValue(boxColorSelectTestSubj, nextValue);
    await expectBoxColor(nextValue);
  };

  const expectProfileStateControls = async ({
    timestampColor,
    rowControlColor,
    boxColor,
  }: {
    timestampColor: string;
    rowControlColor: string;
    boxColor: string;
  }) => {
    await expectTimestampColor(timestampColor);
    await expectRowControlColor(rowControlColor);
    await expectBoxColor(boxColor);
  };

  const getProfileUrlState = async () => {
    const hash = await browser.execute<[], string>('return window.location.hash');
    const queryIndex = hash.indexOf('?');

    if (queryIndex === -1) {
      return undefined;
    }

    const profileUrlState = new URLSearchParams(hash.slice(queryIndex + 1)).get('_p');

    return profileUrlState ? kbnRison.decode(profileUrlState) : undefined;
  };

  const expectProfileUrlBoxColor = async (expectedValue: string) => {
    await retry.try(async () => {
      expect(await getProfileUrlState()).to.eql({
        exampleProfileState: {
          boxColor: expectedValue,
        },
      });
    });
  };

  const expectNoProfileUrlState = async () => {
    await retry.try(async () => {
      expect(await getProfileUrlState()).to.be(undefined);
    });
  };

  const openProfileStateDocView = async () => {
    const profileStateTabId = 'doc_view_profile_state_example';

    if (await dataGrid.isShowingDocViewer()) {
      await dataGrid.clickDocViewerTab(profileStateTabId);
    } else {
      await dataGrid.clickRowToggle({
        rowIndex: 0,
        defaultTabId: profileStateTabId,
      });
    }
  };

  const waitForPersistentProfileStateInStorage = async (expectedValue: string) => {
    await retry.try(async () => {
      const storedTabs = (await browser.getLocalStorageItem('discover.tabs')) ?? '';
      expect(storedTabs).to.contain('rowControlColor');
      expect(storedTabs).to.contain(expectedValue);
    });
  };

  const waitForRecentlyClosedProfileStateInStorage = async (expectedValue: string) => {
    await retry.try(async () => {
      const storedTabs = (await browser.getLocalStorageItem('discover.tabs')) ?? '';
      expect(storedTabs).to.contain('closedAt');
      expect(storedTabs).to.contain('rowControlColor');
      expect(storedTabs).to.contain(expectedValue);
    });
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

          await discover.createNewTabAndSearch();
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

        it('applies UI, persistent, and URL profile state through refresh, restore, duplicate, and tab switch', async () => {
          await mode.loadDefaultProfile();
          await openProfileStateDocView();
          await expectProfileStateControls({
            timestampColor: 'hollow',
            rowControlColor: 'text',
            boxColor: 'transparent',
          });

          await changeTimestampColor('danger');
          await changeRowControlColor('warning');
          await changeBoxColor('danger');
          await waitForPersistentProfileStateInStorage('warning');
          await expectProfileUrlBoxColor('danger');

          await browser.goBack();
          await expectNoProfileUrlState();
          await expectBoxColor('transparent');

          await browser.goForward();
          await expectProfileUrlBoxColor('danger');
          await expectBoxColor('danger');

          await browser.refresh();
          await discover.waitUntilTabIsLoaded();
          await openProfileStateDocView();
          await expectProfileStateControls({
            timestampColor: 'hollow',
            rowControlColor: 'warning',
            boxColor: 'danger',
          });
          await changeTimestampColor('accent');

          await discover.createNewTabAndSearch();
          await unifiedTabs.closeTab(0);
          await waitForRecentlyClosedProfileStateInStorage('warning');

          await browser.refresh();
          await discover.waitUntilTabIsLoaded();
          await waitForRecentlyClosedProfileStateInStorage('warning');

          await unifiedTabs.restoreRecentlyClosedTab(0);
          await discover.waitUntilTabIsLoaded();
          await openProfileStateDocView();
          await expectProfileStateControls({
            timestampColor: 'hollow',
            rowControlColor: 'warning',
            boxColor: 'danger',
          });
          await changeTimestampColor('accent');

          await unifiedTabs.duplicateTab(1);
          await discover.waitUntilTabIsLoaded();
          await openProfileStateDocView();
          await expectProfileStateControls({
            timestampColor: 'accent',
            rowControlColor: 'warning',
            boxColor: 'danger',
          });

          await changeTimestampColor('success');
          await changeRowControlColor('primary');
          await changeBoxColor('success');
          await waitForPersistentProfileStateInStorage('primary');
          await expectProfileUrlBoxColor('success');

          await unifiedTabs.selectTab(1);
          await discover.waitUntilTabIsLoaded();
          await expectProfileStateControls({
            timestampColor: 'accent',
            rowControlColor: 'warning',
            boxColor: 'danger',
          });
          await expectProfileUrlBoxColor('danger');
        });

        it('restores persistent and URL profile state from a shared locator', async () => {
          await mode.loadDefaultProfile();
          await openProfileStateDocView();
          await changeTimestampColor('danger');
          await changeRowControlColor('warning');
          await changeBoxColor('danger');

          await share.clickShareTopNavButton();
          const sharedUrl = await share.getSharedUrl();

          await browser.clearSessionStorage();
          await browser.clearLocalStorage();
          await browser.get(sharedUrl, false);
          await discover.waitUntilTabIsLoaded();
          await openProfileStateDocView();

          await expectProfileStateControls({
            timestampColor: 'hollow',
            rowControlColor: 'warning',
            boxColor: 'danger',
          });
          await expectProfileUrlBoxColor('danger');
        });
      });
    }
  });
}
