/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestProviders } from '../../../../common/mock';
import { mockGetUrlForApp } from '@kbn/security-solution-navigation/mocks/context';
import { DefaultFieldRenderer, DefaultFieldRendererOverflow } from '.';

jest.mock('../../../../common/lib/kibana');
jest.mock('@kbn/security-solution-navigation/src/context');
mockGetUrlForApp.mockImplementation(
  (appId: string, options?: { path?: string; deepLinkId?: boolean }) =>
    `${appId}/${options?.deepLinkId ?? ''}${options?.path ?? ''}`
);

export const DEFAULT_MORE_MAX_HEIGHT = '200px';

describe('Field Renderers', () => {
  describe('DefaultFieldRenderer', () => {
    test('it should render a single item', () => {
      render(
        <TestProviders>
          <DefaultFieldRenderer rowItems={['item1']} attrName={'item1'} idPrefix={'prefix-1'} />
        </TestProviders>
      );
      expect(screen.getByTestId('DefaultFieldRendererComponent').textContent).toEqual('item1 ');
    });

    test('it should render two items', () => {
      render(
        <TestProviders>
          <DefaultFieldRenderer
            displayCount={5}
            rowItems={['item1', 'item2']}
            attrName={'item1'}
            idPrefix={'prefix-1'}
          />
        </TestProviders>
      );

      expect(screen.getByTestId('DefaultFieldRendererComponent').textContent).toEqual(
        'item1,item2 '
      );
    });

    test('it should render all items when the item count exactly equals displayCount', () => {
      render(
        <TestProviders>
          <DefaultFieldRenderer
            displayCount={5}
            rowItems={['item1', 'item2', 'item3', 'item4', 'item5']}
            attrName={'item1'}
            idPrefix={'prefix-1'}
          />
        </TestProviders>
      );

      expect(screen.getByTestId('DefaultFieldRendererComponent').textContent).toEqual(
        'item1,item2,item3,item4,item5 '
      );
    });

    test('it should render all items up to displayCount and the expected "+ n More" popover anchor text for items greater than displayCount', () => {
      render(
        <TestProviders>
          <DefaultFieldRenderer
            displayCount={5}
            rowItems={['item1', 'item2', 'item3', 'item4', 'item5', 'item6', 'item7']}
            attrName={'item1'}
            idPrefix={'prefix-1'}
          />
        </TestProviders>
      );
      expect(screen.getByTestId('DefaultFieldRendererComponent').textContent).toEqual(
        'item1,item2,item3,item4,item5  ,+2 More'
      );
    });
  });
  describe('DefaultFieldRendererOverflow', () => {
    const idPrefix = 'prefix-1';
    const rowItems = ['item1', 'item2', 'item3', 'item4', 'item5', 'item6', 'item7'];

    test('it should render the length of items after the overflowIndexStart', () => {
      render(
        <TestProviders>
          <DefaultFieldRendererOverflow
            idPrefix={idPrefix}
            moreMaxHeight={DEFAULT_MORE_MAX_HEIGHT}
            overflowIndexStart={5}
            rowItems={rowItems}
            attrName={'mock.attr'}
          />
        </TestProviders>
      );

      expect(screen.getByTestId('DefaultFieldRendererOverflow-button').textContent).toEqual(
        '+2 More'
      );
      expect(screen.queryByTestId('more-container')).not.toBeInTheDocument();
    });

    test('it should render the items after overflowIndexStart in the popover', async () => {
      const { container } = render(
        <TestProviders>
          <DefaultFieldRendererOverflow
            idPrefix={idPrefix}
            moreMaxHeight={DEFAULT_MORE_MAX_HEIGHT}
            overflowIndexStart={5}
            rowItems={rowItems}
            attrName={'mock.attr'}
          />
        </TestProviders>
      );

      await userEvent.click(screen.getByTestId('DefaultFieldRendererOverflow-button'));
      expect(container.closest('body')!.querySelector('[role="dialog"]')).toBeInTheDocument();
      expect(screen.getByTestId('more-container').textContent).toEqual('item6item7');
    });
  });
});
