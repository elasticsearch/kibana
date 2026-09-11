/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { useAttackCaseContextMenuItems } from './use_attack_case_context_menu_items';
import { useBulkAttackCaseItems } from '../bulk_action_items/use_bulk_attack_case_items';

jest.mock('../bulk_action_items/use_bulk_attack_case_items');

const mockUseBulkAttackCaseItems = useBulkAttackCaseItems as jest.MockedFunction<
  typeof useBulkAttackCaseItems
>;

describe('useAttackCaseContextMenuItems', () => {
  const closePopover = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseBulkAttackCaseItems.mockReturnValue({
      items: [
        {
          label: 'Add to new case',
          key: 'attack-add-to-new-case',
          'data-test-subj': 'attack-add-to-new-case',
          disableOnQuery: true,
          onClick: jest.fn(),
        },
        {
          label: 'Add to existing case',
          key: 'attack-add-to-existing-case',
          'data-test-subj': 'attack-add-to-existing-case',
          disableOnQuery: true,
          onClick: jest.fn(),
        },
      ],
      panels: [],
    });
  });

  it('should forward the attack to attach to the bulk hook', () => {
    const attackToAttach = {
      id: 'attack-1',
      index: '.alerts-security.attack.discovery.alerts-default',
      title: 'Attack title',
      alertIds: ['alert-1'],
    };

    renderHook(() =>
      useAttackCaseContextMenuItems({
        attacksWithCase: [
          {
            attackId: 'attack-1',
            relatedAlertIds: ['alert-1'],
            markdownComment: 'markdown',
          },
        ],
        title: 'Attack title',
        closePopover,
        attackToAttach,
      })
    );

    expect(mockUseBulkAttackCaseItems).toHaveBeenCalledWith(
      expect.objectContaining({ attackToAttach })
    );
  });

  it('should return items from transformed bulk hook', () => {
    const { result } = renderHook(() =>
      useAttackCaseContextMenuItems({
        attacksWithCase: [
          {
            attackId: 'attack-1',
            relatedAlertIds: ['alert-1'],
            markdownComment: 'markdown',
          },
        ],
        title: 'Attack title',
        closePopover,
      })
    );

    expect(result.current.items).toMatchInlineSnapshot(`
      Array [
        Object {
          "data-test-subj": "attack-add-to-new-case",
          "key": "attack-add-to-new-case",
          "name": "Add to new case",
          "onClick": [Function],
          "panel": undefined,
        },
        Object {
          "data-test-subj": "attack-add-to-existing-case",
          "key": "attack-add-to-existing-case",
          "name": "Add to existing case",
          "onClick": [Function],
          "panel": undefined,
        },
      ]
    `);
  });

  it('should call useBulkAttackCaseItems with expected props', () => {
    renderHook(() =>
      useAttackCaseContextMenuItems({
        attacksWithCase: [
          {
            attackId: 'attack-1',
            relatedAlertIds: ['alert-1'],
            markdownComment: 'markdown',
          },
        ],
        title: 'Attack title',
      })
    );

    expect(mockUseBulkAttackCaseItems).toHaveBeenCalledWith({
      closePopover: undefined,
      title: 'Attack title',
    });
  });

  it('should pass telemetrySource to useBulkAttackCaseItems', () => {
    renderHook(() =>
      useAttackCaseContextMenuItems({
        attacksWithCase: [
          {
            attackId: 'attack-1',
            relatedAlertIds: ['alert-1'],
            markdownComment: 'markdown',
          },
        ],
        title: 'Attack title',
        telemetrySource: 'attacks_page_group_take_action',
      })
    );

    expect(mockUseBulkAttackCaseItems).toHaveBeenCalledWith({
      title: 'Attack title',
      closePopover: undefined,
      telemetrySource: 'attacks_page_group_take_action',
    });
  });

  it('should pass closePopover to useBulkAttackCaseItems', () => {
    renderHook(() =>
      useAttackCaseContextMenuItems({
        attacksWithCase: [
          {
            attackId: 'attack-1',
            relatedAlertIds: ['alert-1'],
            markdownComment: 'markdown',
          },
        ],
        title: 'Attack title',
        closePopover,
      })
    );

    expect(mockUseBulkAttackCaseItems).toHaveBeenCalledWith({
      closePopover,
      title: 'Attack title',
    });
  });

  it('should return empty panels', () => {
    const { result } = renderHook(() =>
      useAttackCaseContextMenuItems({
        attacksWithCase: [],
        title: 'Attack title',
      })
    );

    expect(result.current.panels).toEqual([]);
  });
});
