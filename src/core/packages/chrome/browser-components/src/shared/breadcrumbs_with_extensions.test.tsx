/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import '@testing-library/jest-dom';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';
import type { ChromeBreadcrumbsAppendExtension } from '@kbn/core-chrome-browser';
import { chromeServiceMock } from '@kbn/core-chrome-browser-mocks';
import { TestChromeProviders } from '../test_helpers';
import { BreadcrumbsWithExtensionsWrapper } from './breadcrumbs_with_extensions';

const renderWithChrome = (extensions: ChromeBreadcrumbsAppendExtension[]) => {
  const chrome = chromeServiceMock.createStartContract();
  const extensions$ = new BehaviorSubject<ChromeBreadcrumbsAppendExtension[]>(extensions);
  chrome.getBreadcrumbsAppendExtensionsWithBadges$.mockReturnValue(extensions$);
  return {
    extensions$,
    ...render(
      <TestChromeProviders chrome={chrome}>
        <BreadcrumbsWithExtensionsWrapper>
          <span data-test-subj="breadcrumb-child">Home</span>
        </BreadcrumbsWithExtensionsWrapper>
      </TestChromeProviders>
    ),
  };
};

describe('BreadcrumbsWithExtensionsWrapper', () => {
  it('renders children without extensions when the observable emits empty array', () => {
    renderWithChrome([]);
    expect(screen.getByTestId('breadcrumb-child')).toBeInTheDocument();
  });

  it('renders a ReactNode-based extension alongside children', () => {
    renderWithChrome([{ content: <span data-test-subj="react-extension">Badge</span> }]);
    expect(screen.getByTestId('breadcrumb-child')).toBeInTheDocument();
    expect(screen.getByTestId('react-extension')).toBeInTheDocument();
    expect(screen.getByTestId('react-extension').parentElement).toHaveClass(
      'header__breadcrumbsAppendExtension--first'
    );
  });

  it('renders a content extension alongside children', () => {
    renderWithChrome([{ content: <span data-test-subj="content-extension">Badge</span> }]);
    expect(screen.getByTestId('breadcrumb-child')).toBeInTheDocument();
    expect(screen.getByTestId('content-extension')).toBeInTheDocument();
  });

  it('renders updated extensions when the observable emits new values', () => {
    const { extensions$ } = renderWithChrome([]);
    expect(screen.queryByTestId('react-extension')).not.toBeInTheDocument();

    act(() => {
      extensions$.next([{ content: <span data-test-subj="react-extension">Badge</span> }]);
    });

    expect(screen.getByTestId('react-extension')).toBeInTheDocument();
  });
});
