/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues } from '../../__mocks__/kea_logic';

import React from 'react';

import { screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { ManageLicenseButton } from '.';

describe('ManageLicenseButton', () => {
  describe('when the user can access license management', () => {
    it('renders a SPA link to the license management plugin', () => {
      setMockValues({ canManageLicense: true });
      renderWithKibanaRenderContext(<ManageLicenseButton />);

      expect(screen.getByRole('link', { name: 'Manage your license' })).toHaveAttribute(
        'href',
        '/app/management/stack/license_management'
      );
    });
  });

  describe('when the user cannot access license management', () => {
    it('renders an external link to our license management documentation', () => {
      setMockValues({ canManageLicense: false });
      renderWithKibanaRenderContext(<ManageLicenseButton />);

      expect(
        screen.getByRole('button', { name: 'Learn more about license features' })
      ).toBeInTheDocument();
    });
  });
});
