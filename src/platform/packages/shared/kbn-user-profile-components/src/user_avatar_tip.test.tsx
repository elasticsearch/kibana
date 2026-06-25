/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { render } from '@testing-library/react';
import React from 'react';

import { UserAvatarTip } from './user_avatar_tip';

describe('UserAvatarTip', () => {
  it('should render UserToolTip correctly with UserAvatar', () => {
    const { container } = render(
      <UserAvatarTip
        user={{
          username: 'delighted_nightingale',
          email: 'delighted_nightingale@elastic.co',
          full_name: 'Delighted Nightingale',
        }}
        avatar={{
          color: '#09e8ca',
          initials: 'DN',
          imageUrl: 'https://source.unsplash.com/64x64/?cat',
        }}
      />
    );
    expect(container.children[0]).toMatchInlineSnapshot(`
      <span
        class="euiToolTipAnchor emotion-euiToolTipAnchor-inlineBlock"
        id="generated-id-wrapper"
      >
        <span
          class="euiToolTipAnchor emotion-euiToolTipAnchor-inlineBlock-user"
          id="generated-id_euiToolTipAnchor"
        >
          <div
            aria-label="Delighted Nightingale (delighted_nightingale@elastic.co)"
            class="euiAvatar euiAvatar--m euiAvatar--user emotion-euiAvatar-user-m-uppercase-plain"
            role="img"
            style="background-image: url(https://source.unsplash.com/64x64/?cat);"
          />
        </span>
      </span>
    `);
  });

  it('should not render UserToolTip when user is not set', () => {
    const { container } = render(<UserAvatarTip />);
    expect(container.children[0]).toMatchInlineSnapshot(`
      <div
        aria-label=""
        class="euiAvatar euiAvatar--m euiAvatar--user emotion-euiAvatar-user-m-uppercase"
        role="img"
        style="background-color: rgb(236, 241, 249); color: rgb(0, 0, 0);"
      >
        <span
          aria-hidden="true"
        >
          ?
        </span>
      </div>
    `);
  });
});
