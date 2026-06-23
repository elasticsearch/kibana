/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';

import { useIsExperimentalFeatureEnabled } from '../common/experimental_features_context';
import { useExportResults } from './use_export_results';
import { ExportResultsButton } from './export_results_button';

jest.mock('../common/experimental_features_context');
jest.mock('./use_export_results');

const useIsExperimentalFeatureEnabledMock = useIsExperimentalFeatureEnabled as jest.MockedFunction<
  typeof useIsExperimentalFeatureEnabled
>;
const useExportResultsMock = useExportResults as jest.MockedFunction<typeof useExportResults>;

const defaultExportMock = {
  exportResults: jest.fn().mockResolvedValue(undefined),
  isExporting: false,
};

// Default total to a non-undefined number so tests that don't exercise the
// "initial loading" branch (where total === undefined) get the button rendered
// in its normal, clickable state. Tests covering loading/empty pass total
// explicitly.
const renderButton = (props: Partial<React.ComponentProps<typeof ExportResultsButton>> = {}) =>
  render(
    <I18nProvider>
      <ExportResultsButton actionId="action-abc" total={100} {...props} />
    </I18nProvider>
  );

describe('ExportResultsButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useIsExperimentalFeatureEnabledMock.mockReturnValue(true);
    useExportResultsMock.mockReturnValue(defaultExportMock);
  });

  describe('feature flag gating', () => {
    it('renders the button when exportResults flag is enabled', () => {
      renderButton();

      expect(screen.getByTestId('osqueryExportResultsButton')).toBeInTheDocument();
    });

    it('renders nothing when exportResults flag is disabled', () => {
      useIsExperimentalFeatureEnabledMock.mockReturnValue(false);
      const { container } = renderButton();

      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('modal lifecycle', () => {
    it('modal is not visible before clicking the button', () => {
      renderButton();

      expect(screen.queryByTestId('osqueryExportResultsModal')).not.toBeInTheDocument();
    });

    it('opens the modal when the button is clicked', () => {
      renderButton();

      fireEvent.click(screen.getByTestId('osqueryExportResultsButton'));

      expect(screen.getByTestId('osqueryExportResultsModal')).toBeInTheDocument();
    });

    it('closes the modal when Cancel is clicked', () => {
      renderButton();

      fireEvent.click(screen.getByTestId('osqueryExportResultsButton'));
      expect(screen.getByTestId('osqueryExportResultsModal')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('osqueryExportCancelButton'));

      expect(screen.queryByTestId('osqueryExportResultsModal')).not.toBeInTheDocument();
    });
  });

  describe('export invocation', () => {
    it('calls exportResults with the correct format and no filters when none are active', () => {
      renderButton({ kuery: undefined, activeFilters: undefined });

      fireEvent.click(screen.getByTestId('osqueryExportResultsButton'));

      fireEvent.click(screen.getByTestId('osqueryExportConfirmButton'));

      expect(defaultExportMock.exportResults).toHaveBeenCalledWith('csv', undefined);
    });

    it('calls exportResults with filters when "Only export filtered" is checked', () => {
      renderButton({ kuery: 'host.name:foo', activeFilters: [] });

      fireEvent.click(screen.getByTestId('osqueryExportResultsButton'));

      fireEvent.click(screen.getByTestId('osqueryExportFormatSelect'));
      fireEvent.click(screen.getByText('NDJSON'));
      fireEvent.click(screen.getByTestId('osqueryExportConfirmButton'));

      expect(defaultExportMock.exportResults).toHaveBeenCalledWith('ndjson', {
        kuery: 'host.name:foo',
        esFilters: undefined,
      });
    });

    it('calls exportResults with no filters when "Only export filtered" is unchecked', () => {
      renderButton({ kuery: 'process.name:bash', activeFilters: [] });

      fireEvent.click(screen.getByTestId('osqueryExportResultsButton'));

      fireEvent.click(screen.getByTestId('osqueryExportFilteredCheckbox'));

      fireEvent.click(screen.getByTestId('osqueryExportFormatSelect'));
      fireEvent.click(screen.getByText('JSON'));
      fireEvent.click(screen.getByTestId('osqueryExportConfirmButton'));

      expect(defaultExportMock.exportResults).toHaveBeenCalledWith('json', undefined);
    });
  });

  describe('loading state', () => {
    it('disables the button while exporting', () => {
      useExportResultsMock.mockReturnValue({ ...defaultExportMock, isExporting: true });
      renderButton();

      const button = screen.getByTestId('osqueryExportResultsButton');
      expect(button).toBeDisabled();
    });

    it('shows the initial-loading spinner before any count has been fetched (total undefined)', () => {
      renderButton({ total: undefined });

      const button = screen.getByTestId('osqueryExportResultsButton');
      expect(button.querySelector('.euiLoadingSpinner')).toBeInTheDocument();
    });

    it('becomes interactive once a non-zero count is known', () => {
      renderButton({ total: 5 });

      const button = screen.getByTestId('osqueryExportResultsButton');
      expect(button).not.toBeDisabled();
      expect(button.querySelector('.euiLoadingSpinner')).not.toBeInTheDocument();
    });

    // The cross-tab guarantee is owned upstream by the pack-row store-clear
    // policy (see pack_queries_status_table.test.tsx) — the count is no longer
    // dropped on a tab switch, so the button can derive its state purely from
    // `total` without latching the last known value.
    it('shows the spinner whenever total is undefined while an export is in progress', () => {
      useExportResultsMock.mockReturnValue({ ...defaultExportMock, isExporting: true });
      renderButton({ total: undefined });

      const button = screen.getByTestId('osqueryExportResultsButton');
      expect(button.querySelector('.euiLoadingSpinner')).toBeInTheDocument();
    });
  });

  describe('empty-result gating', () => {
    it('disables the button when total is 0', () => {
      renderButton({ total: 0 });

      const button = screen.getByTestId('osqueryExportResultsButton');
      expect(button).toBeDisabled();
    });

    it('does not open the modal when the button is clicked with total=0', () => {
      renderButton({ total: 0 });

      fireEvent.click(screen.getByTestId('osqueryExportResultsButton'));

      expect(screen.queryByTestId('osqueryExportResultsModal')).not.toBeInTheDocument();
    });

    it('shows a loading state when total is undefined (initial fetch)', () => {
      renderButton({ total: undefined });

      const button = screen.getByTestId('osqueryExportResultsButton');
      // EuiButtonEmpty disables the underlying button when `isLoading`; the
      // spinner is rendered as a child element.
      expect(button).toBeDisabled();
      expect(button.querySelector('.euiLoadingSpinner')).toBeInTheDocument();
    });

    it('does not open the modal when the button is clicked with total=undefined', () => {
      renderButton({ total: undefined });

      fireEvent.click(screen.getByTestId('osqueryExportResultsButton'));

      expect(screen.queryByTestId('osqueryExportResultsModal')).not.toBeInTheDocument();
    });

    it('leaves the button enabled when total is greater than zero (boundary: 1)', () => {
      renderButton({ total: 1 });

      const button = screen.getByTestId('osqueryExportResultsButton');
      expect(button).not.toBeDisabled();
      expect(button.querySelector('.euiLoadingSpinner')).not.toBeInTheDocument();
    });
  });

  describe('hasActiveFilters wiring', () => {
    it('passes hasActiveFilters=true to the modal when kuery is set', () => {
      renderButton({ kuery: 'host.os.type:linux' });

      fireEvent.click(screen.getByTestId('osqueryExportResultsButton'));

      const checkbox = screen.getByTestId('osqueryExportFilteredCheckbox');
      expect(checkbox).not.toBeDisabled();
      expect(checkbox).toBeChecked();
    });

    it('passes hasActiveFilters=false when no kuery and no active filters', () => {
      renderButton({ kuery: undefined, activeFilters: [] });

      fireEvent.click(screen.getByTestId('osqueryExportResultsButton'));

      const checkbox = screen.getByTestId('osqueryExportFilteredCheckbox');
      expect(checkbox).toBeDisabled();
    });

    it('passes hasActiveFilters=true when activeFilters is non-empty and no kuery', () => {
      const activeFilter = {
        meta: { index: 'logs-*' },
        query: { match_phrase: { 'host.os.type': 'linux' } },
      };
      renderButton({ kuery: undefined, activeFilters: [activeFilter] });

      fireEvent.click(screen.getByTestId('osqueryExportResultsButton'));

      const checkbox = screen.getByTestId('osqueryExportFilteredCheckbox');
      expect(checkbox).not.toBeDisabled();
      expect(checkbox).toBeChecked();
    });
  });
});
