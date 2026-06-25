/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';

import { SpaceAvatarInternal } from './space_avatar_internal';

test('renders without crashing', () => {
  const { container } = render(<SpaceAvatarInternal space={{ name: '', id: '' }} />);
  expect(screen.getByTestId('space-avatar-')).toBeInTheDocument();
  expect(container.children[0]).toMatchInlineSnapshot(`
    <div
      aria-label=""
      class="euiAvatar euiAvatar--m euiAvatar--space emotion-euiAvatar-space-m-none"
      data-test-subj="space-avatar-"
      role="img"
      style="background-color: rgb(255, 201, 194); color: rgb(0, 0, 0);"
    >
      <span
        aria-hidden="true"
      />
    </div>
  `);
});

test('renders with a space name entirely made of whitespace', () => {
  const { container } = render(<SpaceAvatarInternal space={{ name: '      ', id: '' }} />);
  expect(screen.getByTestId('space-avatar-')).toBeInTheDocument();
  expect(container.children[0]).toMatchInlineSnapshot(`
    <div
      aria-label=""
      class="euiAvatar euiAvatar--m euiAvatar--space emotion-euiAvatar-space-m-none"
      data-test-subj="space-avatar-"
      role="img"
      style="background-color: rgb(97, 162, 255); color: rgb(0, 0, 0);"
    >
      <span
        aria-hidden="true"
      />
    </div>
  `);
});

test('removes aria-label when instructed not to announce the space name', () => {
  const { container } = render(
    <SpaceAvatarInternal space={{ name: '', id: '' }} announceSpaceName={false} />
  );
  expect(screen.getByTestId('space-avatar-')).toHaveAttribute('aria-hidden', 'true');
  expect(container.children[0]).toMatchInlineSnapshot(`
    <div
      aria-hidden="true"
      aria-label=""
      class="euiAvatar euiAvatar--m euiAvatar--space emotion-euiAvatar-space-m-none"
      data-test-subj="space-avatar-"
      role="img"
      style="background-color: rgb(255, 201, 194); color: rgb(0, 0, 0);"
    >
      <span
        aria-hidden="true"
      />
    </div>
  `);
});
