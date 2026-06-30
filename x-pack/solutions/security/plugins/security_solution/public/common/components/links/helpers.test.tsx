/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { DEFAULT_MORE_MAX_HEIGHT } from '.';
import { TestProviders } from '../../mock';
import type { ReputationLinkSetting } from './helpers';
import { MoreReputationLinksContainer, ReputationLinksOverflow } from './helpers';

const rowItems = [
  { name: 'item1', url_template: 'https://www.virustotal.com/gui/search/{{ip}' },
  {
    name: 'item2',
    url_template: 'https://talosintelligence.com/reputation_center/lookup?search={{ip}}',
  },
  { name: 'item3', url_template: 'https://www.virustotal.com/gui/search/{{ip}' },
  {
    name: 'item4',
    url_template: 'https://talosintelligence.com/reputation_center/lookup?search={{ip}}',
  },
  { name: 'item5', url_template: 'https://www.virustotal.com/gui/search/{{ip}' },
  {
    name: 'item6',
    url_template: 'https://talosintelligence.com/reputation_center/lookup?search={{ip}}',
  },
];
describe('MoreReputationLinksContainer', () => {
  test('it should only render the items after overflowIndexStart', () => {
    render(
      <MoreReputationLinksContainer
        moreMaxHeight={DEFAULT_MORE_MAX_HEIGHT}
        overflowIndexStart={5}
        rowItems={rowItems}
        render={(item: ReputationLinkSetting) => <a href={item.url_template}>{item.name}</a>}
      />
    );

    expect(screen.getByText('item6')).toBeInTheDocument();
  });

  test('it should render all the items when overflowIndexStart is zero', () => {
    render(
      <MoreReputationLinksContainer
        moreMaxHeight={DEFAULT_MORE_MAX_HEIGHT}
        overflowIndexStart={0}
        rowItems={rowItems}
        render={(item: ReputationLinkSetting) => <a href={item.url_template}>{item.name}</a>}
      />
    );

    expect(screen.getAllByText(/item\d/)).toHaveLength(6);
  });

  test('it should have the eui-yScroll to enable scrolling', () => {
    const wrapper = render(
      <MoreReputationLinksContainer
        moreMaxHeight={DEFAULT_MORE_MAX_HEIGHT}
        overflowIndexStart={5}
        rowItems={rowItems}
        render={(item: ReputationLinkSetting) => <a href={item.url_template}>{item.name}</a>}
      />
    );

    expect(wrapper.getByTestId('more-container')).toHaveClass('eui-yScroll');
  });

  test('it should use the moreMaxHeight prop as the value for the max-height style', () => {
    const { getByTestId } = render(
      <MoreReputationLinksContainer
        moreMaxHeight={DEFAULT_MORE_MAX_HEIGHT}
        overflowIndexStart={5}
        rowItems={rowItems}
        render={(item: ReputationLinkSetting) => <a href={item.url_template}>{item.name}</a>}
      />
    );

    expect(getByTestId('more-container')).toHaveStyle({ maxHeight: '200px' });
  });

  test('it should only invoke the optional render function, when provided, for the items after overflowIndexStart', () => {
    const mockRender = jest.fn(() => <></>);

    render(
      <MoreReputationLinksContainer
        moreMaxHeight={DEFAULT_MORE_MAX_HEIGHT}
        overflowIndexStart={5}
        rowItems={rowItems}
        render={mockRender}
      />
    );

    expect(mockRender).toHaveBeenCalledTimes(1);
  });
});

describe('ReputationLinksOverflow', () => {
  test('it should render the length of items after the overflowIndexStart', () => {
    const wrapper = render(
      <TestProviders>
        <ReputationLinksOverflow
          moreMaxHeight={DEFAULT_MORE_MAX_HEIGHT}
          overflowIndexStart={5}
          rowItems={rowItems}
          render={(item: ReputationLinkSetting) => <a href={item.url_template}>{item.name}</a>}
        />
      </TestProviders>
    );

    expect(wrapper.getByText('+1 More')).toBeInTheDocument();
    expect(wrapper.queryByTestId('more-container')).toBeNull();
  });

  test('it should render the items after overflowIndexStart in the popover', () => {
    const wrapper = render(
      <TestProviders>
        <ReputationLinksOverflow
          moreMaxHeight={DEFAULT_MORE_MAX_HEIGHT}
          overflowIndexStart={5}
          rowItems={rowItems}
          render={(item: ReputationLinkSetting) => <a href={item.url_template}>{item.name}</a>}
        />
      </TestProviders>
    );
    fireEvent.click(wrapper.getByText('+1 More'));

    expect(wrapper.queryByTestId('more-container')).toHaveTextContent('item6');
  });
});
