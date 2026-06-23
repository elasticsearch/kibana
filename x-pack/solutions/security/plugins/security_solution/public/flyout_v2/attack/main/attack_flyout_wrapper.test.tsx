/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { useAttackDetails } from '../../../flyout/attack_details/hooks/use_attack_details';
import { AttackFlyoutWrapper } from './attack_flyout_wrapper';

jest.mock('../../../flyout/attack_details/hooks/use_attack_details');

const mockAttackFlyout = jest.fn((_props: unknown) => <div data-test-subj="attackFlyoutStub" />);
jest.mock('.', () => ({
  AttackFlyout: (props: unknown) => mockAttackFlyout(props),
}));

const mockSearchHit = {
  _id: 'attack-1',
  _index: '.alerts-security.attack-discovery.alerts-default',
  _source: {},
  fields: {},
};

const renderWrapper = (props: Partial<React.ComponentProps<typeof AttackFlyoutWrapper>> = {}) =>
  render(
    <AttackFlyoutWrapper
      attackId="attack-1"
      indexName=".alerts-security.attack-discovery.alerts-default"
      onAttackUpdated={jest.fn()}
      {...props}
    />
  );

describe('<AttackFlyoutWrapper />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders FlyoutLoading while useAttackDetails is loading', () => {
    (useAttackDetails as jest.Mock).mockReturnValue({ loading: true, searchHit: undefined });

    const { getByTestId } = renderWrapper();

    expect(getByTestId('attack-flyout-wrapper-loading')).toBeInTheDocument();
  });

  it('renders error callout when useAttackDetails returns no searchHit after loading', () => {
    (useAttackDetails as jest.Mock).mockReturnValue({ loading: false, searchHit: undefined });

    const { getByTestId } = renderWrapper();

    expect(getByTestId('attack-flyout-wrapper-error')).toBeInTheDocument();
  });

  it('renders AttackFlyout when searchHit is available', () => {
    (useAttackDetails as jest.Mock).mockReturnValue({ loading: false, searchHit: mockSearchHit });

    const { getByTestId } = renderWrapper();

    expect(getByTestId('attackFlyoutStub')).toBeInTheDocument();
  });

  it('passes onAttackUpdated to AttackFlyout', () => {
    const onAttackUpdated = jest.fn();
    (useAttackDetails as jest.Mock).mockReturnValue({ loading: false, searchHit: mockSearchHit });

    renderWrapper({ onAttackUpdated });

    expect(mockAttackFlyout).toHaveBeenCalledWith(expect.objectContaining({ onAttackUpdated }));
  });

  it('calls useAttackDetails with the provided attackId and indexName', () => {
    (useAttackDetails as jest.Mock).mockReturnValue({ loading: true, searchHit: undefined });

    renderWrapper({ attackId: 'my-attack', indexName: 'my-index' });

    expect(useAttackDetails).toHaveBeenCalledWith({ attackId: 'my-attack', indexName: 'my-index' });
  });
});
