/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';

import userEvent from '@testing-library/user-event';
import { createEvent, fireEvent, render, screen } from '@testing-library/react';

import { ExternalLinkComponent } from './external_link_component';
import { coreServices } from '../../services/kibana_services';
import type { ResolvedLink } from '../../types';
import { DEFAULT_EXTERNAL_LINK_OPTIONS, LINKS_VERTICAL_LAYOUT } from '../../../common/constants';

describe('external link component', () => {
  const defaultLinkInfo: ResolvedLink = {
    destination: 'https://example.com',
    id: 'foo',
    type: 'externalLink' as const,
    title: 'https://example.com',
    options: DEFAULT_EXTERNAL_LINK_OPTIONS,
  };

  beforeEach(async () => {
    window.open = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('by default opens in new tab and renders external icon', async () => {
    render(<ExternalLinkComponent link={defaultLinkInfo} layout={LINKS_VERTICAL_LAYOUT} />);

    const link = await screen.findByTestId('externalLink--https://example.com');
    expect(link).toBeInTheDocument();
    const externalIcon = link.querySelector('[data-euiicon-type="external"]');
    expect(externalIcon).toBeInTheDocument();
    await userEvent.click(link);
    expect(window.open).toHaveBeenCalledWith('https://example.com', '_blank');
  });

  test('renders external icon even when `open_in_new_tab` setting is `false`', async () => {
    const linkInfo = {
      ...defaultLinkInfo,
      options: { ...DEFAULT_EXTERNAL_LINK_OPTIONS, open_in_new_tab: false },
    };
    render(<ExternalLinkComponent link={linkInfo} layout={LINKS_VERTICAL_LAYOUT} />);
    const link = await screen.findByTestId('externalLink--https://example.com');
    const externalIcon = link.querySelector('[data-euiicon-type="external"]');
    expect(externalIcon).toBeInTheDocument();
  });

  test('modified click does not trigger event.preventDefault', async () => {
    const linkInfo = {
      ...defaultLinkInfo,
      options: { ...DEFAULT_EXTERNAL_LINK_OPTIONS, open_in_new_tab: false },
    };
    render(<ExternalLinkComponent link={linkInfo} layout={LINKS_VERTICAL_LAYOUT} />);

    const link = await screen.findByTestId('externalLink--https://example.com');
    expect(link).toHaveTextContent('https://example.com');
    const clickEvent = createEvent.click(link, { ctrlKey: true });
    const preventDefault = jest.spyOn(clickEvent, 'preventDefault');
    fireEvent(link, clickEvent);
    expect(preventDefault).toHaveBeenCalledTimes(0);
  });

  test('uses navigateToUrl when open_in_new_tab is false', async () => {
    const linkInfo = {
      ...defaultLinkInfo,
      options: { ...DEFAULT_EXTERNAL_LINK_OPTIONS, open_in_new_tab: false },
    };
    render(<ExternalLinkComponent link={linkInfo} layout={LINKS_VERTICAL_LAYOUT} />);

    const link = await screen.findByTestId('externalLink--https://example.com');
    await userEvent.click(link);
    expect(coreServices.application.navigateToUrl).toBeCalledTimes(1);
    expect(coreServices.application.navigateToUrl).toBeCalledWith('https://example.com');
  });

  test('disables link when url validation fails', async () => {
    const linkInfo = {
      ...defaultLinkInfo,
      destination: 'file://buzz',
      error: new Error('URL not supported'),
    };
    render(<ExternalLinkComponent link={linkInfo} layout={LINKS_VERTICAL_LAYOUT} />);

    const link = screen.getByTestId('externalLink--https://example.com--error');
    expect(link).toBeDisabled();
    /**
     * TODO: We should test the tooltip content, but the component is disabled
     * so it has pointer-events: none. This means we can not use userEvent.hover().
     * See https://testing-library.com/docs/ecosystem-user-event#pointer-events-options
     */
  });
});
