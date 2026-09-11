/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';
import { chromeServiceMock } from '@kbn/core-chrome-browser-mocks';
import { TestChromeProviders } from '../../test_helpers';
import { SearchButton } from './search_button';

jest.mock('@kbn/shared-ux-utility', () => ({
  ...jest.requireActual('@kbn/shared-ux-utility'),
  isMac: true,
  useKeyboardShortcut: jest.fn(),
}));

const { useKeyboardShortcut } = jest.mocked(
  jest.requireMock('@kbn/shared-ux-utility') as typeof import('@kbn/shared-ux-utility')
);

const renderButton = (config?: { onClick: () => void }) => {
  const chrome = chromeServiceMock.createStartContract();
  (chrome.controls.globalSearch.get$ as jest.Mock).mockReturnValue(new BehaviorSubject(config));
  return render(
    <TestChromeProviders chrome={chrome}>
      <SearchButton />
    </TestChromeProviders>
  );
};

describe('SearchButton', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders nothing when no config is set', () => {
    const { container } = renderButton(undefined);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('chromeNextGlobalHeaderSearchButton')).not.toBeInTheDocument();
  });

  it('renders the search button when config is provided', () => {
    renderButton({ onClick: jest.fn() });
    expect(screen.getByTestId('chromeNextGlobalHeaderSearchButton')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = jest.fn();
    renderButton({ onClick });

    fireEvent.click(screen.getByTestId('chromeNextGlobalHeaderSearchButton'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('registers keyboard shortcut', () => {
    const onClick = jest.fn();
    renderButton({ onClick });

    expect(useKeyboardShortcut).toHaveBeenCalledWith({ key: '/', meta: true }, onClick);
  });
});
