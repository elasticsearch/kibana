/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/ui';
import { tags } from '@kbn/scout';
import { test } from '../fixtures';

const STREAM_NAME = 'logs.otel.enrichment-test';
const STREAM_DESCRIPTION = 'Test stream for ES|QL autocomplete enrichment';

test.describe(
  'ES|QL source enrichment - stream description in autocomplete popup',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.all] },
  () => {
    test.beforeAll(async ({ apiServices }) => {
      // In stateful mode logs.otel has a deferred backing data stream after enable(); restore it first
      await apiServices.streams.restoreDataStream('logs.otel');
      await apiServices.streams.forkStream('logs.otel', STREAM_NAME, { always: {} });
      await apiServices.streams.updateStream(STREAM_NAME, { description: STREAM_DESCRIPTION });
    });

    test.beforeEach(async ({ pageObjects }) => {
      await pageObjects.discover.setQueryMode('classic');
    });

    test.afterAll(async ({ apiServices }) => {
      await apiServices.streams.deleteStream(STREAM_NAME);
    });

    test('shows stream description and management link in ES|QL autocomplete popup', async ({
      browserAuth,
      pageObjects,
      page,
    }) => {
      await browserAuth.loginAsAdmin();
      await pageObjects.discover.goto({ queryMode: 'classic' });

      const codeEditor = pageObjects.discover.codeEditor;

      await test.step('switch to ES|QL mode', async () => {
        await pageObjects.discover.selectTextBaseLang();
      });

      await test.step('trigger autocomplete after FROM', async () => {
        await codeEditor.setCodeEditorValue('FROM ');
        await codeEditor.triggerSuggest('FROM ');
      });

      const suggestWidget = codeEditor.getCodeEditorSuggestWidget();

      await test.step('filter to test stream and assert suggestion with Wired Stream type', async () => {
        await expect(suggestWidget).toBeVisible();
        // Narrow the suggestion list to the test stream
        await page.keyboard.type(STREAM_NAME);
        const streamOption = suggestWidget.getByRole('option', { name: new RegExp(STREAM_NAME) });
        await expect(streamOption).toBeVisible();
        // The enricher sets type=WIRED_STREAM which maps to detail text "Wired Stream"
        await expect(streamOption).toContainText('Wired Stream');
      });

      await test.step('open documentation panel and assert description and link', async () => {
        // Press ArrowDown to keyboard-focus the highlighted item.
        // Monaco requires SuggestContext.HasFocusedSuggestion to be true before the
        // 'toggleSuggestionDetails' command's precondition is satisfied.
        await page.keyboard.press('ArrowDown');

        await codeEditor.toggleSuggestDetails();

        const detailsPanel = codeEditor.getSuggestDetailsContainer();
        await expect(detailsPanel).toBeVisible();
        // The enricher populates description and a management link
        await expect(detailsPanel).toContainText(STREAM_DESCRIPTION);
        await expect(detailsPanel).toContainText(STREAM_NAME); // link label includes the stream name
      });
    });
  }
);
