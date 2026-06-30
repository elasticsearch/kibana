/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { mount } from 'enzyme';
import { waitFor } from '@testing-library/react';

import { HostName } from './host_name';
import { TestProviders } from '../../../../../common/mock';
import { TimelineId, TimelineTabs } from '../../../../../../common/types/timeline';
import { StatefulEventContext } from '../../../../../common/components/events_viewer/stateful_event_context';
import { TableId } from '@kbn/securitysolution-data-table';
import { createExpandableFlyoutApiMock } from '../../../../../common/mock/expandable_flyout';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';

const mockOpenFlyout = jest.fn();
const mockOpenSystemFlyout = jest.fn();
const mockUseIsExperimentalFeatureEnabled = jest.fn().mockReturnValue(false);

jest.mock('@kbn/expandable-flyout');

jest.mock('../../../../../common/components/draggables', () => ({
  DefaultDraggable: () => <div data-test-subj="DefaultDraggable" />,
}));

jest.mock('../../../../../common/hooks/use_experimental_features', () => ({
  useIsExperimentalFeatureEnabled: (flag: string) => mockUseIsExperimentalFeatureEnabled(flag),
}));

jest.mock('../../../../../flyout_v2/shared/components/flyout_provider', () => ({
  flyoutProviders: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../../../../../flyout_v2/shared/hooks/use_default_flyout_properties', () => ({
  useDefaultDocumentFlyoutProperties: () => ({ size: 'm' }),
}));

jest.mock('../../../../../flyout_v2/entity/host/main', () => ({
  Host: () => <div data-test-subj="mockHostPanel" />,
}));

// Keep the real kibana services (HostDetailsLink relies on them) but inject openSystemFlyout.
jest.mock('../../../../../common/lib/kibana', () => {
  const actual = jest.requireActual('../../../../../common/lib/kibana');
  return {
    ...actual,
    useKibana: () => {
      const kibana = actual.useKibana();
      return {
        ...kibana,
        services: {
          ...kibana.services,
          overlays: { ...kibana.services.overlays, openSystemFlyout: mockOpenSystemFlyout },
        },
      };
    },
  };
});

describe('HostName', () => {
  beforeEach(() => {
    mockUseIsExperimentalFeatureEnabled.mockReturnValue(false);
    jest.mocked(useExpandableFlyoutApi).mockReturnValue({
      ...createExpandableFlyoutApiMock(),
      openFlyout: mockOpenFlyout,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const props = {
    fieldName: 'host.name',
    contextId: 'test-context-id',
    eventId: 'test-event-id',
    fieldType: 'keyword',
    isAggregatable: true,
    value: 'Mock Host',
  };

  test('should render host name', () => {
    const wrapper = mount(
      <TestProviders>
        <HostName {...props} />
      </TestProviders>
    );

    expect(wrapper.find('[data-test-subj="host-details-button"]').last().text()).toEqual(
      props.value
    );
  });

  test('should not open any flyout or panels if context in not defined', async () => {
    const wrapper = mount(
      <TestProviders>
        <HostName {...props} />
      </TestProviders>
    );

    wrapper.find('[data-test-subj="host-details-button"]').last().simulate('click');
    await waitFor(() => {
      expect(mockOpenFlyout).not.toHaveBeenCalled();
    });
  });

  test('should not open any flyout or panels if enableHostDetailsFlyout is false', async () => {
    const context = {
      enableHostDetailsFlyout: false,
      enableIpDetailsFlyout: true,
      timelineID: TimelineId.active,
      tabType: TimelineTabs.query,
    };

    const wrapper = mount(
      <TestProviders>
        <StatefulEventContext.Provider value={context}>
          <HostName {...props} />
        </StatefulEventContext.Provider>
      </TestProviders>
    );

    wrapper.find('[data-test-subj="host-details-button"]').last().simulate('click');
    await waitFor(() => {
      expect(mockOpenFlyout).not.toHaveBeenCalled();
    });
  });

  test('should not open any flyout or panels if timelineID is not defined', async () => {
    const context = {
      enableHostDetailsFlyout: true,
      enableIpDetailsFlyout: true,
      timelineID: '',
      tabType: TimelineTabs.query,
    };

    const wrapper = mount(
      <TestProviders>
        <StatefulEventContext.Provider value={context}>
          <HostName {...props} />
        </StatefulEventContext.Provider>
      </TestProviders>
    );

    wrapper.find('[data-test-subj="host-details-button"]').last().simulate('click');
    await waitFor(() => {
      expect(mockOpenFlyout).not.toHaveBeenCalled();
    });
  });

  test('should open expandable flyout on table', async () => {
    const context = {
      enableHostDetailsFlyout: true,
      enableIpDetailsFlyout: true,
      timelineID: TableId.alertsOnAlertsPage,
      tabType: TimelineTabs.query,
    };
    const wrapper = mount(
      <TestProviders>
        <StatefulEventContext.Provider value={context}>
          <HostName {...props} />
        </StatefulEventContext.Provider>
      </TestProviders>
    );

    wrapper.find('[data-test-subj="host-details-button"]').last().simulate('click');
    await waitFor(() => {
      expect(mockOpenFlyout).toHaveBeenCalledWith({
        right: {
          id: 'host-panel',
          params: {
            hostName: props.value,
            entityId: undefined,
            contextID: props.contextId,
            scopeId: TableId.alertsOnAlertsPage,
          },
        },
      });
    });
  });

  test('should open expandable flyout in timeline', async () => {
    const context = {
      enableHostDetailsFlyout: true,
      enableIpDetailsFlyout: true,
      timelineID: TimelineId.active,
      tabType: TimelineTabs.query,
    };
    const wrapper = mount(
      <TestProviders>
        <StatefulEventContext.Provider value={context}>
          <HostName {...props} />
        </StatefulEventContext.Provider>
      </TestProviders>
    );

    wrapper.find('[data-test-subj="host-details-button"]').last().simulate('click');
    await waitFor(() => {
      expect(mockOpenFlyout).toHaveBeenCalledWith({
        right: {
          id: 'host-panel',
          params: {
            hostName: props.value,
            entityId: undefined,
            contextID: props.contextId,
            scopeId: 'timeline-1',
          },
        },
      });
    });
  });

  test('should open the v2 system flyout when newFlyoutSystemEnabled is true', async () => {
    mockUseIsExperimentalFeatureEnabled.mockReturnValue(true);
    const context = {
      enableHostDetailsFlyout: true,
      enableIpDetailsFlyout: true,
      timelineID: TimelineId.active,
      tabType: TimelineTabs.query,
    };
    const wrapper = mount(
      <TestProviders>
        <StatefulEventContext.Provider value={context}>
          <HostName {...props} />
        </StatefulEventContext.Provider>
      </TestProviders>
    );

    wrapper.find('[data-test-subj="host-details-button"]').last().simulate('click');
    await waitFor(() => {
      expect(mockOpenSystemFlyout).toHaveBeenCalledTimes(1);
    });
    expect(mockOpenSystemFlyout).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ session: 'start' })
    );
    expect(mockOpenFlyout).not.toHaveBeenCalled();
  });
});
