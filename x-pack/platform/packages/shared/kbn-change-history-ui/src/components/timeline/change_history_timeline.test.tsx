/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import '@testing-library/jest-dom';
import { I18nProvider } from '@kbn/i18n-react';
import { render } from '@testing-library/react';
import React from 'react';
import { ChangeHistoryProvider } from '../../provider/change_history_provider';
import type { ChangeHistoryAdapter } from '../../types/change_history_adapter';
import {
  TEST_OBJECT_ID,
  TEST_OBJECT_TITLE,
  TEST_CHANGE_HISTORY_SCOPE,
} from '../../test_utils/change_history_test_fixtures';
import { ChangeHistoryTimeline } from './change_history_timeline';

class IntersectionObserverMock {
  observe = jest.fn();
  disconnect = jest.fn();
  unobserve = jest.fn();
}

beforeAll(() => {
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: IntersectionObserverMock,
  });
});

const adapter: ChangeHistoryAdapter = {
  listChanges: jest.fn(),
  getChange: jest.fn(),
};

const renderTimeline = (props: React.ComponentProps<typeof ChangeHistoryTimeline>) =>
  render(
    <I18nProvider>
      <ChangeHistoryProvider
        objectId={TEST_OBJECT_ID}
        adapter={adapter}
        labels={{ previewTitle: TEST_OBJECT_TITLE }}
        scope={TEST_CHANGE_HISTORY_SCOPE}
        renderPreview={() => null}
      >
        <ChangeHistoryTimeline {...props} />
      </ChangeHistoryProvider>
    </I18nProvider>
  );

describe('ChangeHistoryTimeline', () => {
  const items = [
    {
      id: 'evt-current',
      timestamp: '2026-06-16T12:00:00.000Z',
      actor: { name: 'Alice' },
      action: 'Updated',
      isCurrent: true,
    },
    {
      id: 'evt-previous',
      timestamp: '2026-06-15T12:00:00.000Z',
      actor: { name: 'Bob' },
      action: 'Updated',
    },
  ];

  it('scrolls to the top when the newest item is selected', () => {
    const scrollTo = jest.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });

    const { rerender } = renderTimeline({
      items,
      selectedItemId: 'evt-previous',
    });

    expect(scrollTo).not.toHaveBeenCalled();

    rerender(
      <I18nProvider>
        <ChangeHistoryProvider
          objectId={TEST_OBJECT_ID}
          adapter={adapter}
          labels={{ previewTitle: TEST_OBJECT_TITLE }}
          scope={TEST_CHANGE_HISTORY_SCOPE}
          renderPreview={() => null}
        >
          <ChangeHistoryTimeline items={items} selectedItemId="evt-current" />
        </ChangeHistoryProvider>
      </I18nProvider>
    );

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });
});
