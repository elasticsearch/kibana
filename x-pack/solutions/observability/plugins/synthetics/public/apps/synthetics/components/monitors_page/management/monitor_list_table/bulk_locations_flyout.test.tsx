/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react';
import type { EncryptedSyntheticsSavedMonitor } from '../../../../../../../common/runtime_types';
import { ConfigKey, MonitorTypeEnum, SourceType } from '../../../../../../../common/runtime_types';
import { render } from '../../../../utils/testing/rtl_helpers';
import { kibanaService } from '../../../../../../utils/kibana_service';
import { useGetUrlParams } from '../../../../hooks';
import { useLocations } from '../../../../hooks/use_locations';
import { fetchBulkUpdateMonitors } from '../../../../state';
import { BulkLocationsFlyout } from './bulk_locations_flyout';

jest.mock('../../../../hooks', () => ({
  ...jest.requireActual('../../../../hooks'),
  useGetUrlParams: jest.fn(),
}));

jest.mock('../../../../hooks/use_locations', () => ({
  useLocations: jest.fn(),
}));

jest.mock('../../../../state', () => ({
  ...jest.requireActual('../../../../state'),
  fetchBulkUpdateMonitors: jest.fn(),
}));

// The real combobox is an EuiComboBox; a lightweight stand-in keeps these tests
// focused on the flyout's add/remove/overwrite payload logic. Clicking it selects
// the "us_east" location.
jest.mock('../../../monitor_add_edit/form/field_wrappers', () => ({
  LocationsComboBox: ({ onChange }: { onChange: (val: unknown[]) => void }) => (
    <button
      data-test-subj="syntheticsBulkLocationsComboBox"
      onClick={() => onChange([{ id: 'us_east', label: 'US East', isServiceManaged: true }])}
    >
      {'select us_east'}
    </button>
  ),
}));

const useGetUrlParamsMock = useGetUrlParams as jest.MockedFunction<typeof useGetUrlParams>;
const useLocationsMock = useLocations as jest.MockedFunction<typeof useLocations>;
const fetchBulkUpdateMonitorsMock = fetchBulkUpdateMonitors as jest.MockedFunction<
  typeof fetchBulkUpdateMonitors
>;

const location = (id: string, label: string) => ({ id, label, isServiceManaged: true });

const makeMonitor = (
  id: string,
  name: string,
  {
    origin = SourceType.UI,
    locations = [],
    type,
  }: {
    origin?: SourceType;
    locations?: Array<{ id: string; label: string; isServiceManaged: boolean }>;
    type?: MonitorTypeEnum;
  } = {}
): EncryptedSyntheticsSavedMonitor =>
  ({
    [ConfigKey.CONFIG_ID]: id,
    [ConfigKey.NAME]: name,
    [ConfigKey.MONITOR_SOURCE_TYPE]: origin,
    [ConfigKey.LOCATIONS]: locations,
    [ConfigKey.MONITOR_TYPE]: type,
  } as unknown as EncryptedSyntheticsSavedMonitor);

describe('<BulkLocationsFlyout />', () => {
  const onClose = jest.fn();
  const reloadPage = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useGetUrlParamsMock.mockReturnValue({ spaceId: 'default' } as ReturnType<
      typeof useGetUrlParams
    >);
    useLocationsMock.mockReturnValue({
      locations: [location('us_east', 'US East'), location('us_west', 'US West')],
      loading: false,
    } as unknown as ReturnType<typeof useLocations>);
    fetchBulkUpdateMonitorsMock.mockResolvedValue({ result: [] });
  });

  const selectUsEast = (getByTestId: (id: string) => HTMLElement) => {
    fireEvent.click(getByTestId('syntheticsBulkLocationsComboBox'));
  };

  const setMode = (
    getByRole: (role: string, opts: { name: string }) => HTMLElement,
    name: string
  ) => {
    fireEvent.click(getByRole('button', { name }));
  };

  const clickSave = (getByTestId: (id: string) => HTMLElement) => {
    fireEvent.click(getByTestId('syntheticsBulkLocationsSave'));
  };

  it('does not add Elastic managed locations to API Journey monitors', async () => {
    const monitors = [
      makeMonitor('http-1', 'HTTP monitor', {
        locations: [location('us_west', 'US West')],
        type: MonitorTypeEnum.HTTP,
      }),
      makeMonitor('api-1', 'API Journey', {
        locations: [{ id: 'qa_private', label: 'QA private', isServiceManaged: false }],
        type: MonitorTypeEnum.API,
      }),
    ];
    fetchBulkUpdateMonitorsMock.mockResolvedValue({ result: [{ id: 'http-1', updated: true }] });

    const { getByTestId } = render(
      <BulkLocationsFlyout monitors={monitors} onClose={onClose} reloadPage={reloadPage} />
    );

    selectUsEast(getByTestId);
    clickSave(getByTestId);

    await waitFor(() => expect(fetchBulkUpdateMonitorsMock).toHaveBeenCalledTimes(1));
    const arg = fetchBulkUpdateMonitorsMock.mock.calls[0][0];
    expect(arg.updates.map((u) => u.id)).toEqual(['http-1']);
  });

  it('adds the selected location only to monitors that do not already have it', async () => {
    const monitors = [
      makeMonitor('ui-1', 'Monitor 1', { locations: [location('us_west', 'US West')] }),
      makeMonitor('ui-2', 'Monitor 2', { locations: [location('us_east', 'US East')] }),
    ];
    fetchBulkUpdateMonitorsMock.mockResolvedValue({ result: [{ id: 'ui-1', updated: true }] });

    const { getByTestId } = render(
      <BulkLocationsFlyout monitors={monitors} onClose={onClose} reloadPage={reloadPage} />
    );

    selectUsEast(getByTestId);
    clickSave(getByTestId);

    await waitFor(() => expect(fetchBulkUpdateMonitorsMock).toHaveBeenCalledTimes(1));
    const arg = fetchBulkUpdateMonitorsMock.mock.calls[0][0];
    expect(arg.updates.map((u) => u.id)).toEqual(['ui-1']);
    expect(
      (arg.updates[0].attributes[ConfigKey.LOCATIONS] as Array<{ id: string }>).map((l) => l.id)
    ).toEqual(['us_west', 'us_east']);
    expect(reloadPage).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('overwrites locations, skipping monitors already at the target set', async () => {
    const monitors = [
      makeMonitor('ui-1', 'Monitor 1', { locations: [location('us_west', 'US West')] }),
      makeMonitor('ui-2', 'Monitor 2', { locations: [location('us_east', 'US East')] }),
    ];
    fetchBulkUpdateMonitorsMock.mockResolvedValue({ result: [{ id: 'ui-1', updated: true }] });

    const { getByTestId, getByRole } = render(
      <BulkLocationsFlyout monitors={monitors} onClose={onClose} reloadPage={reloadPage} />
    );

    setMode(getByRole, 'Overwrite');
    selectUsEast(getByTestId);
    clickSave(getByTestId);

    await waitFor(() => expect(fetchBulkUpdateMonitorsMock).toHaveBeenCalledTimes(1));
    const arg = fetchBulkUpdateMonitorsMock.mock.calls[0][0];
    expect(arg.updates.map((u) => u.id)).toEqual(['ui-1']);
    expect(
      (arg.updates[0].attributes[ConfigKey.LOCATIONS] as Array<{ id: string }>).map((l) => l.id)
    ).toEqual(['us_east']);
  });

  it('clears a monitor’s private location when overwriting with a public one', async () => {
    // Overwrite private → public must send `private_locations: []` or private survives.
    const monitors = [
      makeMonitor('ui-1', 'Monitor 1', {
        locations: [{ id: 'qa_private', label: 'QA private', isServiceManaged: false }],
      }),
    ];
    fetchBulkUpdateMonitorsMock.mockResolvedValue({ result: [{ id: 'ui-1', updated: true }] });

    const { getByTestId, getByRole } = render(
      <BulkLocationsFlyout monitors={monitors} onClose={onClose} reloadPage={reloadPage} />
    );

    setMode(getByRole, 'Overwrite');
    selectUsEast(getByTestId);
    clickSave(getByTestId);

    await waitFor(() => expect(fetchBulkUpdateMonitorsMock).toHaveBeenCalledTimes(1));
    const { attributes } = fetchBulkUpdateMonitorsMock.mock.calls[0][0].updates[0];
    expect((attributes[ConfigKey.LOCATIONS] as Array<{ id: string }>).map((l) => l.id)).toEqual([
      'us_east',
    ]);
    expect(attributes.private_locations).toEqual([]);
  });

  it('warns and disables save when a removal would empty a monitor’s locations', () => {
    const monitors = [
      makeMonitor('ui-1', 'Monitor 1', { locations: [location('us_east', 'US East')] }),
    ];

    const { getByTestId, getByRole, getByText } = render(
      <BulkLocationsFlyout monitors={monitors} onClose={onClose} reloadPage={reloadPage} />
    );

    setMode(getByRole, 'Remove');
    selectUsEast(getByTestId);

    expect(
      getByText(
        '1 monitor would be left with no location and will be skipped. Every monitor must run in at least one location.'
      )
    ).toBeInTheDocument();
    expect(getByTestId('syntheticsBulkLocationsSave')).toBeDisabled();
  });

  it('splits eligible vs. skipped monitors', () => {
    const monitors = [
      makeMonitor('ui-1', 'UI monitor'),
      makeMonitor('project-1', 'Project monitor', { origin: SourceType.PROJECT }),
    ];

    const { getByText } = render(
      <BulkLocationsFlyout monitors={monitors} onClose={onClose} reloadPage={reloadPage} />
    );

    expect(
      getByText('Add, remove, or overwrite locations for 1 selected monitor.')
    ).toBeInTheDocument();
    expect(getByText('1 monitor will not be updated')).toBeInTheDocument();
    expect(getByText('Project monitor')).toBeInTheDocument();
  });

  it('shows a danger toast when the request throws', async () => {
    const monitors = [
      makeMonitor('ui-1', 'Monitor 1', { locations: [location('us_west', 'US West')] }),
    ];
    fetchBulkUpdateMonitorsMock.mockRejectedValue(new Error('network error'));

    const { getByTestId } = render(
      <BulkLocationsFlyout monitors={monitors} onClose={onClose} reloadPage={reloadPage} />
    );

    selectUsEast(getByTestId);
    clickSave(getByTestId);

    await waitFor(() => {
      expect(kibanaService.toasts.addDanger).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Failed to update locations. Please try again later.' })
      );
    });
    expect(reloadPage).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when cancelled without hitting the API', () => {
    const monitors = [makeMonitor('ui-1', 'Monitor 1')];

    const { getByTestId } = render(
      <BulkLocationsFlyout monitors={monitors} onClose={onClose} reloadPage={reloadPage} />
    );

    fireEvent.click(getByTestId('syntheticsBulkLocationsCancel'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchBulkUpdateMonitorsMock).not.toHaveBeenCalled();
  });

  it('summarises how many monitors will change vs. stay unchanged', () => {
    const monitors = [
      makeMonitor('ui-1', 'Monitor 1', { locations: [location('us_west', 'US West')] }),
      makeMonitor('ui-2', 'Monitor 2', { locations: [location('us_east', 'US East')] }),
    ];

    const { getByTestId } = render(
      <BulkLocationsFlyout monitors={monitors} onClose={onClose} reloadPage={reloadPage} />
    );

    // Add us_east: ui-1 gains it (changes), ui-2 already has it (unchanged).
    selectUsEast(getByTestId);

    expect(getByTestId('syntheticsBulkLocationsEffectSummary')).toHaveTextContent(
      '1 will change · 1 unchanged'
    );
  });

  it('shows mode-specific help text for the selected action', () => {
    const monitors = [makeMonitor('ui-1', 'Monitor 1')];

    const { getByText, getByRole } = render(
      <BulkLocationsFlyout monitors={monitors} onClose={onClose} reloadPage={reloadPage} />
    );

    expect(
      getByText("Adds the selected locations to each monitor's existing locations.")
    ).toBeInTheDocument();

    setMode(getByRole, 'Overwrite');
    expect(
      getByText("Replaces each monitor's locations with the selected ones.")
    ).toBeInTheDocument();
  });

  it('does not warn about emptied monitors in overwrite mode before a location is picked', () => {
    const monitors = [
      makeMonitor('ui-1', 'Monitor 1', { locations: [location('us_east', 'US East')] }),
    ];

    const { getByRole, getByTestId, queryByText, queryByTestId } = render(
      <BulkLocationsFlyout monitors={monitors} onClose={onClose} reloadPage={reloadPage} />
    );

    setMode(getByRole, 'Overwrite');

    // No selection yet: the summary and the "would be left with no location"
    // warning should both be absent (they only apply once a real outcome exists).
    expect(queryByTestId('syntheticsBulkLocationsEffectSummary')).not.toBeInTheDocument();
    expect(queryByText(/would be left with no location/)).not.toBeInTheDocument();
    expect(getByTestId('syntheticsBulkLocationsSave')).toBeDisabled();
  });
});
