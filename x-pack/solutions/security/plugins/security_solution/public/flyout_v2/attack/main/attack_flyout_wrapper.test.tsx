/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { useAttackDetails } from '../../../flyout/attack_details/hooks/use_attack_details';
import { AttackFlyoutWrapper } from './attack_flyout_wrapper';

jest.mock('../../../flyout/attack_details/hooks/use_attack_details');

const mockAttackFlyout = jest.fn((props: { onAttackUpdated?: () => void }) => (
  <button
    type="button"
    data-test-subj="attackFlyoutStub"
    onClick={() => props.onAttackUpdated?.()}
  />
));
jest.mock('.', () => ({
  AttackFlyout: (props: unknown) => mockAttackFlyout(props as { onAttackUpdated?: () => void }),
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

  it('renders FlyoutLoading on the initial fetch when there is no hit yet', () => {
    (useAttackDetails as jest.Mock).mockReturnValue({
      loading: true,
      searchHit: undefined,
      attack: null,
      refetch: jest.fn(),
    });

    const { getByTestId } = renderWrapper();

    expect(getByTestId('attack-flyout-wrapper-loading')).toBeInTheDocument();
  });

  it('keeps the flyout visible during a refetch (loading=true while hit is already available)', () => {
    (useAttackDetails as jest.Mock).mockReturnValue({
      loading: true,
      searchHit: mockSearchHit,
      refetch: jest.fn(),
    });

    const { getByTestId, queryByTestId } = renderWrapper();

    expect(getByTestId('attackFlyoutStub')).toBeInTheDocument();
    expect(queryByTestId('attack-flyout-wrapper-loading')).not.toBeInTheDocument();
  });

  it('renders error callout when useAttackDetails returns no searchHit after loading', () => {
    (useAttackDetails as jest.Mock).mockReturnValue({
      loading: false,
      searchHit: undefined,
      refetch: jest.fn(),
    });

    const { getByTestId } = renderWrapper();

    expect(getByTestId('attack-flyout-wrapper-error')).toBeInTheDocument();
  });

  it('renders AttackFlyout when searchHit is available', () => {
    (useAttackDetails as jest.Mock).mockReturnValue({
      loading: false,
      searchHit: mockSearchHit,
      refetch: jest.fn(),
    });

    const { getByTestId } = renderWrapper();

    expect(getByTestId('attackFlyoutStub')).toBeInTheDocument();
  });

  it('invokes the consumer onAttackUpdated AND refetches when AttackFlyout reports an update', () => {
    const refetch = jest.fn();
    const onAttackUpdated = jest.fn();
    (useAttackDetails as jest.Mock).mockReturnValue({
      loading: false,
      searchHit: mockSearchHit,
      refetch,
    });

    const { getByTestId } = renderWrapper({ onAttackUpdated });

    fireEvent.click(getByTestId('attackFlyoutStub'));

    expect(onAttackUpdated).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('calls useAttackDetails with the provided attackId and indexName', () => {
    (useAttackDetails as jest.Mock).mockReturnValue({
      loading: true,
      searchHit: undefined,
      refetch: jest.fn(),
    });

    renderWrapper({ attackId: 'my-attack', indexName: 'my-index' });

    expect(useAttackDetails).toHaveBeenCalledWith({ attackId: 'my-attack', indexName: 'my-index' });
  });
});
