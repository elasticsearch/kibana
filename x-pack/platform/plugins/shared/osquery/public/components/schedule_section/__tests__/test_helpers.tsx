/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import type { RenderOptions, RenderResult } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { EuiProvider } from '@elastic/eui';
import type { ExperimentalFeatures } from '../../../../common/experimental_features';
import { allowedExperimentalValues } from '../../../../common/experimental_features';
import { ExperimentalFeaturesProvider } from '../../../common/experimental_features_context';

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /**
   * Experimental-feature flags supplied to `ExperimentalFeaturesProvider`.
   * Defaults to `allowedExperimentalValues`; tests that exercise the
   * `rruleScheduling` gate pass an override.
   */
  experimentalFeatures?: ExperimentalFeatures;
}

export const renderWithProviders = (
  ui: React.ReactElement,
  options?: RenderWithProvidersOptions
): RenderResult => {
  const { experimentalFeatures = allowedExperimentalValues, ...renderOptions } = options ?? {};

  return render(ui, {
    wrapper: ({ children }) => (
      <EuiProvider>
        <ExperimentalFeaturesProvider value={experimentalFeatures}>
          <IntlProvider locale="en">{children}</IntlProvider>
        </ExperimentalFeaturesProvider>
      </EuiProvider>
    ),
    ...renderOptions,
  });
};
