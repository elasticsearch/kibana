/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTable,
  EuiButtonIcon,
  EuiCallOut,
  EuiCodeBlock,
  EuiComment,
  EuiCommentList,
  EuiCopy,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutFooter,
  EuiHorizontalRule,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
  EuiTitle,
  EuiToolTip,
  type EuiBasicTableColumn,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { useQueryClient } from '@kbn/react-query';
import type { AlertEpisodeStatus } from '@kbn/alerting-v2-schemas';
import { getBreachEsqlQuery } from '@kbn/alerting-v2-schemas';
import { useFetchEpisodeEventsQuery } from '@kbn/alerting-v2-episodes-ui/hooks/use_fetch_episode_events_query';
import { useFetchEpisodeEventDataQuery } from '@kbn/alerting-v2-episodes-ui/hooks/use_fetch_episode_event_data_query';
import { useAlertingEpisodeSourceDataView } from '@kbn/alerting-v2-episodes-ui/hooks/use_alerting_episode_source_data_view';
import { buildDataTableRecord } from '@kbn/discover-utils';
import { useFetchEpisodeActions } from '@kbn/alerting-v2-episodes-ui/hooks/use_fetch_episode_actions';
import { useFetchGroupActions } from '@kbn/alerting-v2-episodes-ui/hooks/use_fetch_group_actions';
import { useAlertingRulesCache } from '@kbn/alerting-v2-episodes-ui/hooks/use_alerting_rules_cache';
import { useBulkGetProfiles } from '@kbn/alerting-v2-episodes-ui/hooks/use_bulk_get_profiles';
import type { UserProfileWithAvatar } from '@kbn/user-profile-components';
import { UserAvatar } from '@kbn/user-profile-components';
import { AlertEpisodeStatusBadge } from '@kbn/alerting-v2-episodes-ui/components/status/status_badge';
import { AlertEpisodeTags } from '@kbn/alerting-v2-episodes-ui/components/actions/tags';
import { getDefaultClosingReasonLabel } from '@kbn/response-ops-detections-close-reason';
import { createEpisodeActions } from '@kbn/alerting-v2-episodes-ui/actions';
import {
  getLastEpisodeStatus,
  getRuleIdFromEpisodeRows,
  getGroupHashFromEpisodeRows,
  getTriggeredTimestamp,
  getEpisodeDurationMs,
} from '@kbn/alerting-v2-episodes-ui/utils/episode_series_derived';
import type { EpisodeEventRow } from '@kbn/alerting-v2-episodes-ui/queries/episode_events_query';
import {
  parseEpisodeDataJson,
  getNonEmptyGroupingFields,
  getValueByFieldPath,
  formatGroupingValueForDisplay,
} from '@kbn/alerting-v2-episodes-ui/utils/episode_grouping_data';
import {
  useFetchEpisodeChangelog,
  type EpisodeChangelogEntry,
} from '../hooks/use_fetch_episode_changelog';
import { FlyoutHeader } from '../../flyout/shared/components/flyout_header';
import { FlyoutBody } from '../../flyout/shared/components/flyout_body';
import { useKibana } from '../../common/lib/kibana';
import { TakeActionDropdown } from '../components/take_action_dropdown';
import { EpisodeAssigneeCell } from '../components/episode_assignee_cell';
import { createWorkflowActions } from '../actions/workflow_actions';
import { AddNote } from '../../notes/components/add_note';
import { NotesList } from '../../notes/components/notes_list';
import { DeleteConfirmModal } from '../../notes/components/delete_confirm_modal';
import type { Note } from '../../../common/api/timeline';
import type { State } from '../../common/store';
import {
  fetchNotesByDocumentIds,
  makeSelectNotesByDocumentId,
  ReqStatus,
  selectFetchNotesByDocumentIdsError,
  selectFetchNotesByDocumentIdsStatus,
  selectNotesTablePendingDeleteIds,
} from '../../notes/store/notes.slice';
import { useUserPrivileges } from '../../common/components/user_privileges';
import * as i18n from '../translations';

export interface AlertsV2DetailsPanelParams {
  episodeId: string;
  initialTab?: FlyoutTab;
}

export interface AlertsV2DetailsPanelProps {
  params: AlertsV2DetailsPanelParams;
}

const getEventColumns = (
  toggleExpand: (id: string) => void,
  expandedIds: Set<string>
): Array<EuiBasicTableColumn<EpisodeEventRow>> => [
  {
    width: '40px',
    isExpander: true,
    render: (row: EpisodeEventRow) => {
      const id = `${row['@timestamp']}-${row['episode.id']}`;
      return (
        <EuiButtonIcon
          aria-label={expandedIds.has(id) ? 'Collapse' : 'Expand'}
          iconType={expandedIds.has(id) ? 'arrowDown' : 'arrowRight'}
          onClick={() => toggleExpand(id)}
        />
      );
    },
  },
  {
    field: '@timestamp',
    name: '@timestamp',
    sortable: true,
    width: '200px',
    render: (ts: string) =>
      new Date(ts).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
  },
  {
    field: 'status',
    name: 'Event status',
    width: '120px',
  },
  {
    field: 'episode.status',
    name: 'Episode status',
    width: '140px',
    render: (status: AlertEpisodeStatus) => <AlertEpisodeStatusBadge status={status} />,
  },
];

const monoWrapCss = css`
  font-family: 'Roboto Mono', 'Courier New', monospace;
  font-size: 0.8125rem;
  word-break: break-all;
`;

const CopyableId: React.FC<{ value: string }> = ({ value }) => (
  <EuiCopy textToCopy={value}>
    {(copy) => (
      <EuiToolTip content="Click to copy">
        <button
          type="button"
          onClick={copy}
          css={css`
            all: unset;
            cursor: pointer;
            &:hover {
              text-decoration: underline;
            }
          `}
        >
          <span css={monoWrapCss}>{value}</span>
        </button>
      </EuiToolTip>
    )}
  </EuiCopy>
);

type FlyoutTab = 'overview' | 'metadata' | 'json' | 'events_log' | 'notes';

const ACTION_TYPE_LABELS: Record<string, string> = {
  ack: 'Acknowledged',
  unack: 'Unacknowledged',
  snooze: 'Snoozed',
  unsnooze: 'Unsnoozed',
  deactivate: 'Closed',
  activate: 'Re-opened',
  tag: 'Tags updated',
  assign: 'Assignee changed',
};

const ACTION_TYPE_ICONS: Record<string, string> = {
  ack: 'check',
  unack: 'cross',
  snooze: 'bellSlash',
  unsnooze: 'bell',
  deactivate: 'securitySignalResolved',
  activate: 'securitySignal',
  tag: 'tag',
  assign: 'user',
};

const formatEventsLogTimestamp = (ts: string): string =>
  new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

const resolveUsername = (
  uid: string | null,
  profilesMap: Map<string, UserProfileWithAvatar>
): string => {
  if (!uid) return 'system';
  const profile = profilesMap.get(uid);
  return profile?.user?.full_name ?? profile?.user?.username ?? uid;
};

const getEventsLogDescription = (
  entry: EpisodeChangelogEntry,
  profilesMap: Map<string, UserProfileWithAvatar>
): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  if (entry.reason) {
    const isCloseAction = entry.action_type === 'deactivate' || entry.action_type === 'activate';
    if (isCloseAction) {
      const label = getDefaultClosingReasonLabel(entry.reason);
      parts.push(
        <>
          Reason: <strong>{label}</strong>
        </>
      );
    } else {
      parts.push(entry.reason);
    }
  }
  if (entry.action_type === 'snooze' && entry.expiry) {
    parts.push(
      `Until ${new Date(entry.expiry).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })}`
    );
  }
  if (entry.action_type === 'tag' && entry.tags) {
    const tagList = Array.isArray(entry.tags) ? entry.tags : [entry.tags];
    parts.push(<AlertEpisodeTags tags={tagList} />);
  }
  if (entry.action_type === 'assign') {
    const assigneeName = resolveUsername(entry.assignee_uid, profilesMap);
    parts.push(
      entry.assignee_uid ? (
        <>
          Assigned to <strong>{assigneeName}</strong>
        </>
      ) : (
        'Assignee removed'
      )
    );
  }
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return (
    <EuiFlexGroup gutterSize="xs" alignItems="center" wrap responsive={false}>
      {parts.map((part, idx) => (
        <EuiFlexItem grow={false} key={idx}>
          {idx > 0 && <>&nbsp;&bull;&nbsp;</>}
          {part}
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
  );
};

export const AlertsV2DetailsPanel: React.FC<AlertsV2DetailsPanelProps> = ({ params }) => {
  const { episodeId, initialTab } = params;
  const services = useKibana().services;
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState<FlyoutTab>(initialTab ?? 'overview');
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set());

  const dispatch = useDispatch();
  const { notesPrivileges } = useUserPrivileges();
  const canCreateNotes = notesPrivileges.crud;

  const selectNotesByDocumentId = useMemo(() => makeSelectNotesByDocumentId(), []);
  const notes: Note[] = useSelector((state: State) => selectNotesByDocumentId(state, episodeId));
  const pendingDeleteIds = useSelector((state: State) => selectNotesTablePendingDeleteIds(state));
  const notesFetchStatus = useSelector((state: State) =>
    selectFetchNotesByDocumentIdsStatus(state)
  );
  const notesFetchError = useSelector((state: State) => selectFetchNotesByDocumentIdsError(state));

  const fetchNotes = useCallback(
    () => dispatch(fetchNotesByDocumentIds({ documentIds: [episodeId] })),
    [dispatch, episodeId]
  );

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  useEffect(() => {
    if (notesFetchStatus === ReqStatus.Failed && notesFetchError) {
      services.notifications.toasts.addError(notesFetchError as Error, {
        title: 'Error fetching notes',
      });
    }
  }, [notesFetchStatus, notesFetchError, services.notifications.toasts]);

  const onTabClick = useCallback((tab: FlyoutTab) => setSelectedTab(tab), []);

  const handleShowNotes = useCallback(() => setSelectedTab('notes'), []);

  const toggleEventExpand = useCallback((id: string) => {
    setExpandedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const {
    data: eventRows = [],
    isLoading: isLoadingEvents,
    refetch: refetchEvents,
  } = useFetchEpisodeEventsQuery({
    episodeId,
    services: { data: services.data, spaces: services.spaces },
  });

  const {
    data: episodeEventData,
    isLoading: isLoadingEventData,
    isError: isEventDataError,
  } = useFetchEpisodeEventDataQuery({
    episodeId,
    services: { data: services.data, spaces: services.spaces },
  });

  const ruleId = useMemo(() => getRuleIdFromEpisodeRows(eventRows), [eventRows]);
  const groupHash = useMemo(() => getGroupHashFromEpisodeRows(eventRows), [eventRows]);
  const lastStatus = useMemo(() => getLastEpisodeStatus(eventRows), [eventRows]);
  const triggeredAt = useMemo(() => getTriggeredTimestamp(eventRows), [eventRows]);
  const durationMs = useMemo(() => getEpisodeDurationMs(eventRows), [eventRows]);

  const { data: episodeActionsMap, refetch: refetchEpisodeActions } = useFetchEpisodeActions({
    episodeIds: episodeId ? [episodeId] : [],
    services: { expressions: services.expressions, spaces: services.spaces },
  });

  const { data: groupActionsMap, refetch: refetchGroupActions } = useFetchGroupActions({
    groupHashes: groupHash ? [groupHash] : [],
    services: { expressions: services.expressions, spaces: services.spaces },
  });

  const { data: eventsLogEntries = [], isLoading: isLoadingEventsLog } = useFetchEpisodeChangelog({
    episodeId,
    groupHash,
    data: services.data,
  });

  const eventsLogUids = useMemo(() => {
    const uids = new Set<string>();
    for (const entry of eventsLogEntries) {
      if (entry.actor) uids.add(entry.actor);
      if (entry.assignee_uid) uids.add(entry.assignee_uid);
    }
    return [...uids];
  }, [eventsLogEntries]);

  const { data: eventsLogProfiles } = useBulkGetProfiles({
    userProfile: services.userProfile,
    uids: eventsLogUids,
    toasts: services.notifications.toasts,
    errorTitle: 'Failed to load user profiles',
  });

  const eventsLogProfilesMap = useMemo(() => {
    const map = new Map<string, UserProfileWithAvatar>();
    if (eventsLogProfiles) {
      for (const profile of eventsLogProfiles) {
        map.set(profile.uid, profile as UserProfileWithAvatar);
      }
    }
    return map;
  }, [eventsLogProfiles]);

  const episodeAction = episodeId ? episodeActionsMap?.get(episodeId) : undefined;
  const groupAction = groupHash ? groupActionsMap?.get(groupHash) : undefined;
  const rawTags = groupAction?.tags;
  const tags = Array.isArray(rawTags) ? rawTags : rawTags ? [rawTags] : [];

  const episodeActions = useMemo(
    () =>
      createEpisodeActions({
        http: services.http,
        overlays: services.overlays,
        notifications: services.notifications,
        rendering: services.rendering,
        application: services.application,
        userProfile: services.userProfile,
        docLinks: services.docLinks,
        expressions: services.expressions,
        spaces: services.spaces,
        queryClient,
        getDiscoverHref: () => undefined,
      }),
    [services, queryClient]
  );

  const securityActions = useMemo(
    () => createWorkflowActions({ http: services.http, notifications: services.notifications }),
    [services.http, services.notifications]
  );

  const handleActionSuccess = useMemo(
    () => () => {
      refetchEvents();
      refetchEpisodeActions();
      refetchGroupActions();
    },
    [refetchEvents, refetchEpisodeActions, refetchGroupActions]
  );

  const derivedWorkflowStatus = useMemo(() => {
    if (groupAction?.lastDeactivateAction === 'deactivate') return 'closed' as const;
    if (episodeAction?.lastAckAction === 'ack') return 'acknowledged' as const;
    return 'open' as const;
  }, [episodeAction, groupAction]);

  const syntheticEpisode = useMemo(() => {
    if (!episodeId || !lastStatus) return undefined;
    return {
      '@timestamp': eventRows[eventRows.length - 1]?.['@timestamp'] ?? '',
      'episode.id': episodeId,
      'episode.status': lastStatus,
      'rule.id': ruleId ?? '',
      group_hash: groupHash ?? '',
      first_timestamp: eventRows[0]?.['@timestamp'] ?? '',
      last_timestamp: eventRows[eventRows.length - 1]?.['@timestamp'] ?? '',
      duration: durationMs ?? 0,
      workflow_status: derivedWorkflowStatus,
      last_ack_action: (episodeAction?.lastAckAction as 'ack' | 'unack' | undefined) ?? undefined,
      last_assignee_uid: episodeAction?.lastAssigneeUid ?? undefined,
      last_snooze_action:
        (groupAction?.lastSnoozeAction as 'snooze' | 'unsnooze' | undefined) ?? undefined,
      last_deactivate_action:
        (groupAction?.lastDeactivateAction as 'activate' | 'deactivate' | undefined) ?? undefined,
      last_tags: groupAction?.tags,
    };
  }, [
    episodeId,
    lastStatus,
    ruleId,
    groupHash,
    eventRows,
    durationMs,
    derivedWorkflowStatus,
    episodeAction,
    groupAction,
  ]);

  const latestEventRow = eventRows.length > 0 ? eventRows[eventRows.length - 1] : null;

  const ruleEventJson = useMemo(
    () =>
      JSON.stringify(
        latestEventRow
          ? {
              ...latestEventRow,
              ...(episodeEventData
                ? {
                    data: episodeEventData.data,
                    data_timestamp: episodeEventData.dataTimestamp,
                    is_stale: episodeEventData.isStale,
                  }
                : {}),
            }
          : null,
        null,
        2
      ),
    [latestEventRow, episodeEventData]
  );

  const workflowStatusBadge = useMemo(() => {
    switch (derivedWorkflowStatus) {
      case 'acknowledged':
        return <EuiBadge color="warning">{i18n.STATUS_ACKNOWLEDGED}</EuiBadge>;
      case 'closed':
        return <EuiBadge color="default">{i18n.STATUS_CLOSED}</EuiBadge>;
      case 'open':
      default:
        return <EuiBadge color="primary">{i18n.STATUS_OPEN}</EuiBadge>;
    }
  }, [derivedWorkflowStatus]);

  const ruleIds = useMemo(() => (ruleId ? [ruleId] : []), [ruleId]);
  const { rulesCache } = useAlertingRulesCache({ ruleIds, services });
  const cachedRule = ruleId ? rulesCache[ruleId] : undefined;
  const ruleName = cachedRule?.metadata?.name;
  const ruleQuery = cachedRule ? getBreachEsqlQuery(cachedRule.query) : undefined;
  const ruleGroupingFields = cachedRule?.grouping?.fields;

  const groupingFieldItems = useMemo(() => {
    if (!ruleGroupingFields?.length || !episodeEventData?.data) return [];
    const data = episodeEventData.data as Record<string, unknown>;
    const parsed = typeof data === 'string' ? parseEpisodeDataJson(data) : data;
    return getNonEmptyGroupingFields(ruleGroupingFields, parsed).map((field) => ({
      field,
      value: formatGroupingValueForDisplay(getValueByFieldPath(parsed, field)),
    }));
  }, [ruleGroupingFields, episodeEventData]);

  const metadataServices = useMemo(
    () => ({ dataViews: services.dataViews, http: services.http }),
    [services.dataViews, services.http]
  );

  const { value: metadataDataView, loading: isMetadataDataViewLoading } =
    useAlertingEpisodeSourceDataView({
      query: ruleQuery,
      dataViews: metadataServices.dataViews,
      http: metadataServices.http,
    });

  const docViewerRegistry = (
    services as unknown as {
      unifiedDocViewer?: {
        registry: {
          getAll: () => Array<{
            id: string;
            render?: (props: Record<string, unknown>) => React.ReactNode;
          }>;
        };
      };
    }
  ).unifiedDocViewer?.registry;

  const tableDocView = useMemo(
    () => docViewerRegistry?.getAll()?.find((dv) => dv.id === 'doc_view_table'),
    [docViewerRegistry]
  );

  const metadataHit = useMemo(() => {
    if (!episodeEventData || !metadataDataView) return undefined;
    return buildDataTableRecord({ _source: episodeEventData.data }, metadataDataView);
  }, [episodeEventData, metadataDataView]);

  const assigneeUid = episodeAction?.lastAssigneeUid ?? undefined;

  const detailItems = useMemo(
    () => [
      {
        title: i18n.COLUMN_STATUS,
        description: workflowStatusBadge,
      },
      {
        title: i18n.FLYOUT_ASSIGNEE_LABEL,
        description: (
          <EpisodeAssigneeCell assigneeUid={assigneeUid} userProfile={services.userProfile} />
        ),
      },
      ...(tags.length > 0
        ? [{ title: i18n.FLYOUT_TAGS_LABEL, description: <AlertEpisodeTags tags={tags} /> }]
        : []),
      {
        title: i18n.FLYOUT_RULE_LABEL,
        description: ruleName ?? (ruleId ? <CopyableId value={ruleId} /> : '\u2014'),
      },
      {
        title: i18n.FLYOUT_TRIGGERED_LABEL,
        description: triggeredAt
          ? new Date(triggeredAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })
          : '\u2014',
      },
      {
        title: i18n.FLYOUT_EPISODE_ID_LABEL,
        description: <CopyableId value={episodeId} />,
      },
      {
        title: i18n.FLYOUT_GROUP_HASH_LABEL,
        description: groupHash ? <CopyableId value={groupHash} /> : '\u2014',
      },
      ...(groupingFieldItems.length > 0
        ? [
            {
              title: i18n.FLYOUT_GROUPING_FIELDS_LABEL,
              description: (
                <EuiFlexGroup gutterSize="xs" wrap responsive={false} alignItems="center">
                  {groupingFieldItems.map(({ field, value }) => (
                    <EuiFlexItem grow={false} key={field}>
                      <EuiBadge color="hollow">
                        <strong>{field}</strong>
                        {`: ${value}`}
                      </EuiBadge>
                    </EuiFlexItem>
                  ))}
                </EuiFlexGroup>
              ),
            },
          ]
        : []),
    ],
    [
      episodeId,
      ruleId,
      ruleName,
      triggeredAt,
      groupHash,
      workflowStatusBadge,
      tags,
      assigneeUid,
      services.userProfile,
      groupingFieldItems,
    ]
  );

  if (isLoadingEvents) {
    return (
      <EuiFlexGroup justifyContent="center" alignItems="center" style={{ height: '100%' }}>
        <EuiFlexItem grow={false}>
          <EuiLoadingSpinner size="xl" />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  const renderOverviewTab = () => (
    <>
      <EuiTitle size="xs">
        <h3>{i18n.FLYOUT_TITLE}</h3>
      </EuiTitle>
      <EuiSpacer size="m" />
      <EuiDescriptionList compressed type="responsiveColumn" listItems={detailItems} />

      <EuiHorizontalRule margin="l" />

      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>{i18n.FLYOUT_EVENTS_TITLE}</h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color="hollow">{i18n.FLYOUT_EVENT_COUNT(eventRows.length)}</EuiBadge>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />

      {eventRows.length === 0 ? (
        <EuiText size="s" color="subdued">
          {i18n.FLYOUT_NO_EVENTS}
        </EuiText>
      ) : (
        <EuiBasicTable
          items={eventRows}
          itemId={(row) => `${row['@timestamp']}-${row['episode.id']}`}
          columns={getEventColumns(toggleEventExpand, expandedEventIds)}
          itemIdToExpandedRowMap={Object.fromEntries(
            eventRows
              .filter((row) => expandedEventIds.has(`${row['@timestamp']}-${row['episode.id']}`))
              .map((row) => {
                const { data: rawData, ...rest } = row;
                let parsedData: unknown;
                try {
                  parsedData =
                    typeof rawData === 'string' ? JSON.parse(rawData) : rawData ?? undefined;
                } catch {
                  parsedData = rawData;
                }
                const displayRow = parsedData !== undefined ? { ...rest, data: parsedData } : rest;
                return [
                  `${row['@timestamp']}-${row['episode.id']}`,
                  <EuiCodeBlock
                    key={`${row['@timestamp']}-${row['episode.id']}`}
                    language="json"
                    isCopyable
                    overflowHeight={300}
                    paddingSize="s"
                    fontSize="s"
                  >
                    {JSON.stringify(displayRow, null, 2)}
                  </EuiCodeBlock>,
                ];
              })
          )}
          tableCaption={i18n.FLYOUT_EVENTS_TITLE}
          tableLayout="auto"
          compressed
        />
      )}
    </>
  );

  const renderJsonTab = () => (
    <EuiCodeBlock language="json" isCopyable overflowHeight={600} paddingSize="m" fontSize="s">
      {ruleEventJson}
    </EuiCodeBlock>
  );

  const renderMetadataTab = () => {
    if (isEventDataError) {
      return (
        <EuiText size="s" color="subdued">
          {i18n.FLYOUT_METADATA_ERROR}
        </EuiText>
      );
    }

    if (isLoadingEventData || isMetadataDataViewLoading) {
      return (
        <EuiFlexGroup justifyContent="center" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="l" />
          </EuiFlexItem>
        </EuiFlexGroup>
      );
    }

    if (!metadataHit || !metadataDataView || !episodeEventData) {
      return (
        <EuiText size="s" color="subdued">
          {i18n.FLYOUT_METADATA_EMPTY}
        </EuiText>
      );
    }

    return (
      <EuiFlexGroup
        direction="column"
        gutterSize="s"
        css={css`
          height: 100%;
        `}
      >
        {episodeEventData.isStale && (
          <EuiFlexItem grow={false}>
            <EuiCallOut
              announceOnMount
              size="s"
              color="warning"
              iconType="clock"
              title={i18n.FLYOUT_METADATA_STALE}
            />
          </EuiFlexItem>
        )}
        <EuiFlexItem
          grow
          css={css`
            min-height: 0;
          `}
        >
          {tableDocView?.render?.({ hit: metadataHit, dataView: metadataDataView }) ?? null}
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  const renderEventsLogTab = () => {
    if (isLoadingEventsLog) {
      return (
        <EuiFlexGroup justifyContent="center" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="l" />
          </EuiFlexItem>
        </EuiFlexGroup>
      );
    }

    if (eventsLogEntries.length === 0) {
      return (
        <EuiText size="s" color="subdued">
          {i18n.FLYOUT_EVENTS_LOG_EMPTY}
        </EuiText>
      );
    }

    return (
      <EuiCommentList aria-label={i18n.FLYOUT_TAB_EVENTS_LOG}>
        {eventsLogEntries.map((entry, idx) => {
          const actorProfile = entry.actor ? eventsLogProfilesMap.get(entry.actor) : undefined;
          const username = resolveUsername(entry.actor, eventsLogProfilesMap);
          const avatar = actorProfile ? (
            <UserAvatar user={actorProfile.user} avatar={actorProfile.data?.avatar} size="s" />
          ) : undefined;

          const rawEventJson = JSON.stringify(entry, null, 2);
          const description = getEventsLogDescription(entry, eventsLogProfilesMap);

          return (
            <EuiComment
              key={`${entry['@timestamp']}-${entry.action_type}-${idx}`}
              username={username}
              timestamp={formatEventsLogTimestamp(entry['@timestamp'])}
              event={ACTION_TYPE_LABELS[entry.action_type] ?? entry.action_type}
              timelineAvatar={avatar ?? ACTION_TYPE_ICONS[entry.action_type] ?? 'dot'}
            >
              {description && <EuiText size="s">{description}</EuiText>}
              <EuiSpacer size="s" />
              <EuiAccordion
                id={`raw-event-${idx}`}
                buttonContent={i18n.FLYOUT_RAW_EVENT}
                paddingSize="s"
              >
                <EuiCodeBlock
                  language="json"
                  isCopyable
                  overflowHeight={300}
                  paddingSize="s"
                  fontSize="s"
                >
                  {rawEventJson}
                </EuiCodeBlock>
              </EuiAccordion>
            </EuiComment>
          );
        })}
      </EuiCommentList>
    );
  };

  const renderNotesTab = () => (
    <EuiPanel hasBorder={false} hasShadow={false}>
      {notesFetchStatus === ReqStatus.Loading && (
        <EuiFlexGroup justifyContent="center" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="xl" />
          </EuiFlexItem>
        </EuiFlexGroup>
      )}
      {notesFetchStatus === ReqStatus.Succeeded && notes.length === 0 && (
        <EuiFlexGroup justifyContent="center">
          <EuiFlexItem grow={false}>
            <EuiText size="s" color="subdued">
              {i18n.FLYOUT_NO_NOTES}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      )}
      {notes.length > 0 && (
        <NotesList notes={notes} options={{ hideFlyoutIcon: true, hideTimelineIcon: true }} />
      )}
      {canCreateNotes && (
        <>
          <EuiSpacer />
          <AddNote eventId={episodeId} timelineId="" />
        </>
      )}
      {pendingDeleteIds.length > 0 && <DeleteConfirmModal />}
    </EuiPanel>
  );

  return (
    <>
      <FlyoutHeader>
        <EuiTitle size="s">
          <h2>{i18n.FLYOUT_TITLE}</h2>
        </EuiTitle>
        <EuiSpacer size="m" />
        <EuiTabs size="s" bottomBorder={false}>
          <EuiTab isSelected={selectedTab === 'overview'} onClick={() => onTabClick('overview')}>
            {i18n.FLYOUT_TAB_OVERVIEW}
          </EuiTab>
          <EuiTab isSelected={selectedTab === 'json'} onClick={() => onTabClick('json')}>
            {i18n.FLYOUT_TAB_JSON}
          </EuiTab>
          <EuiTab isSelected={selectedTab === 'metadata'} onClick={() => onTabClick('metadata')}>
            {i18n.FLYOUT_TAB_METADATA}
          </EuiTab>
          <EuiTab
            isSelected={selectedTab === 'events_log'}
            onClick={() => onTabClick('events_log')}
          >
            {i18n.FLYOUT_TAB_EVENTS_LOG}
            {eventsLogEntries.length > 0 && (
              <>
                {' '}
                <EuiBadge color="hollow">{eventsLogEntries.length}</EuiBadge>
              </>
            )}
          </EuiTab>
          <EuiTab isSelected={selectedTab === 'notes'} onClick={() => onTabClick('notes')}>
            {i18n.FLYOUT_TAB_NOTES}
            {notes.length > 0 && (
              <>
                {' '}
                <EuiBadge color="hollow">{notes.length}</EuiBadge>
              </>
            )}
          </EuiTab>
        </EuiTabs>
      </FlyoutHeader>

      <FlyoutBody>
        {selectedTab === 'overview' && renderOverviewTab()}
        {selectedTab === 'json' && renderJsonTab()}
        {selectedTab === 'metadata' && renderMetadataTab()}
        {selectedTab === 'events_log' && renderEventsLogTab()}
        {selectedTab === 'notes' && renderNotesTab()}
      </FlyoutBody>

      {syntheticEpisode && (
        <EuiFlyoutFooter>
          <EuiPanel color="transparent">
            <EuiFlexGroup justifyContent="flexEnd" alignItems="center">
              <EuiFlexItem grow={false}>
                <TakeActionDropdown
                  episodeActions={episodeActions}
                  securityActions={securityActions}
                  episode={syntheticEpisode as any}
                  onActionSuccess={handleActionSuccess}
                  onShowNotes={handleShowNotes}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
        </EuiFlyoutFooter>
      )}
    </>
  );
};
