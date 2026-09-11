/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiSwitch } from '@elastic/eui';
import { createAppRootMockRenderer } from '../../../../../../common/mock/endpoint';
import { PerOsSettingCard } from './per_os_setting_card';

describe('PerOsSettingCard', () => {
  it('renders title, description, and the master toggle without the legacy header', () => {
    const render = createAppRootMockRenderer();
    const result = render.render(
      <PerOsSettingCard
        title="Malware"
        description="Set malware detection and prevention levels for your endpoints."
        rightCorner={
          <EuiSwitch
            label="Malware protections"
            showLabel={false}
            checked={true}
            onChange={jest.fn()}
          />
        }
      >
        <span>{'Windows row'}</span>
      </PerOsSettingCard>
    );

    expect(result.getByRole('heading', { name: 'Malware' })).toBeInTheDocument();
    expect(
      result.getByText('Set malware detection and prevention levels for your endpoints.')
    ).toBeInTheDocument();
    expect(result.getByRole('switch', { name: 'Malware protections' })).toBeInTheDocument();
    expect(result.queryByText('Type')).not.toBeInTheDocument();
    expect(result.queryByText('Operating system')).not.toBeInTheDocument();
  });

  it('keeps rows visible in edit mode when the card is not selected', () => {
    const render = createAppRootMockRenderer();
    const result = render.render(
      <PerOsSettingCard title="Malware" description="Description" selected={false} mode="edit">
        <span>{'Windows row'}</span>
      </PerOsSettingCard>
    );

    expect(result.getByText('Windows row')).toBeInTheDocument();
  });
});
