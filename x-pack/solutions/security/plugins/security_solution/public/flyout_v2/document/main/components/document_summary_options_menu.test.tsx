/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import {
  DOCUMENT_SUMMARY_OPTIONS_MENU_BUTTON_TEST_ID,
  DOCUMENT_SUMMARY_OPTIONS_MENU_PANELS_TEST_ID,
  DocumentSummaryOptionsMenu,
} from './document_summary_options_menu';
import { DOCUMENT_SUMMARY_ANONYMIZE_TOGGLE_TEST_ID } from './anonymization_switch';
import userEvent from '@testing-library/user-event';

describe('DocumentSummaryOptionsMenu', () => {
  it('renders button with the anonymize option', async () => {
    const { getByTestId } = render(
      <DocumentSummaryOptionsMenu
        hasSummary={true}
        showAnonymizedValues={false}
        setShowAnonymizedValues={jest.fn()}
      />
    );

    const button = getByTestId(DOCUMENT_SUMMARY_OPTIONS_MENU_BUTTON_TEST_ID);

    expect(button).toBeInTheDocument();
    await userEvent.click(button);

    expect(getByTestId(DOCUMENT_SUMMARY_ANONYMIZE_TOGGLE_TEST_ID)).toBeInTheDocument();
    expect(getByTestId(DOCUMENT_SUMMARY_OPTIONS_MENU_PANELS_TEST_ID)).toHaveTextContent('Options');
    expect(getByTestId(DOCUMENT_SUMMARY_OPTIONS_MENU_PANELS_TEST_ID)).toHaveTextContent(
      'Show anonymized values'
    );
  });
});
