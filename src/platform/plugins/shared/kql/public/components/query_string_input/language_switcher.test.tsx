/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import type { QueryLanguageSwitcherProps } from './language_switcher';
import { QueryLanguageSwitcher } from './language_switcher';
import { coreMock } from '@kbn/core/public/mocks';
import { renderWithI18n } from '@kbn/test-jest-helpers';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const startMock = coreMock.createStart();

async function renderSwitcher(testProps: Omit<QueryLanguageSwitcherProps, 'deps'>) {
  const result = renderWithI18n(
    <QueryLanguageSwitcher {...testProps} deps={{ docLinks: startMock.docLinks }} />
  );
  // Wait for component to be fully rendered
  await waitFor(() => expect(screen.getByRole('button')).toBeInTheDocument());
  return result;
}

describe('LanguageSwitcher', () => {
  it('should select the lucene context menu if language is lucene', async () => {
    await renderSwitcher({ language: 'lucene', onSelectLanguage: jest.fn() });

    await userEvent.click(screen.getByRole('button'));
    expect(
      screen.getByTestId('luceneLanguageMenuItem').querySelector('[data-euiicon-type="check"]')
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: /Documentation/i })).toHaveAttribute(
      'href',
      startMock.docLinks.links.query.luceneQuerySyntax
    );
  });

  it('should select the kql context menu if language is kuery', async () => {
    await renderSwitcher({ language: 'kuery', onSelectLanguage: jest.fn() });
    await userEvent.click(screen.getByRole('button'));
    expect(
      screen.getByTestId('kqlLanguageMenuItem').querySelector('[data-euiicon-type="check"]')
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: /Documentation/i })).toHaveAttribute(
      'href',
      startMock.docLinks.links.query.kueryQuerySyntax
    );
  });

  it('should select the lucene context menu if language is text', async () => {
    await renderSwitcher({ language: 'text', onSelectLanguage: jest.fn() });

    await userEvent.click(screen.getByRole('button'));
    expect(
      screen.getByTestId('luceneLanguageMenuItem').querySelector('[data-euiicon-type="check"]')
    ).toBeTruthy();
  });
  it('it set language on nonKql mode text', async () => {
    const onSelectLanguage = jest.fn();
    await renderSwitcher({
      language: 'kuery',
      nonKqlMode: 'text',
      onSelectLanguage,
    });
    await userEvent.click(screen.getByRole('button'));
    expect(
      screen.getByTestId('kqlLanguageMenuItem').querySelector('[data-euiicon-type="check"]')
    ).toBeTruthy();
    expect(
      screen.getByTestId('luceneLanguageMenuItem').querySelector('[data-euiicon-type="check"]')
    ).toBeFalsy();
    fireEvent.click(screen.getByTestId('luceneLanguageMenuItem'));

    expect(onSelectLanguage).toHaveBeenCalledWith('text');
  });
  it('it set language on nonKql mode lucene', async () => {
    const onSelectLanguage = jest.fn();

    await renderSwitcher({
      language: 'kuery',
      nonKqlMode: 'lucene',
      onSelectLanguage,
    });
    await userEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByTestId('luceneLanguageMenuItem'));
    expect(onSelectLanguage).toHaveBeenCalledWith('lucene');
  });

  it('it set language on kuery mode with nonKqlMode text', async () => {
    const onSelectLanguage = jest.fn();

    await renderSwitcher({
      language: 'text',
      nonKqlMode: 'text',
      onSelectLanguage,
    });

    await userEvent.click(screen.getByRole('button'));
    expect(
      screen.getByTestId('luceneLanguageMenuItem').querySelector('[data-euiicon-type="check"]')
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: /Documentation/i })).toHaveAttribute(
      'href',
      startMock.docLinks.links.query.luceneQuerySyntax
    );

    fireEvent.click(screen.getByTestId('kqlLanguageMenuItem'));
    expect(onSelectLanguage).toHaveBeenCalledWith('kuery');
  });

  it('it set language on kuery mode with nonKqlMode lucene', async () => {
    const onSelectLanguage = jest.fn();

    await renderSwitcher({
      language: 'lucene',
      nonKqlMode: 'lucene',
      onSelectLanguage,
    });

    await userEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByTestId('luceneLanguageMenuItem'));
    expect(
      screen.getByTestId('luceneLanguageMenuItem').querySelector('[data-euiicon-type="check"]')
    ).toBeTruthy();

    fireEvent.click(screen.getByTestId('kqlLanguageMenuItem'));

    expect(onSelectLanguage).toHaveBeenCalledWith('kuery');
  });
});
