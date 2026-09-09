/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { ShareUrlIconButton } from './share_url_icon_button';

jest.mock('@elastic/eui', () => ({
  ...jest.requireActual('@elastic/eui'),
  EuiCopy: jest.fn(({ children: functionAsChild }) => functionAsChild(jest.fn())),
}));

describe('ShareUrlIconButton', () => {
  it('renders nothing when url is null', () => {
    const { container } = render(
      <ShareUrlIconButton url={null} tooltip="Share" ariaLabel="Share" dataTestSubj="share-btn" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when url is undefined', () => {
    const { container } = render(
      <ShareUrlIconButton
        url={undefined}
        tooltip="Share"
        ariaLabel="Share"
        dataTestSubj="share-btn"
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a button when url is set', () => {
    const { getByRole } = render(
      <ShareUrlIconButton
        url="https://example.com/alert"
        tooltip="Copy link to alert"
        ariaLabel="Copy link to alert"
        dataTestSubj="share-btn"
      />
    );
    expect(getByRole('button', { name: 'Copy link to alert' })).toBeInTheDocument();
  });

  it('applies the provided data-test-subj', () => {
    const { getByTestId } = render(
      <ShareUrlIconButton
        url="https://example.com/alert"
        tooltip="Share"
        ariaLabel="Share"
        dataTestSubj="my-share-btn"
      />
    );
    expect(getByTestId('my-share-btn')).toBeInTheDocument();
  });
});
