/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import '@testing-library/jest-dom';
import { EuiThemeProvider } from '@elastic/eui';
import { render, screen } from '@testing-library/react';
import type { RetentionOption } from '../retention_selector/types';
import { EditDataLifecycleFlyoutBodyContent } from './edit_data_lifecycle_flyout_body_content';

describe('EditDataLifecycleFlyoutBodyContent', () => {
  const renderWithTheme = (node: React.ReactElement) =>
    render(node, {
      wrapper: EuiThemeProvider,
    });

  it('renders the "ILM not configured" panel when ilm is not provided', () => {
    renderWithTheme(
      <EditDataLifecycleFlyoutBodyContent
        inheritLifecycle={false}
        lifecycleMethod="ilm"
        showLifecycleMethodPicker
        method={{ value: 'ilm', onChange: () => {} }}
      />
    );

    expect(screen.getByTestId('editDataLifecycle-ilmNotConfiguredPanel')).toBeInTheDocument();
  });

  it('renders the "no inherited policy" panel when inheriting and no selected policy exists', () => {
    const retentionOptions: RetentionOption[] = [
      { name: 'policy-a', descriptionParts: ['30d'], inspectable: false },
    ];

    renderWithTheme(
      <EditDataLifecycleFlyoutBodyContent
        inheritLifecycle
        lifecycleMethod="ilm"
        showLifecycleMethodPicker
        method={{ value: 'ilm', onChange: () => {} }}
        ilm={{
          retentionOptions,
          selectedPolicyName: undefined,
          onSelect: () => {},
        }}
      />
    );

    expect(screen.getByTestId('editDataLifecycle-noInheritedPolicyPanel')).toBeInTheDocument();
  });

  it('renders a loading panel when inheriting and inherited lifecycle is still resolving', () => {
    const retentionOptions: RetentionOption[] = [
      { name: 'policy-a', descriptionParts: ['30d'], inspectable: false },
    ];

    renderWithTheme(
      <EditDataLifecycleFlyoutBodyContent
        inheritLifecycle
        lifecycleMethod="ilm"
        showLifecycleMethodPicker
        method={{ value: 'ilm', onChange: () => {} }}
        ilm={{
          retentionOptions,
          selectedPolicyName: undefined,
          isLoadingInherited: true,
          onSelect: () => {},
        }}
      />
    );

    expect(screen.getByTestId('editDataLifecycle-loadingInheritedPanel')).toBeInTheDocument();
  });
});
