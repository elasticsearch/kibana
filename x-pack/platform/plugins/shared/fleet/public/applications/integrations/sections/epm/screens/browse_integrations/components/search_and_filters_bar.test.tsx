/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { EuiThemeProvider } from '@elastic/eui';

const mockUseUrlFilters = jest.fn();
const mockUseAddUrlFilters = jest.fn();
const mockUseUrlCategories = jest.fn();
const mockUseSetUrlCategory = jest.fn();
const mockUseUrlDefaultCategories = jest.fn();

jest.mock('../hooks/url_filters', () => ({
  useUrlFilters: () => mockUseUrlFilters(),
  useAddUrlFilters: () => mockUseAddUrlFilters(),
}));

jest.mock('../hooks/url_categories', () => ({
  useUrlCategories: () => mockUseUrlCategories(),
  useSetUrlCategory: () => mockUseSetUrlCategory(),
  useUrlDefaultCategories: () => mockUseUrlDefaultCategories(),
}));

jest.mock('../../../../../hooks', () => ({}));

import { SearchAndFiltersBar } from './search_and_filters_bar';

describe('SearchAndFiltersBar', () => {
  const mockAddUrlFilters = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseUrlFilters.mockReturnValue({
      q: undefined,
      sort: undefined,
      status: undefined,
    });
    mockUseAddUrlFilters.mockReturnValue(mockAddUrlFilters);
    mockUseUrlCategories.mockReturnValue({
      category: '',
      subCategory: undefined,
    });
    mockUseSetUrlCategory.mockReturnValue(jest.fn());
    mockUseUrlDefaultCategories.mockReturnValue([]);
  });

  function renderSearchAndFiltersBar() {
    return render(
      <I18nProvider>
        <EuiThemeProvider>
          <SearchAndFiltersBar />
        </EuiThemeProvider>
      </I18nProvider>
    );
  }

  describe('Status Filter', () => {
    it('renders the status filter button', () => {
      const { getByTestId } = renderSearchAndFiltersBar();
      expect(getByTestId('browseIntegrations.searchBar.statusBtn')).toBeInTheDocument();
    });

    it('shows active filter indicator when deprecated is selected', () => {
      mockUseUrlFilters.mockReturnValue({
        q: undefined,
        sort: undefined,
        status: ['deprecated'],
      });

      const { getByTestId } = renderSearchAndFiltersBar();
      const button = getByTestId('browseIntegrations.searchBar.statusBtn');

      expect(button).toHaveClass('euiFilterButton-hasActiveFilters');

      const badge = button.querySelector('.euiNotificationBadge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('1');
    });

    it('calls addUrlFilters when deprecated option is toggled', async () => {
      const { getByTestId } = renderSearchAndFiltersBar();

      fireEvent.click(getByTestId('browseIntegrations.searchBar.statusBtn'));

      const deprecatedOption = getByTestId('browseIntegrations.searchBar.statusDeprecatedOption');
      fireEvent.click(deprecatedOption);

      await waitFor(() => {
        expect(mockAddUrlFilters).toHaveBeenCalledWith({
          status: ['deprecated'],
        });
      });
    });

    it('removes filter from URL when option is unchecked', async () => {
      mockUseUrlFilters.mockReturnValue({
        q: undefined,
        sort: undefined,
        status: ['deprecated'],
      });

      const { getByTestId } = renderSearchAndFiltersBar();

      fireEvent.click(getByTestId('browseIntegrations.searchBar.statusBtn'));

      const deprecatedOption = getByTestId('browseIntegrations.searchBar.statusDeprecatedOption');
      fireEvent.click(deprecatedOption);

      await waitFor(() => {
        expect(mockAddUrlFilters).toHaveBeenCalledWith({
          status: undefined,
        });
      });
    });
  });

  describe('Search Bar', () => {
    it('renders the search input', () => {
      const { getByTestId } = renderSearchAndFiltersBar();
      expect(getByTestId('epmList.searchBar')).toBeInTheDocument();
    });

    it('displays the search query from URL', () => {
      mockUseUrlFilters.mockReturnValue({
        q: 'apache',
        sort: undefined,
        status: undefined,
      });

      const { getByTestId } = renderSearchAndFiltersBar();
      const searchInput = getByTestId('epmList.searchBar') as HTMLInputElement;

      expect(searchInput.value).toBe('apache');
    });
  });

  describe('Sort Filter', () => {
    it('renders the sort button', () => {
      const { getByTestId } = renderSearchAndFiltersBar();
      expect(getByTestId('browseIntegrations.searchBar.sortBtn')).toBeInTheDocument();
    });

    it('displays selected sort option', () => {
      mockUseUrlFilters.mockReturnValue({
        q: undefined,
        sort: 'a-z',
        status: undefined,
      });

      const { getByTestId } = renderSearchAndFiltersBar();
      const sortButton = getByTestId('browseIntegrations.searchBar.sortBtn');

      expect(sortButton).toHaveTextContent('A-Z');
    });
  });

  describe('Content Filter', () => {
    it('renders the content filter button', () => {
      const { getByTestId } = renderSearchAndFiltersBar();
      expect(getByTestId('browseIntegrations.searchBar.contentBtn')).toBeInTheDocument();
    });

    it('does not show active filter indicator when showContent is not set', () => {
      mockUseUrlFilters.mockReturnValue({
        q: undefined,
        sort: undefined,
        status: undefined,
        showContent: undefined,
      });

      const { getByTestId } = renderSearchAndFiltersBar();
      const button = getByTestId('browseIntegrations.searchBar.contentBtn');

      expect(button).not.toHaveClass('euiFilterButton-hasActiveFilters');
    });

    it('shows active filter indicator when showContent is true', () => {
      mockUseUrlFilters.mockReturnValue({
        q: undefined,
        sort: undefined,
        status: undefined,
        showContent: true,
      });

      const { getByTestId } = renderSearchAndFiltersBar();
      const button = getByTestId('browseIntegrations.searchBar.contentBtn');

      expect(button).toHaveClass('euiFilterButton-hasActiveFilters');

      const badge = button.querySelector('.euiNotificationBadge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('1');
    });

    it('calls addUrlFilters with showContent: true when option is checked', async () => {
      const { getByTestId } = renderSearchAndFiltersBar();

      fireEvent.click(getByTestId('browseIntegrations.searchBar.contentBtn'));

      const showOption = getByTestId('browseIntegrations.searchBar.contentShowContentPacksOption');
      fireEvent.click(showOption);

      await waitFor(() => {
        expect(mockAddUrlFilters).toHaveBeenCalledWith({ showContent: true });
      });
    });

    it('calls addUrlFilters with showContent: undefined when option is unchecked', async () => {
      mockUseUrlFilters.mockReturnValue({
        q: undefined,
        sort: undefined,
        status: undefined,
        showContent: true,
      });

      const { getByTestId } = renderSearchAndFiltersBar();

      fireEvent.click(getByTestId('browseIntegrations.searchBar.contentBtn'));

      const showOption = getByTestId('browseIntegrations.searchBar.contentShowContentPacksOption');
      fireEvent.click(showOption);

      await waitFor(() => {
        expect(mockAddUrlFilters).toHaveBeenCalledWith({ showContent: undefined });
      });
    });
  });

  describe('Integration Tests', () => {
    it('all filter components work together', async () => {
      mockUseUrlFilters.mockReturnValue({
        q: 'apache',
        sort: 'a-z',
        status: ['deprecated'],
      });

      const { getByTestId } = renderSearchAndFiltersBar();

      // Search should show query
      const searchInput = getByTestId('epmList.searchBar') as HTMLInputElement;
      expect(searchInput.value).toBe('apache');

      // Status filter should show count
      const statusButton = getByTestId('browseIntegrations.searchBar.statusBtn');
      expect(statusButton).toHaveClass('euiFilterButton-hasActiveFilters');
      const badge = statusButton.querySelector('.euiNotificationBadge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('1');

      // Sort button should show selection
      const sortButton = getByTestId('browseIntegrations.searchBar.sortBtn');
      expect(sortButton).toHaveTextContent('A-Z');
    });
  });
});
