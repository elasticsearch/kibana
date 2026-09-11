/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { useExploreActions } from './use_explore_actions';

jest.mock('../../../../common/lib/kibana', () => ({
  useKibana: jest.fn().mockReturnValue({
    services: {
      application: {
        getUrlForApp: (_appId: string, { path }: { path: string }) =>
          `/app/securitySolutionUI/${path}`,
      },
    },
  }),
}));

const createHit = (
  flattened: Record<string, unknown> = {},
  id: string = 'test-id',
  index: string = 'test-index'
): DataTableRecord =>
  ({
    id,
    raw: { _id: id, _index: index },
    flattened: { _id: id, _index: index, ...flattened },
    isAnchor: false,
  } as DataTableRecord);

describe('useExploreActions', () => {
  const mockClosePopover = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns one item', () => {
    const { result } = renderHook(() =>
      useExploreActions({ hit: createHit(), closePopover: mockClosePopover })
    );
    expect(result.current.exploreActionItems).toHaveLength(1);
  });

  it('item has the correct data-test-subj', () => {
    const { result } = renderHook(() =>
      useExploreActions({ hit: createHit(), closePopover: mockClosePopover })
    );
    expect(result.current.exploreActionItems[0]['data-test-subj']).toBe(
      'explore-in-alerts-or-timeline'
    );
  });

  describe('label', () => {
    it('shows "Explore in Alerts" for alert documents (event.kind === signal)', () => {
      const { result } = renderHook(() =>
        useExploreActions({
          hit: createHit({ 'event.kind': 'signal' }),
          closePopover: mockClosePopover,
        })
      );
      expect(result.current.exploreActionItems[0].name).toBe('Explore in Alerts');
    });

    it('shows "Explore in Timeline" for non-alert documents', () => {
      const { result } = renderHook(() =>
        useExploreActions({
          hit: createHit({ 'event.kind': 'event' }),
          closePopover: mockClosePopover,
        })
      );
      expect(result.current.exploreActionItems[0].name).toBe('Explore in Timeline');
    });
  });

  describe('onClick', () => {
    it('calls closePopover', () => {
      const { result } = renderHook(() =>
        useExploreActions({ hit: createHit(), closePopover: mockClosePopover })
      );
      result.current.exploreActionItems[0].onClick();
      expect(mockClosePopover).toHaveBeenCalledTimes(1);
    });

    it('opens a new tab with noopener,noreferrer', () => {
      const { result } = renderHook(() =>
        useExploreActions({ hit: createHit(), closePopover: mockClosePopover })
      );
      result.current.exploreActionItems[0].onClick();
      expect(window.open).toHaveBeenCalledWith(expect.any(String), '_blank', 'noopener,noreferrer');
    });

    it('uses kibana.alert.url directly when present', () => {
      const alertUrl = 'https://kibana.example.com/app/security/alerts/redirect/abc123';
      const { result } = renderHook(() =>
        useExploreActions({
          hit: createHit({ 'event.kind': 'signal', 'kibana.alert.url': alertUrl }),
          closePopover: mockClosePopover,
        })
      );
      result.current.exploreActionItems[0].onClick();
      expect(window.open).toHaveBeenCalledWith(alertUrl, '_blank', 'noopener,noreferrer');
    });

    it('builds a timeline URL when kibana.alert.url is absent', () => {
      const { result } = renderHook(() =>
        useExploreActions({
          hit: createHit({ 'event.kind': 'event' }),
          closePopover: mockClosePopover,
        })
      );
      result.current.exploreActionItems[0].onClick();
      expect(window.open).toHaveBeenCalledWith(
        expect.stringContaining('/app/securitySolutionUI/alerts?'),
        '_blank',
        'noopener,noreferrer'
      );
    });
  });
});
