/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERT_WORKFLOW_TAGS } from '@kbn/rule-data-utils';
import { act, fireEvent, render, renderHook } from '@testing-library/react';
import { TestProviders } from '../../../mock';
import type {
  UseBulkAlertTagsItemsProps,
  UseBulkAlertTagsPanel,
} from './use_bulk_alert_tags_items';
import { useBulkAlertTagsItems } from './use_bulk_alert_tags_items';
import { useSetAlertTags } from './use_set_alert_tags';
import { useUiSetting$ } from '../../../lib/kibana';
import { useAlertsPrivileges } from '../../../../detections/containers/detection_engine/alerts/use_alerts_privileges';

jest.mock('./use_set_alert_tags');
jest.mock('../../../lib/kibana');
jest.mock('../../../../detections/containers/detection_engine/alerts/use_alerts_privileges');

const mockUseAlertsPrivileges = useAlertsPrivileges as jest.Mock;

const defaultProps: UseBulkAlertTagsItemsProps = {
  refetch: () => {},
};

const mockTagItems = [
  {
    _id: 'test-id',
    data: [{ field: ALERT_WORKFLOW_TAGS, value: ['tag-1', 'tag-2'] }],
    ecs: { _id: 'test-id', _index: 'test-index' },
  },
];

const renderPanel = (panel: UseBulkAlertTagsPanel) => {
  const content = panel.renderContent({
    closePopoverMenu: jest.fn(),
    setIsBulkActionsLoading: jest.fn(),
    alertItems: mockTagItems,
  });
  return render(content);
};

describe('useBulkAlertTagsItems', () => {
  beforeEach(() => {
    (useSetAlertTags as jest.Mock).mockReturnValue(jest.fn());
    (useUiSetting$ as jest.Mock).mockReturnValue([['default-test-tag-1']]);
    mockUseAlertsPrivileges.mockReturnValue({ hasAlertsUpdate: true });
  });

  it('should render alert tagging actions', () => {
    const { result } = renderHook(() => useBulkAlertTagsItems(defaultProps), {
      wrapper: TestProviders,
    });
    expect(result.current.alertTagsItems.length).toEqual(1);
    expect(result.current.alertTagsPanels.length).toEqual(1);

    expect(result.current.alertTagsItems[0]['data-test-subj']).toEqual(
      'alert-tags-context-menu-item'
    );
    expect(result.current.alertTagsItems[0]).toMatchObject({
      icon: 'tag',
      groupId: 'tags',
    });
    expect(result.current.alertTagsPanels[0]['data-test-subj']).toEqual(
      'alert-tags-context-menu-panel'
    );
  });

  it('should still render alert tagging panel when useSetAlertTags is null', () => {
    (useSetAlertTags as jest.Mock).mockReturnValue(null);
    const { result } = renderHook(() => useBulkAlertTagsItems(defaultProps), {
      wrapper: TestProviders,
    });

    expect(result.current.alertTagsPanels[0]['data-test-subj']).toEqual(
      'alert-tags-context-menu-panel'
    );
    const wrapper = renderPanel(result.current.alertTagsPanels[0]);
    expect(wrapper.getByTestId('alert-tags-selectable-menu')).toBeInTheDocument();
  });

  it('should call setAlertTags on submit', () => {
    const mockSetAlertTags = jest.fn();
    (useSetAlertTags as jest.Mock).mockReturnValue(mockSetAlertTags);
    const { result } = renderHook(() => useBulkAlertTagsItems(defaultProps), {
      wrapper: TestProviders,
    });

    const wrapper = renderPanel(result.current.alertTagsPanels[0]);
    expect(wrapper.getByTestId('alert-tags-selectable-menu')).toBeInTheDocument();
    act(() => {
      fireEvent.click(wrapper.getByTestId('unselected-alert-tag')); // Won't fire unless component tags selection has been changed
    });
    act(() => {
      fireEvent.click(wrapper.getByTestId('alert-tags-update-button'));
    });
    expect(mockSetAlertTags).toHaveBeenCalled();
  });

  it('should return empty arrays when user does not have alerts privileges', () => {
    mockUseAlertsPrivileges.mockReturnValue({ hasAlertsUpdate: false });

    const { result } = renderHook(() => useBulkAlertTagsItems(defaultProps), {
      wrapper: TestProviders,
    });

    expect(result.current.alertTagsItems.length).toEqual(0);
    expect(result.current.alertTagsPanels.length).toEqual(0);
  });
});
