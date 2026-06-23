/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithI18n } from '@kbn/test-jest-helpers';
import { FrozenEnterpriseRequiredCallout } from './frozen_enterprise_required_callout';

describe('FrozenEnterpriseRequiredCallout', () => {
  it('renders the callout title and body', () => {
    renderWithI18n(<FrozenEnterpriseRequiredCallout calloutTestSubj="callout" />);

    expect(screen.getByTestId('callout')).toBeInTheDocument();
    expect(screen.getByText('Enterprise license required for frozen phase')).toBeInTheDocument();
  });

  it('does not render the upgrade button when onUpgradeEnterprise is not provided', () => {
    renderWithI18n(<FrozenEnterpriseRequiredCallout upgradeButtonTestSubj="upgrade" />);

    expect(screen.queryByTestId('upgrade')).not.toBeInTheDocument();
  });

  it('renders the upgrade button and calls onUpgradeEnterprise when clicked', () => {
    const onUpgradeEnterprise = jest.fn();

    renderWithI18n(
      <FrozenEnterpriseRequiredCallout
        onUpgradeEnterprise={onUpgradeEnterprise}
        upgradeButtonTestSubj="upgrade"
      />
    );

    fireEvent.click(screen.getByTestId('upgrade'));
    expect(onUpgradeEnterprise).toHaveBeenCalled();
  });
});
