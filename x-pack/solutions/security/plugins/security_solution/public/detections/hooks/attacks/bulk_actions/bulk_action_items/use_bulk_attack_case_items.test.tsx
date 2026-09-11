/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import React from 'react';
import {
  COMMENT_ATTACHMENT_TYPE,
  SECURITY_ALERT_ATTACHMENT_TYPE,
  SECURITY_ATTACK_ATTACHMENT_TYPE,
} from '@kbn/cases-plugin/common';
import { MAX_ALERTS_PER_CASE } from '@kbn/cases-plugin/common/constants';
import { useBulkAttackCaseItems } from './use_bulk_attack_case_items';
import {
  ALERT_ATTACK_DISCOVERY_ALERT_IDS,
  ALERT_ATTACK_DISCOVERY_MARKDOWN_COMMENT,
} from '../constants';
import { AttacksEventTypes } from '../../../../../common/lib/telemetry';
import { useAppToastsMock } from '../../../../../common/hooks/use_app_toasts.mock';

jest.mock('../../../../../common/lib/kibana', () => ({
  useKibana: jest.fn(),
}));
jest.mock('@kbn/elastic-assistant', () => ({
  useAssistantContext: jest.fn(),
}));
jest.mock('../../../../../common/hooks/use_app_toasts', () => ({
  useAppToasts: jest.fn(),
}));
jest.mock('../../../../../common/hooks/use_experimental_features', () => ({
  useIsExperimentalFeatureEnabled: jest.fn(),
}));
jest.mock(
  '../../../../../attack_discovery/pages/results/take_action/use_add_to_existing_case',
  () => ({
    useAddToExistingCase: jest.fn(),
  })
);
jest.mock('../../../../../attack_discovery/pages/results/take_action/use_add_to_case', () => ({
  useAddToNewCase: jest.fn(),
}));

const { useKibana } = jest.requireMock('../../../../../common/lib/kibana') as {
  useKibana: jest.Mock;
};
const { useAddToExistingCase } = jest.requireMock(
  '../../../../../attack_discovery/pages/results/take_action/use_add_to_existing_case'
) as { useAddToExistingCase: jest.Mock };
const { useAddToNewCase } = jest.requireMock(
  '../../../../../attack_discovery/pages/results/take_action/use_add_to_case'
) as { useAddToNewCase: jest.Mock };
const { useAssistantContext } = jest.requireMock('@kbn/elastic-assistant') as {
  useAssistantContext: jest.Mock;
};
const { useAppToasts } = jest.requireMock('../../../../../common/hooks/use_app_toasts') as {
  useAppToasts: jest.Mock;
};
const { useIsExperimentalFeatureEnabled } = jest.requireMock(
  '../../../../../common/hooks/use_experimental_features'
) as { useIsExperimentalFeatureEnabled: jest.Mock };

const ALERTS_INDEX = '.alerts-security.alerts-default';
const ATTACK_INDEX = '.alerts-security.attack.discovery.alerts-default';

const attackToAttach = {
  id: 'attack-1',
  index: ATTACK_INDEX,
  title: 'A multi-stage attack',
  summaryMarkdown: 'A summary of the attack',
  riskScore: 73,
  alertIds: ['alert-1', 'alert-2'],
};

let queryClient: QueryClient;

function wrapper(props: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, props.children);
}

describe('useBulkAttackCaseItems', () => {
  const onAddToNewCase = jest.fn();
  const onAddToExistingCase = jest.fn();
  const reportEventMock = jest.fn();
  let appToastsMock: ReturnType<typeof useAppToastsMock.create>;

  const mockKibana = ({ attachmentsEnabled = true, canCreateComment = true } = {}) => {
    useKibana.mockReturnValue({
      services: {
        telemetry: {
          reportEvent: reportEventMock,
        },
        cases: {
          config: {
            attachmentsEnabled,
          },
          helpers: {
            canUseCases: jest.fn().mockReturnValue({
              createComment: canCreateComment,
              read: true,
            }),
          },
        },
      },
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    reportEventMock.mockClear();
    queryClient = new QueryClient();
    appToastsMock = useAppToastsMock.create();

    mockKibana();
    useAssistantContext.mockReturnValue({ alertsIndexPattern: ALERTS_INDEX });
    useAppToasts.mockReturnValue(appToastsMock);
    useIsExperimentalFeatureEnabled.mockReturnValue(false);

    useAddToNewCase.mockReturnValue({
      disabled: false,
      onAddToNewCase,
    });

    useAddToExistingCase.mockReturnValue({
      disabled: false,
      onAddToExistingCase,
    });
  });

  it('should return two case items when user has permissions', () => {
    const { result } = renderHook(() => useBulkAttackCaseItems({ title: 'attack title' }), {
      wrapper,
    });

    expect(result.current.items).toHaveLength(2);
  });

  it('should return empty items when user lacks cases permissions', () => {
    mockKibana({ canCreateComment: false });

    const { result } = renderHook(() => useBulkAttackCaseItems({ title: 'attack title' }), {
      wrapper,
    });

    expect(result.current.items).toEqual([]);
  });

  it('should pass unique alert ids and markdown comments to onAddToNewCase', async () => {
    const closePopover = jest.fn();
    const { result } = renderHook(
      () => useBulkAttackCaseItems({ title: 'attack title', closePopover }),
      {
        wrapper,
      }
    );

    await result.current.items[1]?.onClick?.(
      [
        {
          _id: 'attack-1',
          data: [
            { field: ALERT_ATTACK_DISCOVERY_ALERT_IDS, value: ['alert-1', 'alert-2'] },
            { field: ALERT_ATTACK_DISCOVERY_MARKDOWN_COMMENT, value: ['markdown 1'] },
          ],
          ecs: { _id: 'attack-1' },
        },
        {
          _id: 'attack-2',
          data: [
            { field: ALERT_ATTACK_DISCOVERY_ALERT_IDS, value: ['alert-2', 'alert-3'] },
            { field: ALERT_ATTACK_DISCOVERY_MARKDOWN_COMMENT, value: ['markdown 2'] },
          ],
          ecs: { _id: 'attack-2' },
        },
      ],
      false,
      jest.fn(),
      jest.fn(),
      jest.fn()
    );

    expect(onAddToNewCase).toHaveBeenCalledWith({
      alertIds: ['alert-1', 'alert-2', 'alert-3'],
      markdownComments: ['markdown 1', 'markdown 2'],
    });
    expect(closePopover).toHaveBeenCalledTimes(1);
  });

  it('should report ActionAddedToCase event when adding to new case', async () => {
    const { result } = renderHook(
      () =>
        useBulkAttackCaseItems({
          title: 'attack title',
          telemetrySource: 'attacks_page_group_take_action',
        }),
      {
        wrapper,
      }
    );

    await result.current.items[1]?.onClick?.(
      [
        {
          _id: 'attack-1',
          data: [],
          ecs: { _id: 'attack-1' },
        },
      ],
      false,
      jest.fn(),
      jest.fn(),
      jest.fn()
    );

    expect(reportEventMock).toHaveBeenCalledWith(AttacksEventTypes.ActionAddedToCase, {
      source: 'attacks_page_group_take_action',
      action: 'add_to_new_case',
    });
  });

  it('should pass unique alert ids and markdown comments to onAddToExistingCase', async () => {
    const closePopover = jest.fn();
    const { result } = renderHook(
      () => useBulkAttackCaseItems({ title: 'attack title', closePopover }),
      {
        wrapper,
      }
    );

    await result.current.items[0]?.onClick?.(
      [
        {
          _id: 'attack-1',
          data: [
            { field: ALERT_ATTACK_DISCOVERY_ALERT_IDS, value: ['alert-1'] },
            { field: ALERT_ATTACK_DISCOVERY_MARKDOWN_COMMENT, value: ['markdown 1'] },
          ],
          ecs: { _id: 'attack-1' },
        },
        {
          _id: 'attack-2',
          data: [
            { field: ALERT_ATTACK_DISCOVERY_ALERT_IDS, value: ['alert-2'] },
            { field: ALERT_ATTACK_DISCOVERY_MARKDOWN_COMMENT, value: ['markdown 2'] },
          ],
          ecs: { _id: 'attack-2' },
        },
      ],
      false,
      jest.fn(),
      jest.fn(),
      jest.fn()
    );

    expect(onAddToExistingCase).toHaveBeenCalledWith({
      alertIds: ['alert-1', 'alert-2'],
      markdownComments: ['markdown 1', 'markdown 2'],
    });
    expect(closePopover).toHaveBeenCalledTimes(1);
  });

  it('should report ActionAddedToCase event when adding to existing case', async () => {
    const { result } = renderHook(
      () =>
        useBulkAttackCaseItems({
          title: 'attack title',
          telemetrySource: 'attacks_page_group_take_action',
        }),
      {
        wrapper,
      }
    );

    await result.current.items[0]?.onClick?.(
      [
        {
          _id: 'attack-1',
          data: [],
          ecs: { _id: 'attack-1' },
        },
      ],
      false,
      jest.fn(),
      jest.fn(),
      jest.fn()
    );

    expect(reportEventMock).toHaveBeenCalledWith(AttacksEventTypes.ActionAddedToCase, {
      source: 'attacks_page_group_take_action',
      action: 'add_to_existing_case',
    });
  });

  describe('when an attack is supplied', () => {
    const alertItems = [
      {
        _id: 'attack-1',
        data: [
          { field: ALERT_ATTACK_DISCOVERY_ALERT_IDS, value: ['alert-1', 'alert-2'] },
          { field: ALERT_ATTACK_DISCOVERY_MARKDOWN_COMMENT, value: ['markdown 1'] },
        ],
        ecs: { _id: 'attack-1' },
      },
    ];

    const clickItem = async (index: number, props = {}) => {
      const { result } = renderHook(
        () => useBulkAttackCaseItems({ title: 'attack title', attackToAttach, ...props }),
        { wrapper }
      );

      await result.current.items[index]?.onClick?.(
        alertItems,
        false,
        jest.fn(),
        jest.fn(),
        jest.fn()
      );
    };

    const expectedAttachments = [
      {
        type: SECURITY_ATTACK_ATTACHMENT_TYPE,
        attachmentId: 'attack-1',
        metadata: {
          title: 'A multi-stage attack',
          alertCount: 2,
          index: ATTACK_INDEX,
          summaryMarkdown: 'A summary of the attack',
          riskScore: 73,
        },
      },
      {
        type: SECURITY_ALERT_ATTACHMENT_TYPE,
        attachmentId: ['alert-1', 'alert-2'],
        metadata: { index: ALERTS_INDEX },
      },
    ];

    it('should post the attack attachment payload to a new case when the flag is on', async () => {
      useIsExperimentalFeatureEnabled.mockReturnValue(true);

      await clickItem(1);

      expect(onAddToNewCase).toHaveBeenCalledWith({
        alertIds: [],
        markdownComments: [],
        attachments: expectedAttachments,
      });
    });

    it('should post the attack attachment payload to an existing case when the flag is on', async () => {
      useIsExperimentalFeatureEnabled.mockReturnValue(true);

      await clickItem(0);

      expect(onAddToExistingCase).toHaveBeenCalledWith({
        alertIds: [],
        markdownComments: [],
        attachments: expectedAttachments,
      });
    });

    describe.each([
      ['the attacks page', 'attacks_page_group_take_action'],
      ['the attack flyout', 'attacks_page_flyout_take_action'],
    ] as const)('when attaching from %s', (_surface, telemetrySource) => {
      it('should report the add to new case event', async () => {
        useIsExperimentalFeatureEnabled.mockReturnValue(true);

        await clickItem(1, { telemetrySource });

        expect(reportEventMock).toHaveBeenCalledWith(AttacksEventTypes.ActionAddedToCase, {
          source: telemetrySource,
          action: 'add_to_new_case',
        });
      });

      it('should report the add to existing case event', async () => {
        useIsExperimentalFeatureEnabled.mockReturnValue(true);

        await clickItem(0, { telemetrySource });

        expect(reportEventMock).toHaveBeenCalledWith(AttacksEventTypes.ActionAddedToCase, {
          source: telemetrySource,
          action: 'add_to_existing_case',
        });
      });
    });

    it('should not create a markdown user comment when the flag is on', async () => {
      useIsExperimentalFeatureEnabled.mockReturnValue(true);

      await clickItem(1);

      const { attachments } = onAddToNewCase.mock.calls[0][0];
      expect(attachments).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ type: COMMENT_ATTACHMENT_TYPE })])
      );
    });

    it('should keep the markdown comment payload when the flag is off', async () => {
      await clickItem(1);

      expect(onAddToNewCase).toHaveBeenCalledWith({
        alertIds: ['alert-1', 'alert-2'],
        markdownComments: ['markdown 1'],
      });
      expect(onAddToExistingCase).not.toHaveBeenCalled();
    });

    it('should keep the markdown comment payload when the cases attachments framework is off', async () => {
      useIsExperimentalFeatureEnabled.mockReturnValue(true);
      mockKibana({ attachmentsEnabled: false });

      await clickItem(0);

      expect(onAddToExistingCase).toHaveBeenCalledWith({
        alertIds: ['alert-1', 'alert-2'],
        markdownComments: ['markdown 1'],
      });
    });

    it('should warn when the attack carries more alerts than a case accepts in one request', async () => {
      useIsExperimentalFeatureEnabled.mockReturnValue(true);
      const tooManyAlertIds = Array.from(
        { length: MAX_ALERTS_PER_CASE + 5 },
        (_, i) => `alert-${i}`
      );

      await clickItem(1, { attackToAttach: { ...attackToAttach, alertIds: tooManyAlertIds } });

      const { attachments } = onAddToNewCase.mock.calls[0][0];
      expect(attachments).toHaveLength(2);
      expect(attachments[1].attachmentId).toHaveLength(MAX_ALERTS_PER_CASE);
      expect(appToastsMock.addWarning).toHaveBeenCalledTimes(1);
    });

    it('should not warn when every constituent alert fits in one request', async () => {
      useIsExperimentalFeatureEnabled.mockReturnValue(true);

      await clickItem(1);

      expect(appToastsMock.addWarning).not.toHaveBeenCalled();
    });
  });

  it('should return empty panels', () => {
    const { result } = renderHook(() => useBulkAttackCaseItems({ title: 'attack title' }), {
      wrapper,
    });

    expect(result.current.panels).toEqual([]);
  });
});
