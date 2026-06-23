/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
// Necessary until components being tested are migrated of styled-components https://github.com/elastic/kibana/issues/219037
import 'jest-styled-components';
// Make sure expect().toHaveStyleRule is using emotion's matchers
import { matchers as emotionMatchers } from '@emotion/jest';
expect.extend(emotionMatchers);
import { render, screen, renderHook, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TestProviders } from '../../mock';
import type { HeaderSectionProps } from '.';
import { getHeaderAlignment, HeaderSection } from '.';
import { ModalInspectQuery } from '../inspect/modal';
import { useEuiTheme } from '@elastic/eui';

jest.mock('../inspect/modal', () => {
  const actual = jest.requireActual('../inspect/modal');
  return {
    ...actual,
    ModalInspectQuery: jest.fn().mockReturnValue(null),
  };
});

jest.mock('../inspect/use_inspect', () => ({
  useInspect: () => ({
    isShowingModal: true,
    handleClick: jest.fn(),
    request: 'fake request',
    response: 'fake response',
  }),
}));

const renderHeaderSection = (props: HeaderSectionProps) =>
  render(
    <TestProviders>
      <HeaderSection {...props} />
    </TestProviders>
  );

describe('HeaderSection', () => {
  beforeEach(() => jest.clearAllMocks());

  test('it renders', () => {
    renderHeaderSection({ title: 'Test title' });
    expect(screen.getByTestId('header-section')).toMatchSnapshot();
  });

  test('it renders the title', () => {
    renderHeaderSection({ title: 'Test title' });
    expect(screen.getByTestId('header-section-title')).toBeInTheDocument();
  });

  test('it renders the subtitle when provided', () => {
    renderHeaderSection({ subtitle: 'Test subtitle', title: 'Test title' });
    expect(screen.getByTestId('header-section-subtitle')).toBeInTheDocument();
  });

  test('renders the subtitle when not provided (to prevent layout thrash)', () => {
    renderHeaderSection({ title: 'Test title' });
    expect(screen.getByTestId('header-section-subtitle')).toBeInTheDocument();
  });

  test('it renders the tooltip when provided', async () => {
    const tooltipTitle = 'Test tooltip title';
    const tooltipContent = 'Test tooltip content';

    renderHeaderSection({ title: 'Test title', tooltip: tooltipContent, tooltipTitle });

    const tooltip = screen.getByTestId('header-section-tooltip-icon');
    expect(tooltip).toBeInTheDocument();

    expect(screen.queryByText(tooltipTitle)).not.toBeInTheDocument();
    expect(screen.queryByText(tooltipContent)).not.toBeInTheDocument();

    fireEvent.mouseOver(tooltip);

    expect(await screen.findByText(tooltipTitle)).toBeInTheDocument();
    expect(await screen.findByText(tooltipContent)).toBeInTheDocument();
  });

  test('it renders supplements when children provided', () => {
    renderHeaderSection({
      title: 'Test title',
      children: <p>{'Test children'}</p>,
    });
    expect(screen.getByTestId('header-section-supplements')).toBeInTheDocument();
  });

  test('it DOES NOT render supplements when children not provided', () => {
    renderHeaderSection({ title: 'Test title' });
    expect(screen.queryByTestId('header-section-supplements')).not.toBeInTheDocument();
  });

  test('it applies border styles when border is true', () => {
    const { container } = renderHeaderSection({ border: true, title: 'Test title' });
    const siemHeaderSection = container.querySelector('.siemHeaderSection');
    expect(siemHeaderSection).toBeInTheDocument();

    const { result } = renderHook(() => useEuiTheme());
    expect(siemHeaderSection).toHaveStyleRule('border-bottom', result.current.euiTheme.border.thin);
    expect(siemHeaderSection).toHaveStyleRule('padding-bottom', result.current.euiTheme.size.l);
  });

  test('it DOES NOT apply border styles when border is false', () => {
    const { container } = renderHeaderSection({ title: 'Test title' });
    const siemHeaderSection = container.querySelector('.siemHeaderSection');

    const { result } = renderHook(() => useEuiTheme());
    expect(siemHeaderSection).not.toHaveStyleRule(
      'border-bottom',
      result.current.euiTheme.border.thin
    );
    expect(siemHeaderSection).not.toHaveStyleRule('padding-bottom', result.current.euiTheme.size.l);
  });

  test('it splits the title and supplement areas evenly when split is true', () => {
    renderHeaderSection({
      split: true,
      title: 'Test title',
      children: <p>{'Test children'}</p>,
    });
    const supplements = screen.getByTestId('header-section-supplements');
    expect(supplements.className).not.toContain('growZero');
  });

  test('it DOES NOT split the title and supplement areas evenly when split is false', () => {
    renderHeaderSection({
      title: 'Test title',
      children: <p>{'Test children'}</p>,
    });
    const supplements = screen.getByTestId('header-section-supplements');
    expect(supplements.className).toContain('growZero');
  });

  test('it renders an inspect button when an `id` is provided', () => {
    renderHeaderSection({
      id: 'an id',
      title: 'Test title',
      children: <p>{'Test children'}</p>,
    });
    expect(screen.getByTestId('inspect-icon-button')).toBeInTheDocument();
  });

  test('it renders an inspect button when an `id` is provided and `showInspectButton` is true', () => {
    renderHeaderSection({
      id: 'an id',
      title: 'Test title',
      showInspectButton: true,
      children: <p>{'Test children'}</p>,
    });
    expect(screen.getByTestId('inspect-icon-button')).toBeInTheDocument();
  });

  test('it does NOT render an inspect button when `showInspectButton` is false', () => {
    renderHeaderSection({
      id: 'an id',
      title: 'Test title',
      showInspectButton: false,
      children: <p>{'Test children'}</p>,
    });
    expect(screen.queryByTestId('inspect-icon-button')).not.toBeInTheDocument();
  });

  test('it does NOT render an inspect button when an `id` is NOT provided', () => {
    renderHeaderSection({
      title: 'Test title',
      children: <p>{'Test children'}</p>,
    });
    expect(screen.queryByTestId('inspect-icon-button')).not.toBeInTheDocument();
  });

  test('it defaults to using `title` for the inspect modal when `inspectTitle` is NOT provided', () => {
    const title = 'Use this by default';
    renderHeaderSection({
      id: 'abcd',
      title,
      children: <p>{'Test children'}</p>,
    });
    expect((ModalInspectQuery as jest.Mock).mock.calls[0][0].title).toEqual(title);
  });

  test('it uses `inspectTitle` instead of `title` for the inspect modal when `inspectTitle` is provided', () => {
    const title = `Don't use this`;
    const inspectTitle = 'Use this instead';
    renderHeaderSection({
      id: 'abcd',
      inspectTitle,
      title,
      children: <p>{'Test children'}</p>,
    });
    expect((ModalInspectQuery as jest.Mock).mock.calls[0][0].title).toEqual(inspectTitle);
  });

  test('it does not render query-toggle-header when no arguments provided', () => {
    renderHeaderSection({
      id: 'an id',
      title: 'Test title',
      children: <p>{'Test children'}</p>,
    });
    expect(screen.queryByTestId('query-toggle-header')).not.toBeInTheDocument();
  });

  test('it does render query-toggle-header when toggleQuery arguments provided', () => {
    renderHeaderSection({
      id: 'an id',
      title: 'Test title',
      toggleQuery: jest.fn(),
      toggleStatus: true,
      children: <p>{'Test children'}</p>,
    });
    expect(screen.getByTestId('query-toggle-header')).toBeInTheDocument();
  });

  test('it does NOT align items to flex start in the outer flex group when stackHeader is true', () => {
    renderHeaderSection({
      id: 'an id',
      stackHeader: true,
      title: 'Test title',
      toggleQuery: jest.fn(),
      children: <p>{'Test children'}</p>,
    });
    const flexGroup = screen.getByTestId('headerSectionOuterFlexGroup');
    expect(flexGroup.className).not.toContain('flexStart-flexStart');
  });

  test(`it uses the 'column' direction in the outer flex group by default`, () => {
    renderHeaderSection({
      id: 'an id',
      title: 'Test title',
      toggleQuery: jest.fn(),
      children: <p>{'Test children'}</p>,
    });
    const flexGroup = screen.getByTestId('headerSectionOuterFlexGroup');
    expect(flexGroup.className).toContain('column');
  });

  test('it uses the `outerDirection` prop to specify the direction of the outer flex group when it is provided', () => {
    renderHeaderSection({
      id: 'an id',
      outerDirection: 'row',
      title: 'Test title',
      toggleQuery: jest.fn(),
      children: <p>{'Test children'}</p>,
    });
    const flexGroup = screen.getByTestId('headerSectionOuterFlexGroup');
    expect(flexGroup.className).toContain('row');
  });

  test('it defaults to center alignment in the inner flex group', () => {
    renderHeaderSection({
      id: 'an id',
      title: 'Test title',
      toggleQuery: jest.fn(),
      children: <p>{'Test children'}</p>,
    });
    const flexGroup = screen.getByTestId('headerSectionInnerFlexGroup');
    expect(flexGroup.className).toContain('center');
  });

  test('it aligns items using the value of the `alignHeader` prop in the inner flex group when specified', () => {
    renderHeaderSection({
      alignHeader: 'flexEnd',
      id: 'an id',
      title: 'Test title',
      toggleQuery: jest.fn(),
      children: <p>{'Test children'}</p>,
    });
    const flexGroup = screen.getByTestId('headerSectionInnerFlexGroup');
    expect(flexGroup.className).toContain('flexEnd');
  });

  test('it does NOT default to center alignment in the inner flex group when the `stackHeader` prop is true', () => {
    renderHeaderSection({
      id: 'an id',
      stackHeader: true,
      title: 'Test title',
      toggleQuery: jest.fn(),
      children: <p>{'Test children'}</p>,
    });
    const flexGroup = screen.getByTestId('headerSectionInnerFlexGroup');
    expect(flexGroup.className).not.toContain('center');
  });

  test('it does render everything but title when toggleStatus = true', () => {
    renderHeaderSection({
      id: 'an id',
      title: 'Test title',
      subtitle: 'subtitle',
      headerFilters: 'headerFilters',
      toggleQuery: jest.fn(),
      toggleStatus: true,
      children: <p>{'Test children'}</p>,
    });

    expect(screen.getByTestId('query-toggle-header')).toHaveAttribute('aria-label', 'Open');
    expect(screen.getByTestId('header-section-supplements')).toBeInTheDocument();
    expect(screen.getByTestId('header-section-subtitle')).toBeInTheDocument();
    expect(screen.getByTestId('header-section-filters')).toBeInTheDocument();
    expect(screen.getByTestId('inspect-icon-button')).toBeInTheDocument();
  });

  test('it appends `toggle-expand` class to Header when toggleStatus = true', () => {
    renderHeaderSection({
      id: 'an id',
      title: 'Test title',
      subtitle: 'subtitle',
      headerFilters: 'headerFilters',
      toggleQuery: jest.fn(),
      toggleStatus: true,
      children: <p>{'Test children'}</p>,
    });

    expect(screen.getByTestId('header-section')).toHaveClass('toggle-expand', 'siemHeaderSection');
  });

  test('it does not render anything but title when toggleStatus = false', () => {
    renderHeaderSection({
      id: 'an id',
      title: 'Test title',
      subtitle: 'subtitle',
      headerFilters: 'headerFilters',
      toggleQuery: jest.fn(),
      toggleStatus: false,
      children: <p>{'Test children'}</p>,
    });

    expect(screen.getByTestId('query-toggle-header')).toHaveAttribute('aria-label', 'Closed');
    expect(screen.queryByTestId('header-section-supplements')).not.toBeInTheDocument();
    expect(screen.queryByTestId('header-section-filters')).not.toBeInTheDocument();
    expect(screen.queryByTestId('header-section-subtitle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('inspect-icon-button')).not.toBeInTheDocument();
  });

  test('renders "Chart Closed" when toggleAriaLabel="Chart" and toggleStatus=false', () => {
    renderHeaderSection({
      id: 'id',
      title: 'T',
      subtitle: 'S',
      headerFilters: null,
      toggleQuery: jest.fn(),
      toggleStatus: false,
      toggleAriaLabel: 'Chart',
      children: null,
    });
    expect(screen.getByTestId('query-toggle-header')).toHaveAttribute('aria-label', 'Chart Closed');
  });

  test('it toggles query when icon is clicked', async () => {
    const mockToggle = jest.fn();
    renderHeaderSection({
      id: 'an id',
      title: 'Test title',
      toggleQuery: mockToggle,
      toggleStatus: true,
      children: <p>{'Test children'}</p>,
    });

    await userEvent.click(screen.getByTestId('query-toggle-header'));
    expect(mockToggle).toHaveBeenCalledWith(false);
  });

  describe('getHeaderAlignment', () => {
    test(`it always returns the value of alignHeader when it's provided`, () => {
      const alignHeader = 'flexStart';
      const stackHeader = true;

      expect(getHeaderAlignment({ alignHeader, stackHeader })).toEqual(alignHeader);
    });

    test(`it returns undefined when stackHeader is true`, () => {
      const stackHeader = true;

      expect(getHeaderAlignment({ stackHeader })).toBeUndefined();
    });

    test(`it returns 'center' when stackHeader is false`, () => {
      const stackHeader = false;

      expect(getHeaderAlignment({ stackHeader })).toEqual('center');
    });

    test(`it returns 'center' by default`, () => {
      expect(getHeaderAlignment({})).toEqual('center');
    });
  });
});
