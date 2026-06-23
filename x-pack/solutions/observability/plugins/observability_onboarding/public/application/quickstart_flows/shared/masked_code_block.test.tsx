/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { renderWithHostPageProviders } from '../../pages/host/__tests__/test_helpers';
import { MaskedCodeBlock, maskSecretValues } from './masked_code_block';

jest.mock('@elastic/eui', () => ({
  ...jest.requireActual('@elastic/eui'),
  EuiButtonIcon: ({
    'aria-label': ariaLabel,
    'aria-pressed': ariaPressed,
    'data-test-subj': dataTestSubj,
    iconType,
    onClick,
  }: {
    'aria-label': string;
    'aria-pressed'?: boolean;
    'data-test-subj'?: string;
    iconType: string;
    onClick: () => void;
  }) => (
    <button
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      data-icon-type={iconType}
      data-test-subj={dataTestSubj}
      onClick={onClick}
    />
  ),
  EuiCodeBlock: ({
    children,
    overflowHeight,
    'data-test-subj': dataTestSubj,
  }: {
    children: React.ReactNode;
    overflowHeight?: number | string;
    'data-test-subj'?: string;
  }) => (
    <div data-test-subj={dataTestSubj}>
      {children}
      {overflowHeight ? <button>Expand</button> : null}
    </div>
  ),
  EuiCopy: ({
    textToCopy,
    children,
  }: {
    textToCopy: string;
    children: (copy: () => void) => React.ReactNode;
  }) => (
    <span data-test-subj="mockEuiCopy" data-text-to-copy={textToCopy}>
      {children(jest.fn())}
    </span>
  ),
}));

describe('MaskedCodeBlock', () => {
  it('masks secret values in displayed snippets', () => {
    const snippet = "curl -H 'Authorization: ApiKey real-api-key' https://elastic.example";

    expect(maskSecretValues(snippet, ['real-api-key', 'https://elastic.example'])).toBe(
      "curl -H 'Authorization: ApiKey ********' ********"
    );
  });

  it('masks longer overlapping secrets first', () => {
    expect(maskSecretValues('token-abc token', ['token', 'token-abc'])).toBe('******** ********');
  });

  it('hides secrets by default while copying the unmasked snippet from compact controls', async () => {
    const snippet = "kubectl create secret --from-literal=api_key='real-api-key'";

    renderWithHostPageProviders(
      <MaskedCodeBlock
        value={snippet}
        secrets={['real-api-key']}
        language="bash"
        overflowHeight={300}
        dataTestSubj="testMaskedSnippet"
      />
    );

    expect(screen.getByTestId('testMaskedSnippet')).toHaveTextContent(
      "kubectl create secret --from-literal=api_key='********'"
    );
    expect(screen.queryByText(/real-api-key/)).not.toBeInTheDocument();
    expect(screen.queryByText('Copy to clipboard')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Expand' })).not.toBeInTheDocument();
    expect(screen.getByTestId('testMaskedSnippetCopyButtonIcon')).toBeInTheDocument();
    expect(screen.getByTestId('mockEuiCopy')).toHaveAttribute('data-text-to-copy', snippet);
    expect(screen.getByTestId('testMaskedSnippetShowSecretsButton')).toHaveAttribute(
      'data-icon-type',
      'eye'
    );

    await userEvent.click(screen.getByTestId('testMaskedSnippetShowSecretsButton'));

    expect(screen.getByTestId('testMaskedSnippet')).toHaveTextContent(snippet);
    expect(screen.getByTestId('testMaskedSnippetShowSecretsButton')).toHaveAttribute(
      'data-icon-type',
      'eyeSlash'
    );
  });
});
