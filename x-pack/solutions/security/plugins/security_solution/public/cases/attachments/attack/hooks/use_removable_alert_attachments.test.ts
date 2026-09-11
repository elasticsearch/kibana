/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import {
  SECURITY_ALERT_ATTACHMENT_TYPE,
  SECURITY_ATTACK_ATTACHMENT_TYPE,
} from '@kbn/cases-plugin/common';
import { useRemovableAlertAttachments } from './use_removable_alert_attachments';
import type { CaseAttachment } from '../utils';
import { useFindAttackDiscoveries } from '../../../../attack_discovery/pages/use_find_attack_discoveries';
import { useAssistantAvailability } from '../../../../assistant/use_assistant_availability';

jest.mock('../../../../common/lib/kibana');
jest.mock('../../../../attack_discovery/pages/use_find_attack_discoveries');
jest.mock('../../../../assistant/use_assistant_availability');

const useFindAttackDiscoveriesMock = useFindAttackDiscoveries as jest.Mock;
const useAssistantAvailabilityMock = useAssistantAvailability as jest.Mock;

const attackAttachment = (attachmentId: string, id = `so-${attachmentId}`) =>
  ({
    id,
    type: SECURITY_ATTACK_ATTACHMENT_TYPE,
    attachmentId,
    metadata: { title: attachmentId, alertCount: 0, index: '.alerts-attack' },
  } as unknown as CaseAttachment);

const alertAttachment = (id: string, alertIds: string[]) =>
  ({
    id,
    type: SECURITY_ALERT_ATTACHMENT_TYPE,
    attachmentId: alertIds,
    metadata: { index: '.alerts-detections' },
  } as unknown as CaseAttachment);

const findResult = (
  attacks: Array<{ id: string; alertIds: string[]; replacements?: Record<string, string> }>
) => ({
  data: { data: attacks },
  isLoading: false,
  status: 'success',
});

describe('useRemovableAlertAttachments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAssistantAvailabilityMock.mockReturnValue({ isAssistantEnabled: true });
  });

  it('queries every attack attached to the case in one request', () => {
    useFindAttackDiscoveriesMock.mockReturnValue(findResult([]));

    renderHook(() =>
      useRemovableAlertAttachments({
        comments: [
          attackAttachment('attack-1'),
          attackAttachment('attack-2'),
          alertAttachment('so-alert-1', ['alert-1']),
        ],
        attackIds: ['attack-1'],
      })
    );

    expect(useFindAttackDiscoveriesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: ['attack-1', 'attack-2'],
        perPage: 2,
        includeAllAuthors: true,
      })
    );
  });

  it('is loading, and resolves nothing, until the query settles', () => {
    useFindAttackDiscoveriesMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      status: 'loading',
    });

    const { result } = renderHook(() =>
      useRemovableAlertAttachments({
        comments: [attackAttachment('attack-1'), alertAttachment('so-alert-1', ['alert-1'])],
        attackIds: ['attack-1'],
      })
    );

    expect(result.current).toEqual({
      isLoading: true,
      attachmentIds: [],
      alertIds: [],
      isResolvable: false,
    });
  });

  it('returns the alert attachments the attack may take with it', () => {
    useFindAttackDiscoveriesMock.mockReturnValue(
      findResult([{ id: 'attack-1', alertIds: ['alert-1', 'alert-2'] }])
    );

    const { result } = renderHook(() =>
      useRemovableAlertAttachments({
        comments: [
          attackAttachment('attack-1'),
          alertAttachment('so-alert-1', ['alert-1']),
          alertAttachment('so-alert-2', ['alert-2']),
          alertAttachment('so-alert-3', ['alert-3']),
        ],
        attackIds: ['attack-1'],
      })
    );

    expect(result.current).toEqual({
      isLoading: false,
      attachmentIds: ['so-alert-1', 'so-alert-2'],
      alertIds: ['alert-1', 'alert-2'],
      isResolvable: true,
    });
  });

  it('excludes alerts still claimed by another attack on the case', () => {
    useFindAttackDiscoveriesMock.mockReturnValue(
      findResult([
        { id: 'attack-1', alertIds: ['alert-1', 'alert-2'] },
        { id: 'attack-2', alertIds: ['alert-2'] },
      ])
    );

    const { result } = renderHook(() =>
      useRemovableAlertAttachments({
        comments: [
          attackAttachment('attack-1'),
          attackAttachment('attack-2'),
          alertAttachment('so-alert-1', ['alert-1']),
          alertAttachment('so-alert-2', ['alert-2']),
        ],
        attackIds: ['attack-1'],
      })
    );

    expect(result.current).toEqual({
      isLoading: false,
      attachmentIds: ['so-alert-1'],
      alertIds: ['alert-1'],
      isResolvable: true,
    });
  });

  it('de-anonymises and dedupes the attack alert ids before comparing', () => {
    useFindAttackDiscoveriesMock.mockReturnValue(
      findResult([
        {
          id: 'attack-1',
          alertIds: ['anon-1', 'anon-2'],
          replacements: { 'anon-1': 'alert-1', 'anon-2': 'alert-1' },
        },
      ])
    );

    const { result } = renderHook(() =>
      useRemovableAlertAttachments({
        comments: [attackAttachment('attack-1'), alertAttachment('so-alert-1', ['alert-1'])],
        attackIds: ['attack-1'],
      })
    );

    expect(result.current).toEqual({
      isLoading: false,
      attachmentIds: ['so-alert-1'],
      alertIds: ['alert-1'],
      isResolvable: true,
    });
  });

  it('is not resolvable when the attack being removed did not come back', () => {
    useFindAttackDiscoveriesMock.mockReturnValue(findResult([]));

    const { result } = renderHook(() =>
      useRemovableAlertAttachments({
        comments: [attackAttachment('attack-1'), alertAttachment('so-alert-1', ['alert-1'])],
        attackIds: ['attack-1'],
      })
    );

    expect(result.current).toEqual({
      isLoading: false,
      attachmentIds: [],
      alertIds: [],
      isResolvable: false,
    });
  });

  it('is not resolvable when another attached attack did not come back', () => {
    useFindAttackDiscoveriesMock.mockReturnValue(
      findResult([{ id: 'attack-1', alertIds: ['alert-1'] }])
    );

    const { result } = renderHook(() =>
      useRemovableAlertAttachments({
        comments: [
          attackAttachment('attack-1'),
          attackAttachment('attack-2'),
          alertAttachment('so-alert-1', ['alert-1']),
        ],
        attackIds: ['attack-1'],
      })
    );

    expect(result.current.isResolvable).toBe(false);
    expect(result.current.attachmentIds).toEqual([]);
  });

  describe('a selection of several attacks', () => {
    it('unions their alert ids, so an alert shared only within the selection is removable', () => {
      useFindAttackDiscoveriesMock.mockReturnValue(
        findResult([
          { id: 'attack-1', alertIds: ['alert-1', 'alert-2'] },
          { id: 'attack-2', alertIds: ['alert-2', 'alert-3'] },
        ])
      );

      const { result } = renderHook(() =>
        useRemovableAlertAttachments({
          comments: [
            attackAttachment('attack-1'),
            attackAttachment('attack-2'),
            alertAttachment('so-alert-1', ['alert-1']),
            // Removable only because the union covers both of its alerts.
            alertAttachment('so-alert-cross', ['alert-2', 'alert-3']),
          ],
          attackIds: ['attack-1', 'attack-2'],
        })
      );

      expect(result.current).toEqual({
        isLoading: false,
        attachmentIds: ['so-alert-1', 'so-alert-cross'],
        // alert-2 belongs to both selected attacks and is counted once.
        alertIds: ['alert-1', 'alert-2', 'alert-3'],
        isResolvable: true,
      });
    });

    it('still excludes alerts claimed by an attack outside the selection', () => {
      useFindAttackDiscoveriesMock.mockReturnValue(
        findResult([
          { id: 'attack-1', alertIds: ['alert-1'] },
          { id: 'attack-2', alertIds: ['alert-2'] },
          { id: 'attack-3', alertIds: ['alert-2'] },
        ])
      );

      const { result } = renderHook(() =>
        useRemovableAlertAttachments({
          comments: [
            attackAttachment('attack-1'),
            attackAttachment('attack-2'),
            attackAttachment('attack-3'),
            alertAttachment('so-alert-1', ['alert-1']),
            alertAttachment('so-alert-2', ['alert-2']),
          ],
          attackIds: ['attack-1', 'attack-2'],
        })
      );

      expect(result.current).toEqual({
        isLoading: false,
        attachmentIds: ['so-alert-1'],
        alertIds: ['alert-1'],
        isResolvable: true,
      });
    });

    it('is not resolvable when any attack in the selection did not come back', () => {
      useFindAttackDiscoveriesMock.mockReturnValue(
        findResult([{ id: 'attack-1', alertIds: ['alert-1'] }])
      );

      const { result } = renderHook(() =>
        useRemovableAlertAttachments({
          comments: [
            attackAttachment('attack-1'),
            attackAttachment('attack-2'),
            alertAttachment('so-alert-1', ['alert-1']),
          ],
          attackIds: ['attack-1', 'attack-2'],
        })
      );

      expect(result.current.isResolvable).toBe(false);
      expect(result.current.attachmentIds).toEqual([]);
    });
  });
});
