/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import {
  DOCUMENT_SUMMARY_ANONYMIZE_TOGGLE_TEST_ID,
  AnonymizationSwitch,
} from './anonymization_switch';

const renderAnonymizedSwitch = ({
  hasSummary,
  showAnonymizedValues,
  setShowAnonymizedValues,
}: {
  hasSummary: boolean;
  showAnonymizedValues: boolean | undefined;
  setShowAnonymizedValues: jest.Mock;
}) =>
  render(
    <AnonymizationSwitch
      hasSummary={hasSummary}
      showAnonymizedValues={showAnonymizedValues}
      setShowAnonymizedValues={setShowAnonymizedValues}
    />
  );

describe('AnonymizationSwitch', () => {
  let mockSetShowAnonymizedValues: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetShowAnonymizedValues = jest.fn();
  });

  it('should render the switch in the unchecked state by default', () => {
    const { getByTestId } = renderAnonymizedSwitch({
      hasSummary: true,
      showAnonymizedValues: false,
      setShowAnonymizedValues: mockSetShowAnonymizedValues,
    });

    expect(getByTestId(DOCUMENT_SUMMARY_ANONYMIZE_TOGGLE_TEST_ID)).not.toBeChecked();
  });

  it('should call setShowAnonymizedValues with true when the switch is toggled on', () => {
    const { getByTestId } = renderAnonymizedSwitch({
      hasSummary: true,
      showAnonymizedValues: false,
      setShowAnonymizedValues: mockSetShowAnonymizedValues,
    });

    fireEvent.click(getByTestId(DOCUMENT_SUMMARY_ANONYMIZE_TOGGLE_TEST_ID));

    expect(mockSetShowAnonymizedValues).toHaveBeenCalledWith(true);
  });

  it('should call setShowAnonymizedValues with false when the switch is toggled off', () => {
    const { getByTestId } = renderAnonymizedSwitch({
      hasSummary: true,
      showAnonymizedValues: true,
      setShowAnonymizedValues: mockSetShowAnonymizedValues,
    });

    fireEvent.click(getByTestId(DOCUMENT_SUMMARY_ANONYMIZE_TOGGLE_TEST_ID));

    expect(mockSetShowAnonymizedValues).toHaveBeenCalledWith(false);
  });

  it('should not render the switch if showAnonymizedValues is undefined', () => {
    const { queryByTestId } = renderAnonymizedSwitch({
      hasSummary: true,
      showAnonymizedValues: undefined,
      setShowAnonymizedValues: mockSetShowAnonymizedValues,
    });

    expect(queryByTestId(DOCUMENT_SUMMARY_ANONYMIZE_TOGGLE_TEST_ID)).not.toBeInTheDocument();
  });

  it('should enable the switch when hasSummary is true', () => {
    const { getByTestId } = renderAnonymizedSwitch({
      hasSummary: true,
      showAnonymizedValues: false,
      setShowAnonymizedValues: mockSetShowAnonymizedValues,
    });

    expect(getByTestId(DOCUMENT_SUMMARY_ANONYMIZE_TOGGLE_TEST_ID)).not.toBeDisabled();
  });

  it('should disable the switch when hasSummary is false', () => {
    const { getByTestId } = renderAnonymizedSwitch({
      hasSummary: false,
      showAnonymizedValues: false,
      setShowAnonymizedValues: mockSetShowAnonymizedValues,
    });

    expect(getByTestId(DOCUMENT_SUMMARY_ANONYMIZE_TOGGLE_TEST_ID)).toBeDisabled();
  });
});
