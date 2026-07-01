/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FormattedIp } from '.';
import { TestProviders } from '../../../common/mock';
import { TimelineId, TimelineTabs } from '../../../../common/types/timeline';
import { StatefulEventContext } from '../../../common/components/events_viewer/stateful_event_context';
import { NetworkPanelKey } from '../../../flyout/network_details';
import { createExpandableFlyoutApiMock } from '../../../common/mock/expandable_flyout';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';

jest.mock('react-redux', () => {
  const origin = jest.requireActual('react-redux');
  return {
    ...origin,
    useDispatch: jest.fn().mockReturnValue(jest.fn()),
  };
});

jest.mock('../../../common/lib/kibana/kibana_react', () => ({
  ...jest.requireActual('../../../common/lib/kibana/kibana_react'),
  useKibana: jest.fn().mockReturnValue({
    services: {
      application: {
        getUrlForApp: jest.fn(),
        navigateToApp: jest.fn(),
      },
      uiSettings: {
        get: jest.fn().mockReturnValue(false),
      },
    },
  }),
}));

jest.mock('../../store');

const mockOpenFlyout = jest.fn();
jest.mock('@kbn/expandable-flyout');

describe('FormattedIp', () => {
  beforeEach(() => {
    jest.mocked(useExpandableFlyoutApi).mockReturnValue({
      ...createExpandableFlyoutApiMock(),
      openFlyout: mockOpenFlyout,
    });
  });
  const props = {
    value: '192.168.1.1',
    contextId: 'test-context-id',
    eventId: 'test-event-id',
    isAggregatable: true,
    fieldType: 'ip',
    fieldName: 'host.ip',
  };

  test('should render ip address', () => {
    render(
      <TestProviders>
        <FormattedIp {...props} />
      </TestProviders>
    );

    expect(screen.getByText(props.value)).toBeInTheDocument();
  });

  test('if enableIpDetailsFlyout, should open NetworkDetails expandable flyout', async () => {
    const context = {
      enableHostDetailsFlyout: true,
      enableIpDetailsFlyout: true,
      timelineID: TimelineId.active,
      tabType: TimelineTabs.query,
    };
    render(
      <TestProviders>
        <StatefulEventContext.Provider value={context}>
          <FormattedIp {...props} />
        </StatefulEventContext.Provider>
      </TestProviders>
    );

    await userEvent.click(screen.getByTestId('network-details'));
    expect(mockOpenFlyout).toHaveBeenCalledWith({
      right: {
        id: NetworkPanelKey,
        params: {
          ip: props.value,
          flowTarget: 'source',
          scopeId: TimelineId.active,
        },
      },
    });
  });
});
