/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import type { LicenseBadgeProps } from './license_badge';
import { LicenseBadge } from './license_badge';

const DEFAULT_PROPS: LicenseBadgeProps = {
  licenseType: 'mit',
  modelDetailsPageUrl: 'https://my-model.ai',
};

describe('LicenseBadge', () => {
  it('renders with link if URL is present', () => {
    renderWithKibanaRenderContext(
      <LicenseBadge
        licenseType={DEFAULT_PROPS.licenseType}
        modelDetailsPageUrl={DEFAULT_PROPS.modelDetailsPageUrl}
      />
    );
    expect(screen.getByRole('link')).toBeInTheDocument();
  });

  it('renders without link if URL is not present', () => {
    renderWithKibanaRenderContext(<LicenseBadge licenseType={DEFAULT_PROPS.licenseType} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
