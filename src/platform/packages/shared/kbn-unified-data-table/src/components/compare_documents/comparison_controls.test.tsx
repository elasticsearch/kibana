/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { EuiThemeProvider } from '@elastic/eui';
import type { ComparisonControlsProps } from './comparison_controls';
import { ComparisonControls } from './comparison_controls';
import type { DocumentDiffMode } from './types';

const renderComparisonControls = ({
  isPlainRecord = false,
  forceShowAllFields = false,
}: {
  isPlainRecord?: ComparisonControlsProps['isPlainRecord'];
  forceShowAllFields?: ComparisonControlsProps['forceShowAllFields'];
} = {}) => {
  const selectedDocIds = ['0', '1', '2'];
  const Wrapper = () => {
    const [showDiff, setShowDiff] = useState(true);
    const [diffMode, setDiffMode] = useState<DocumentDiffMode>('basic');
    const [showDiffDecorations, setShowDiffDecorations] = useState(true);
    const [showMatchingValues, setShowMatchingValues] = useState(true);
    const [showAllFields, setShowAllFields] = useState(true);
    const [isCompareActive, setIsCompareActive] = useState(true);
    return (
      <>
        {isCompareActive && <span>Comparison active</span>}
        <EuiThemeProvider>
          <IntlProvider locale="en">
            <ComparisonControls
              isPlainRecord={isPlainRecord}
              selectedDocIds={selectedDocIds}
              showDiff={showDiff}
              diffMode={diffMode}
              showDiffDecorations={showDiffDecorations}
              showMatchingValues={showMatchingValues}
              showAllFields={showAllFields}
              forceShowAllFields={forceShowAllFields}
              setIsCompareActive={setIsCompareActive}
              setShowDiff={setShowDiff}
              setDiffMode={setDiffMode}
              setShowDiffDecorations={setShowDiffDecorations}
              setShowMatchingValues={setShowMatchingValues}
              setShowAllFields={setShowAllFields}
            />
          </IntlProvider>
        </EuiThemeProvider>
      </>
    );
  };
  render(<Wrapper />);
  const getComparisonSettingsButton = () =>
    screen.getByTestId('unifiedDataTableComparisonSettings');
  const getShowDiffSwitch = () => screen.getByTestId('unifiedDataTableShowDiffSwitch');
  const getDiffModeEntry = (mode: DocumentDiffMode) =>
    screen.getByTestId(`unifiedDataTableDiffMode-${mode}`);
  const getShowAllFieldsSwitch = () =>
    screen.queryByTestId('unifiedDataTableDiffOptionSwitch-showAllFields');
  const getShowMatchingValuesSwitch = () =>
    screen.getByTestId('unifiedDataTableDiffOptionSwitch-showMatchingValues');
  const getShowDiffDecorationsSwitch = () =>
    screen.getByTestId('unifiedDataTableDiffOptionSwitch-showDiffDecorations');
  return {
    getComparisonCountDisplay: () =>
      screen.getByText(
        `Comparing ${selectedDocIds.length} ${isPlainRecord ? 'results' : 'documents'}`
      ),
    getComparisonSettingsButton,
    clickComparisonSettingsButton: async () => await userEvent.click(getComparisonSettingsButton()),
    getShowDiffSwitch,
    clickShowDiffSwitch: async () =>
      await userEvent.click(getShowDiffSwitch(), { pointerEventsCheck: 0 }),
    clickDiffModeFullValueButton: async () =>
      await userEvent.click(getDiffModeEntry('basic'), {
        pointerEventsCheck: 0,
      }),
    clickDiffModeByCharacterButton: async () =>
      await userEvent.click(getDiffModeEntry('chars'), {
        pointerEventsCheck: 0,
      }),
    clickDiffModeByWordButton: async () =>
      await userEvent.click(getDiffModeEntry('words'), {
        pointerEventsCheck: 0,
      }),
    clickDiffModeByLineButton: async () =>
      await userEvent.click(getDiffModeEntry('lines'), {
        pointerEventsCheck: 0,
      }),
    getDiffModeEntry,
    diffModeIsSelected: (mode: DocumentDiffMode) =>
      getDiffModeEntry(mode).getAttribute('aria-current') === 'true',
    getShowAllFieldsSwitch,
    clickShowAllFieldsSwitch: async () => {
      const fieldSwitch = getShowAllFieldsSwitch();
      if (fieldSwitch) {
        await userEvent.click(fieldSwitch, { pointerEventsCheck: 0 });
      }
    },
    getShowMatchingValuesSwitch,
    clickShowMatchingValuesSwitch: async () =>
      await userEvent.click(getShowMatchingValuesSwitch(), { pointerEventsCheck: 0 }),
    getShowDiffDecorationsSwitch,
    clickShowDiffDecorationsSwitch: async () =>
      await userEvent.click(getShowDiffDecorationsSwitch(), { pointerEventsCheck: 0 }),
    getExitComparisonButton: () => screen.getByTestId('unifiedDataTableExitDocumentComparison'),
    isCompareActive: () => screen.queryByText('Comparison active') !== null,
  };
};

describe('ComparisonControls', () => {
  it('should render', () => {
    const result = renderComparisonControls();
    expect(result.getComparisonCountDisplay()).toBeInTheDocument();
    expect(result.getComparisonSettingsButton()).toBeInTheDocument();
    expect(result.getExitComparisonButton()).toBeInTheDocument();
  });

  it('should render with isPlainRecord = true', () => {
    const result = renderComparisonControls({ isPlainRecord: true });
    expect(result.getComparisonCountDisplay()).toBeInTheDocument();
    expect(result.getComparisonSettingsButton()).toBeInTheDocument();
    expect(result.getExitComparisonButton()).toBeInTheDocument();
  });

  it('should allow toggling show diff switch', async () => {
    const result = renderComparisonControls();
    await result.clickComparisonSettingsButton();
    expect(result.getShowDiffSwitch()).toBeChecked();
    expect(result.getDiffModeEntry('basic')).toBeEnabled();
    expect(result.getDiffModeEntry('chars')).toBeEnabled();
    expect(result.getDiffModeEntry('words')).toBeEnabled();
    expect(result.getDiffModeEntry('lines')).toBeEnabled();
    expect(result.getShowDiffDecorationsSwitch()).toBeEnabled();
    await result.clickShowDiffSwitch();
    expect(result.getShowDiffSwitch()).not.toBeChecked();
    expect(result.getDiffModeEntry('basic')).toBeDisabled();
    expect(result.getDiffModeEntry('chars')).toBeDisabled();
    expect(result.getDiffModeEntry('words')).toBeDisabled();
    expect(result.getDiffModeEntry('lines')).toBeDisabled();
    expect(result.getShowDiffDecorationsSwitch()).toBeDisabled();
    await result.clickShowDiffSwitch();
    expect(result.getShowDiffSwitch()).toBeChecked();
  });

  it('should allow changing diff mode', async () => {
    const result = renderComparisonControls();
    await result.clickComparisonSettingsButton();
    expect(result.diffModeIsSelected('basic')).toBe(true);
    await result.clickDiffModeByCharacterButton();
    expect(result.diffModeIsSelected('chars')).toBe(true);
    await result.clickDiffModeByWordButton();
    expect(result.diffModeIsSelected('words')).toBe(true);
    await result.clickDiffModeByLineButton();
    expect(result.diffModeIsSelected('lines')).toBe(true);
    await result.clickDiffModeFullValueButton();
    expect(result.diffModeIsSelected('basic')).toBe(true);
  });

  it('should allow toggling options', async () => {
    const result = renderComparisonControls();
    await result.clickComparisonSettingsButton();
    expect(result.getShowAllFieldsSwitch()).toBeChecked();
    expect(result.getShowMatchingValuesSwitch()).toBeChecked();
    expect(result.getShowDiffDecorationsSwitch()).toBeChecked();
    await result.clickShowAllFieldsSwitch();
    expect(result.getShowAllFieldsSwitch()).not.toBeChecked();
    await result.clickShowMatchingValuesSwitch();
    expect(result.getShowMatchingValuesSwitch()).not.toBeChecked();
    await result.clickShowDiffDecorationsSwitch();
    expect(result.getShowDiffDecorationsSwitch()).not.toBeChecked();
  });

  it('should hide showAllFields switch when forceShowAllFields is true', () => {
    const result = renderComparisonControls({ forceShowAllFields: true });
    expect(result.getShowAllFieldsSwitch()).not.toBeInTheDocument();
  });

  it('should exit comparison mode', async () => {
    const result = renderComparisonControls();
    expect(result.isCompareActive()).toBe(true);
    await userEvent.click(result.getExitComparisonButton());
    expect(result.isCompareActive()).toBe(false);
  });
});
