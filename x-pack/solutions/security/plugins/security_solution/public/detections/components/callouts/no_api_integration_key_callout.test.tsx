/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';

import {
  NO_INTEGRATION_CALLOUT_DISMISS_BUTTON_TEST_ID,
  NO_INTEGRATION_CALLOUT_TEST_ID,
  NoApiIntegrationKeyCallOut,
} from './no_api_integration_key_callout';
import { useUserData } from '../user_info';

jest.mock('../user_info');

describe('NoApiIntegrationKeyCallOut', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show callout', () => {
    (useUserData as jest.Mock).mockReturnValue([{ hasEncryptionKey: false }]);

    const { getByTestId } = render(<NoApiIntegrationKeyCallOut />);

    expect(getByTestId(NO_INTEGRATION_CALLOUT_TEST_ID)).toHaveTextContent(
      'API integration key required'
    );
    expect(getByTestId(NO_INTEGRATION_CALLOUT_TEST_ID)).toHaveTextContent(
      'A new encryption key is generated for saved objects each time you start Kibana. Without a persistent key, you cannot delete or modify rules after Kibana restarts. To set a persistent key, add the xpack.encryptedSavedObjects.encryptionKey setting with any text value of 32 or more characters to the kibana.yml file.'
    );
    expect(getByTestId(NO_INTEGRATION_CALLOUT_DISMISS_BUTTON_TEST_ID)).toBeInTheDocument();
  });

  it('should hide callout if hasEncryptionKey is true', () => {
    (useUserData as jest.Mock).mockReturnValue([{ hasEncryptionKey: true }]);

    const { queryByTestId } = render(<NoApiIntegrationKeyCallOut />);

    expect(queryByTestId(NO_INTEGRATION_CALLOUT_TEST_ID)).not.toBeInTheDocument();
  });

  it('should hide when dismiss button is clicked', async () => {
    (useUserData as jest.Mock).mockReturnValue([{ hasEncryptionKey: false }]);

    const { getByTestId, queryByTestId } = render(<NoApiIntegrationKeyCallOut />);

    const button = getByTestId(NO_INTEGRATION_CALLOUT_DISMISS_BUTTON_TEST_ID);

    expect(button).toBeInTheDocument();

    fireEvent.click(button);

    await waitFor(() => {
      expect(queryByTestId(NO_INTEGRATION_CALLOUT_DISMISS_BUTTON_TEST_ID)).not.toBeInTheDocument();
    });
  });
});
