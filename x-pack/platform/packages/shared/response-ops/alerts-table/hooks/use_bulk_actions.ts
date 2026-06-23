/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type React from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import { ALERT_CASE_IDS, isSiemRuleType } from '@kbn/rule-data-utils';
import type { HttpStart } from '@kbn/core-http-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import type { ApplicationStart } from '@kbn/core-application-browser';
import { ALERT_RULE_UUID, ALERT_INSTANCE_ID } from '@kbn/rule-data-utils';
import { useBulkMuteAlerts } from '@kbn/response-ops-alerts-apis/hooks/use_bulk_mute_alerts';
import { useBulkUnmuteAlerts } from '@kbn/response-ops-alerts-apis/hooks/use_bulk_unmute_alerts';
import { useAlertsTableContext } from '../contexts/alerts_table_context';
import type {
  BulkActionsConfig,
  BulkActionsPanelConfig,
  BulkActionsState,
  BulkActionsReducerAction,
  TimelineItem,
  BulkEditTagsFlyoutState,
  BulkAddToChatConfig,
  OpenChatService,
} from '../types';
import { BulkActionsVerbs } from '../types';
import type { CasesService, PublicAlertsDataGridProps } from '../types';
import {
  ADD_TO_EXISTING_CASE,
  ADD_TO_NEW_CASE,
  ADD_TO_CHAT,
  ALERTS_ALREADY_ATTACHED_TO_CASE,
  EDIT_TAGS,
  MARK_AS_UNTRACKED,
  NO_ALERTS_ADDED_TO_CASE,
} from '../translations';
import { useBulkUntrackAlerts } from './use_bulk_untrack_alerts';
import { useBulkUntrackAlertsByQuery } from './use_bulk_untrack_alerts_by_query';
import { useTagsAction } from '../components/tags/use_tags_action';
import { MUTE_SELECTED, UNMUTE_SELECTED } from '../translations';

interface BulkActionsProps {
  ruleTypeIds?: string[];
  query: Partial<Pick<NonNullable<QueryDslQueryContainer>, 'bool' | 'ids'>>;
  alertsCount: number;
  casesConfig?: PublicAlertsDataGridProps['casesConfiguration'];
  additionalBulkActions?: PublicAlertsDataGridProps['additionalBulkActions'];
  refresh: () => void;
  hideBulkActions?: boolean;
  application: ApplicationStart;
  casesService?: CasesService;
  agentBuilderService?: OpenChatService;
  bulkAddToChatConfig?: BulkAddToChatConfig;
  http: HttpStart;
  notifications: NotificationsStart;
}

export interface UseBulkActions {
  isBulkActionsColumnActive: boolean;
  bulkActionsState: BulkActionsState;
  bulkActions: BulkActionsPanelConfig[];
  setIsBulkActionsLoading: (isLoading: boolean) => void;
  clearSelection: () => void;
  updateBulkActionsState: React.Dispatch<BulkActionsReducerAction>;
  bulkEditTagsFlyoutState: BulkEditTagsFlyoutState;
}

type UseBulkAddToCaseActionsProps = Pick<
  BulkActionsProps,
  'casesConfig' | 'refresh' | 'casesService' | 'http' | 'notifications'
> &
  Pick<UseBulkActions, 'clearSelection'>;

type UseBulkUntrackActionsProps = Pick<
  BulkActionsProps,
  'refresh' | 'query' | 'ruleTypeIds' | 'application' | 'http' | 'notifications'
> &
  Pick<UseBulkActions, 'clearSelection' | 'setIsBulkActionsLoading'> & {
    isAllSelected: boolean;
  };

type UseBulkTagsActionsProps = Pick<BulkActionsProps, 'refresh'> &
  Pick<UseBulkActions, 'clearSelection'>;

type UseBulkMuteActionsProps = Pick<BulkActionsProps, 'refresh' | 'http' | 'notifications'> &
  Pick<UseBulkActions, 'clearSelection' | 'setIsBulkActionsLoading'>;

const noCapabilitiesForAction = (capabilities: ApplicationStart['capabilities']) => {
  const hasApmPermission = capabilities?.apm?.['alerting:show'];
  const hasInfrastructurePermission = capabilities?.infrastructure?.show;
  const hasLogsPermission = capabilities?.logs?.show;
  const hasUptimePermission = capabilities?.uptime?.show;
  const hasSloPermission = capabilities?.slo?.show;
  const hasObservabilityPermission = capabilities?.observability?.show;

  const conditions = [
    hasApmPermission,
    hasInfrastructurePermission,
    hasLogsPermission,
    hasUptimePermission,
    hasSloPermission,
    hasObservabilityPermission,
  ];

  return conditions.every((condition) => !condition);
};

const filterAlertsAlreadyAttachedToCase = (alerts: TimelineItem[], caseId: string) =>
  alerts.filter(
    (alert) =>
      !alert.data.some(
        (field) => field.field === ALERT_CASE_IDS && field.value?.some((id) => id === caseId)
      )
  );

const getCaseAttachments = ({
  alerts,
  caseId,
  groupAlertsByRule,
}: {
  caseId: string;
  groupAlertsByRule?: CasesService['helpers']['groupAlertsByRule'];
  alerts?: TimelineItem[];
}) => {
  const filteredAlerts = filterAlertsAlreadyAttachedToCase(alerts ?? [], caseId);
  return groupAlertsByRule?.(filteredAlerts) ?? [];
};

const addItemsToInitialPanel = ({
  panels,
  items,
}: {
  panels: BulkActionsPanelConfig[];
  items: BulkActionsConfig[];
}) => {
  if (panels.length > 0) {
    if (panels[0].items) {
      panels[0].items = [...panels[0].items, ...items].filter(
        (item, index, self) => index === self.findIndex((newItem) => newItem.key === item.key)
      );
    }
    return panels;
  } else {
    return [{ id: 0, items }];
  }
};

export const useBulkAddToCaseActions = ({
  casesService,
  casesConfig,
  refresh,
  clearSelection,
}: UseBulkAddToCaseActionsProps): BulkActionsConfig[] => {
  const userCasesPermissions = useMemo(() => {
    return casesService?.helpers.canUseCases(casesConfig?.owner ?? []);
  }, [casesConfig?.owner, casesService]);
  const CasesContext = useMemo(() => casesService?.ui.getCasesContext(), [casesService]);
  const isCasesContextAvailable = Boolean(casesService && CasesContext);

  const onSuccess = useCallback(() => {
    refresh();
    clearSelection();
  }, [clearSelection, refresh]);

  const createCaseFlyout = casesService?.hooks.useCasesAddToNewCaseFlyout({ onSuccess });
  const selectCaseModal = casesService?.hooks.useCasesAddToExistingCaseModal({
    onSuccess,
    noAttachmentsToaster: {
      title: NO_ALERTS_ADDED_TO_CASE,
      content: ALERTS_ALREADY_ATTACHED_TO_CASE,
    },
  });

  return useMemo(() => {
    return isCasesContextAvailable &&
      createCaseFlyout &&
      selectCaseModal &&
      userCasesPermissions?.create &&
      userCasesPermissions?.read
      ? [
          {
            label: ADD_TO_NEW_CASE,
            key: 'attach-new-case',
            'data-test-subj': 'attach-new-case',
            disableOnQuery: true,
            disabledLabel: ADD_TO_NEW_CASE,
            onClick: (alerts?: TimelineItem[]) => {
              const caseAttachments = alerts
                ? casesService?.helpers.groupAlertsByRule(alerts) ?? []
                : [];
              createCaseFlyout.open({
                attachments: caseAttachments,
              });
            },
          },
          {
            label: ADD_TO_EXISTING_CASE,
            key: 'attach-existing-case',
            disableOnQuery: true,
            disabledLabel: ADD_TO_EXISTING_CASE,
            'data-test-subj': 'attach-existing-case',
            onClick: (alerts?: TimelineItem[]) => {
              selectCaseModal.open({
                getAttachments: ({ theCase }) => {
                  if (theCase == null) {
                    return alerts ? casesService?.helpers.groupAlertsByRule(alerts) ?? [] : [];
                  }

                  return getCaseAttachments({
                    alerts,
                    caseId: theCase.id,
                    groupAlertsByRule: casesService?.helpers.groupAlertsByRule,
                  });
                },
              });
            },
          },
        ]
      : [];
  }, [
    casesService?.helpers,
    createCaseFlyout,
    isCasesContextAvailable,
    selectCaseModal,
    userCasesPermissions?.create,
    userCasesPermissions?.read,
  ]);
};

export const useBulkUntrackActions = ({
  setIsBulkActionsLoading,
  refresh,
  clearSelection,
  query,
  ruleTypeIds = [],
  isAllSelected,
  http,
  notifications,
  application,
}: UseBulkUntrackActionsProps) => {
  const onSuccess = useCallback(() => {
    refresh();
    clearSelection();
  }, [clearSelection, refresh]);
  const { mutateAsync: untrackAlerts } = useBulkUntrackAlerts({ http, notifications });
  const { mutateAsync: untrackAlertsByQuery } = useBulkUntrackAlertsByQuery({
    http,
    notifications,
  });

  const onClick = useCallback(
    async (alerts?: TimelineItem[]) => {
      if (!alerts) return;
      const alertUuids = alerts.map((alert) => alert._id);
      const indices = alerts.map((alert) => alert._index ?? '');
      try {
        setIsBulkActionsLoading(true);
        if (isAllSelected) {
          await untrackAlertsByQuery({ query, ruleTypeIds });
        } else {
          await untrackAlerts({ indices, alertUuids });
        }
        onSuccess();
      } finally {
        setIsBulkActionsLoading(false);
      }
    },
    [
      query,
      ruleTypeIds,
      isAllSelected,
      onSuccess,
      setIsBulkActionsLoading,
      untrackAlerts,
      untrackAlertsByQuery,
    ]
  );

  return useMemo(() => {
    // Check if at least one Observability feature is enabled
    if (noCapabilitiesForAction(application?.capabilities)) return [];
    return [
      {
        label: MARK_AS_UNTRACKED,
        key: 'mark-as-untracked',
        disableOnQuery: false,
        disabledLabel: MARK_AS_UNTRACKED,
        'data-test-subj': 'mark-as-untracked',
        onClick,
      },
    ];
  }, [application?.capabilities, onClick]);
};

export const useBulkTagsActions = ({ refresh, clearSelection }: UseBulkTagsActionsProps) => {
  const onActionSuccess = useCallback(() => {
    refresh();
    clearSelection();
  }, [clearSelection, refresh]);

  const onActionError = useCallback(() => {
    refresh();
    clearSelection();
  }, [clearSelection, refresh]);

  const tagsAction = useTagsAction({
    onActionSuccess,
    onActionError,
    isDisabled: false,
  });

  return { tagsAction };
};

const groupAlertsByRule = (alerts: TimelineItem[]) => {
  const ruleMap = new Map<string, string[]>();

  for (const alert of alerts) {
    const ruleId = alert.data.find((d) => d.field === ALERT_RULE_UUID)?.value?.[0];
    const alertInstanceId = alert.data.find((d) => d.field === ALERT_INSTANCE_ID)?.value?.[0];

    if (ruleId && alertInstanceId) {
      const existing = ruleMap.get(ruleId) || [];
      existing.push(alertInstanceId);
      ruleMap.set(ruleId, existing);
    }
  }

  return Array.from(ruleMap.entries()).map(([ruleId, alertInstanceIds]) => ({
    rule_id: ruleId,
    alert_instance_ids: alertInstanceIds,
  }));
};

export const useBulkMuteActions = ({
  setIsBulkActionsLoading,
  refresh,
  clearSelection,
  http,
  notifications,
}: UseBulkMuteActionsProps) => {
  const onSuccess = useCallback(() => {
    refresh();
    clearSelection();
  }, [clearSelection, refresh]);

  const { mutateAsync: bulkMute } = useBulkMuteAlerts({ http, notifications, onSuccess });
  const { mutateAsync: bulkUnmute } = useBulkUnmuteAlerts({ http, notifications, onSuccess });

  const onMuteClick = useCallback(
    async (selectedAlerts?: TimelineItem[]) => {
      if (!selectedAlerts) return;
      const rules = groupAlertsByRule(selectedAlerts);
      if (rules.length === 0) return;

      try {
        setIsBulkActionsLoading(true);
        await bulkMute({ rules });
      } finally {
        setIsBulkActionsLoading(false);
      }
    },
    [bulkMute, setIsBulkActionsLoading]
  );

  const onUnmuteClick = useCallback(
    async (selectedAlerts?: TimelineItem[]) => {
      if (!selectedAlerts) return;
      const rules = groupAlertsByRule(selectedAlerts);
      if (rules.length === 0) return;

      try {
        setIsBulkActionsLoading(true);
        await bulkUnmute({ rules });
      } finally {
        setIsBulkActionsLoading(false);
      }
    },
    [bulkUnmute, setIsBulkActionsLoading]
  );

  return useMemo(
    () => [
      {
        label: MUTE_SELECTED,
        key: 'bulk-mute',
        disableOnQuery: true,
        disabledLabel: MUTE_SELECTED,
        'data-test-subj': 'bulk-mute',
        onClick: onMuteClick,
      },
      {
        label: UNMUTE_SELECTED,
        key: 'bulk-unmute',
        disableOnQuery: true,
        disabledLabel: UNMUTE_SELECTED,
        'data-test-subj': 'bulk-unmute',
        onClick: onUnmuteClick,
      },
    ],
    [onMuteClick, onUnmuteClick]
  );
};

export const useBulkAddToChatActions = ({
  agentBuilderService,
  bulkAddToChatConfig,
}: {
  agentBuilderService?: OpenChatService;
  bulkAddToChatConfig?: BulkAddToChatConfig;
}) => {
  const { convertAlertToAttachment, initialMessage, onAddedToChat } = bulkAddToChatConfig ?? {};

  const onAddToChatClick = useCallback(
    (alerts?: TimelineItem[]) => {
      if (!agentBuilderService || !convertAlertToAttachment) return;
      const items = alerts ?? [];
      agentBuilderService.openChat({
        autoSendInitialMessage: false,
        newConversation: true,
        initialMessage,
        attachments: convertAlertToAttachment(items),
      });
      onAddedToChat?.(items.length);
    },
    [agentBuilderService, convertAlertToAttachment, initialMessage, onAddedToChat]
  );

  return useMemo(() => {
    if (!agentBuilderService || !convertAlertToAttachment) return [];
    return [
      {
        label: ADD_TO_CHAT,
        key: 'bulk-add-to-chat',
        disableOnQuery: true,
        disabledLabel: ADD_TO_CHAT,
        'data-test-subj': 'bulk-add-to-chat',
        onClick: onAddToChatClick,
      },
    ];
  }, [agentBuilderService, convertAlertToAttachment, onAddToChatClick]);
};

const EMPTY_BULK_ACTIONS_CONFIG: BulkActionsPanelConfig[] = [];

export function useBulkActions({
  alertsCount,
  casesConfig,
  query,
  refresh,
  additionalBulkActions = EMPTY_BULK_ACTIONS_CONFIG,
  ruleTypeIds,
  hideBulkActions,
  http,
  notifications,
  application,
  casesService,
  agentBuilderService,
  bulkAddToChatConfig,
}: BulkActionsProps): UseBulkActions {
  const {
    bulkActionsStore: [bulkActionsState, updateBulkActionsState],
  } = useAlertsTableContext();

  const clearSelection = useCallback(() => {
    updateBulkActionsState({ action: BulkActionsVerbs.clear });
  }, [updateBulkActionsState]);
  const setIsBulkActionsLoading = useCallback(
    (isLoading = true) => {
      updateBulkActionsState({ action: BulkActionsVerbs.updateAllLoadingState, isLoading });
    },
    [updateBulkActionsState]
  );
  const caseBulkActions = useBulkAddToCaseActions({
    casesConfig,
    refresh,
    clearSelection,
    casesService,
    http,
    notifications,
  });
  const untrackBulkActions = useBulkUntrackActions({
    application,
    setIsBulkActionsLoading,
    refresh,
    clearSelection,
    query,
    ruleTypeIds,
    isAllSelected: bulkActionsState.isAllSelected,
    http,
    notifications,
  });
  const { tagsAction } = useBulkTagsActions({
    refresh,
    clearSelection,
  });
  const muteBulkActions = useBulkMuteActions({
    setIsBulkActionsLoading,
    refresh,
    clearSelection,
    http,
    notifications,
  });

  const tagsBulkActions = useMemo(() => {
    return noCapabilitiesForAction(application?.capabilities)
      ? []
      : [
          {
            label: EDIT_TAGS,
            key: 'edit-tags',
            disableOnQuery: true,
            disabledLabel: EDIT_TAGS,
            'data-test-subj': 'edit-tags',
            onClick: (alerts?: TimelineItem[]) => {
              if (!alerts) return;
              const alertsForFlyout = alerts.map((alert) => {
                return {
                  _id: alert._id,
                  _index: alert._index as string,
                };
              });
              const action = tagsAction.getAction(alertsForFlyout);
              action.onClick();
            },
          },
        ];
  }, [tagsAction, application?.capabilities]);
  const addToChatActions = useBulkAddToChatActions({
    agentBuilderService,
    bulkAddToChatConfig,
  });

  const initialItems = useMemo(() => {
    const isSiem = ruleTypeIds?.some(isSiemRuleType);
    return [
      ...caseBulkActions,
      ...addToChatActions,
      ...(isSiem ? [] : untrackBulkActions),
      ...(isSiem ? [] : tagsBulkActions),
      ...(isSiem ? [] : muteBulkActions),
    ];
  }, [
    caseBulkActions,
    ruleTypeIds,
    untrackBulkActions,
    tagsBulkActions,
    muteBulkActions,
    addToChatActions,
  ]);

  const bulkActions = useMemo(() => {
    if (hideBulkActions) {
      return [];
    }

    return initialItems.length
      ? addItemsToInitialPanel({
          panels: additionalBulkActions,
          items: initialItems,
        })
      : additionalBulkActions;
  }, [additionalBulkActions, initialItems, hideBulkActions]);

  const isBulkActionsColumnActive = bulkActions.length !== 0;

  useEffect(() => {
    updateBulkActionsState({
      action: BulkActionsVerbs.rowCountUpdate,
      rowCount: alertsCount,
    });
  }, [alertsCount, updateBulkActionsState]);

  const bulkEditTagsFlyoutState = useMemo(() => {
    return {
      isFlyoutOpen: tagsAction.isFlyoutOpen,
      onClose: tagsAction.onClose,
      onSaveTags: tagsAction.onSaveTags,
    };
  }, [tagsAction]);

  return useMemo(() => {
    return {
      isBulkActionsColumnActive,
      bulkActionsState,
      bulkActions,
      setIsBulkActionsLoading,
      clearSelection,
      updateBulkActionsState,
      bulkEditTagsFlyoutState,
    };
  }, [
    bulkActions,
    bulkActionsState,
    clearSelection,
    isBulkActionsColumnActive,
    setIsBulkActionsLoading,
    updateBulkActionsState,
    bulkEditTagsFlyoutState,
  ]);
}
