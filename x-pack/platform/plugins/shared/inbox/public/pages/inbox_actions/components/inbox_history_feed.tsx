/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCodeBlock,
  EuiCommentList,
  EuiEmptyPrompt,
  EuiFieldSearch,
  EuiFilterButton,
  EuiFilterGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHighlight,
  EuiIcon,
  EuiLoadingSpinner,
  EuiPanel,
  EuiPopover,
  EuiSelectable,
  EuiSpacer,
  EuiTablePagination,
  EuiText,
  EuiTitle,
  EuiToolTip,
  useGeneratedHtmlId,
  type EuiSelectableOption,
  type EuiCommentProps,
  type IconType,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type { InboxAction } from '@kbn/inbox-common';
import { DEFAULT_INBOX_ACTIONS_PER_PAGE, INBOX_CHANNELS } from '@kbn/inbox-common';
import { useInboxActionsHistory, useInboxActionsHistoryFacets } from '../../../hooks/use_inbox_api';
import * as i18n from '../translations';
import { InboxReasoning } from './inbox_reasoning';

const HISTORY_SEARCH_MAX_LENGTH = 256;
const HISTORY_SEARCH_DEBOUNCE_MS = 300;

/**
 * History rows pass through two server states during the "responded but
 * not yet resumed" window: the audit fields land synchronously via
 * {@link https://github.com/elastic/security-team/issues/16706 markStepAsResponded},
 * and the response payload (`response_input`) is then filled in after
 * Task Manager runs the resume. We surface the in-flight state with a
 * "Processing…" badge instead of an invented client-side optimistic flag,
 * so every client (Slack, agent builder, Kibana) renders consistent
 * intermediate state.
 */
const isProcessing = (action: InboxAction): boolean =>
  action.response_mode === 'responded' && action.response_input == null;

const formatTimestamp = (iso?: string | null): string => {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
};

/**
 * Per-channel display config. The keys are the well-known core
 * surfaces from `INBOX_CHANNELS` plus opt-in entries for first-party
 * client integrations we want to render with a friendly label/icon
 * (e.g. the public `example-mcp-app-security` reference). Anything
 * not in this map falls through to a neutral pill in
 * `renderChannelBadge`, so the audit feed stays readable for
 * arbitrary client-supplied slugs (third-party MCP apps, custom
 * automations) without a Kibana code change.
 */
const CHANNEL_DISPLAY: Record<string, { label: string; icon: IconType }> = {
  [INBOX_CHANNELS.inbox]: { label: i18n.HISTORY_CHANNEL_INBOX, icon: 'email' },
  [INBOX_CHANNELS.kibanaExecutionView]: {
    label: i18n.HISTORY_CHANNEL_KIBANA_EXECUTION_VIEW,
    icon: 'logoKibana',
  },
  [INBOX_CHANNELS.agentBuilder]: {
    label: i18n.HISTORY_CHANNEL_AGENT_BUILDER,
    icon: 'sparkles',
  },
  [INBOX_CHANNELS.slack]: { label: i18n.HISTORY_CHANNEL_SLACK, icon: 'logoSlack' },
  // First-party reference MCP app
  // (https://github.com/elastic/example-mcp-app-security). Kept as a
  // discrete entry so its history rows render with a recognizable
  // tag instead of a generic fallback pill.
  'example-mcp-app-security': {
    label: i18n.HISTORY_CHANNEL_EXAMPLE_MCP_APP_SECURITY,
    icon: 'logoSecurity',
  },
};

/**
 * The default channel (`inbox`) is the overwhelmingly common case for
 * Kibana-UI responses, so we suppress its badge to keep the audit feed
 * uncluttered. Non-default channels (Slack, MCP/API, agent builder)
 * show an explicit tag so the audit trail makes the source obvious.
 *
 * Returns `null` when no badge should render — also covers the
 * pre-channel-feature history rows that ship with `channel: null`.
 */
const renderChannelBadge = (channel: InboxAction['channel']) => {
  if (!channel || channel === INBOX_CHANNELS.inbox) {
    return null;
  }
  const display = CHANNEL_DISPLAY[channel] ?? { label: channel, icon: 'globe' as IconType };
  return (
    <EuiToolTip position="top" content={i18n.getHistoryChannelTooltip(display.label)}>
      {/*
        EuiBadge is non-interactive on its own, so we make it keyboard
        focusable to satisfy the @elastic/eui/tooltip-focusable-anchor
        rule. The tooltip text is the user-facing affordance — there's
        no equivalent click target to switch to.
      */}
      <EuiBadge
        color="hollow"
        iconType={display.icon}
        tabIndex={0}
        data-test-subj="inboxHistoryChannelBadge"
      >
        {display.label}
      </EuiBadge>
    </EuiToolTip>
  );
};

const buildBody = (action: InboxAction) => {
  const responsePayload = action.response_input ?? null;
  return (
    <EuiFlexGroup direction="column" gutterSize="s">
      <InboxReasoning reasoning={action.reasoning} />
      {action.input_message ? (
        <EuiFlexItem>
          <EuiText size="xs" color="subdued">
            <strong>{i18n.HISTORY_PROMPT_LABEL}</strong>
          </EuiText>
          <EuiText size="s">
            <p>{action.input_message}</p>
          </EuiText>
        </EuiFlexItem>
      ) : null}
      <EuiFlexItem>
        <EuiText size="xs" color="subdued">
          <strong>{i18n.HISTORY_RESPONSE_LABEL}</strong>
        </EuiText>
        {isProcessing(action) ? (
          <EuiText size="s" color="subdued">
            <p>{i18n.HISTORY_RESPONSE_PROCESSING_BODY}</p>
          </EuiText>
        ) : responsePayload && Object.keys(responsePayload).length > 0 ? (
          <EuiCodeBlock language="json" fontSize="s" paddingSize="s" isCopyable>
            {JSON.stringify(responsePayload, null, 2)}
          </EuiCodeBlock>
        ) : (
          <EuiText size="s" color="subdued">
            <p>{i18n.HISTORY_NO_RESPONSE_PAYLOAD}</p>
          </EuiText>
        )}
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

const buildComment = (action: InboxAction): EuiCommentProps => {
  const responder = action.responded_by ?? i18n.HISTORY_SYSTEM_RESPONDER;
  const timestampLabel = formatTimestamp(action.responded_at ?? action.created_at);
  const isTimedOut = action.response_mode === 'timed_out';
  const isRejected = action.status === 'rejected';
  const processing = isProcessing(action);
  const channelBadge = renderChannelBadge(action.channel);

  return {
    // EuiCommentList renders the `username` in the avatar/header, so
    // we don't repeat it in `event` text — that's what produced the
    // "elastic elastic responded" double-up surfaced during browser
    // validation.
    username: responder,
    timelineAvatarAriaLabel: responder,
    // Render the event as a single flowing sentence ("responded to <title>")
    // with the metadata badges grouped as one inline-flex unit right after
    // it. Keeping the sentence as plain inline prose (rather than a flex item
    // competing with the badges for row space) stops the title from being
    // squeezed onto its own line — it wraps as a normal sentence, and the
    // badge cluster wraps as a whole only when the row truly overflows.
    event: (
      <>
        <FormattedMessage
          id="xpack.inbox.actionsPage.historySection.eventText"
          defaultMessage="responded to {title}"
          values={{
            title: <em>{action.title}</em>,
          }}
        />
        <EuiFlexGroup
          component="span"
          gutterSize="xs"
          alignItems="center"
          responsive={false}
          wrap
          css={{ display: 'inline-flex', verticalAlign: 'middle', marginInlineStart: '8px' }}
        >
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">{action.source_app}</EuiBadge>
          </EuiFlexItem>
          {/*
            Approve/reject status badge — only rendered once the outcome is
            actually known. `deriveHistoryStatus` (server-side) defaults to
            `'approved'` whenever it can't read a rejection from the response
            payload, which includes two states where the outcome is NOT a
            settled approval:
              - processing (responded, but the engine hasn't written
                `response_input` yet — the value is still unknown and could
                resolve to a rejection), and
              - timed-out / abnormally-settled rows (no human approval at all).
            Showing a green "Approved" in those states is misleading (a
            contradictory "Approved + Timed out" pairing, or a green→red flip
            mid-processing), so we defer to the Processing…/Timed out badges
            below and only surface approve-vs-reject for genuinely settled rows.
          */}
          {!processing && !isTimedOut ? (
            <EuiFlexItem grow={false}>
              {isRejected ? (
                <EuiBadge
                  color="danger"
                  iconType="cross"
                  data-test-subj="inboxHistoryRejectedBadge"
                >
                  {i18n.STATUS_REJECTED}
                </EuiBadge>
              ) : (
                <EuiBadge color="success" iconType="check">
                  {i18n.STATUS_APPROVED}
                </EuiBadge>
              )}
            </EuiFlexItem>
          ) : null}
          {channelBadge ? <EuiFlexItem grow={false}>{channelBadge}</EuiFlexItem> : null}
          {isTimedOut ? (
            <EuiFlexItem grow={false}>
              <EuiBadge color="warning">{i18n.HISTORY_TIMED_OUT_BADGE}</EuiBadge>
            </EuiFlexItem>
          ) : null}
          {action.source_deleted ? (
            <EuiFlexItem grow={false}>
              <EuiToolTip position="top" content={i18n.HISTORY_SOURCE_DELETED_TOOLTIP}>
                {/*
                  Non-interactive badge made keyboard-focusable so the tooltip
                  (the only affordance explaining why this row's source is gone)
                  satisfies @elastic/eui/tooltip-focusable-anchor.
                */}
                <EuiBadge
                  color="default"
                  iconType="trash"
                  tabIndex={0}
                  data-test-subj="inboxHistorySourceDeletedBadge"
                >
                  {i18n.HISTORY_SOURCE_DELETED_BADGE}
                </EuiBadge>
              </EuiToolTip>
            </EuiFlexItem>
          ) : null}
          {processing ? (
            <EuiFlexItem grow={false}>
              <EuiBadge
                color="accent"
                iconType="clock"
                data-test-subj="inboxHistoryProcessingBadge"
              >
                {i18n.HISTORY_PROCESSING_BADGE}
              </EuiBadge>
            </EuiFlexItem>
          ) : null}
        </EuiFlexGroup>
      </>
    ),
    timestamp: timestampLabel,
    children: buildBody(action),
  };
};

interface FacetBucket {
  value: string;
  count: number;
}

interface ChannelFilterProps {
  selected: string[];
  options: FacetBucket[];
  onChange: (next: string[]) => void;
}

/**
 * Channel filter: options come from the cross-provider facets agg so the
 * dropdown surfaces every channel slug observed in the space's processed
 * history (built-in surfaces plus arbitrary client-supplied slugs like
 * `example-mcp-app-security`). Each option reuses the existing
 * `CHANNEL_DISPLAY` lookup so labels and icons match the badge users already
 * see in feed rows.
 */
const ChannelFilter: React.FC<ChannelFilterProps> = ({ selected, options, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const labelId = useGeneratedHtmlId({ prefix: 'inboxHistoryChannelFilter' });

  const selectableOptions: EuiSelectableOption[] = options.map((bucket) => {
    const display = CHANNEL_DISPLAY[bucket.value] ?? {
      label: bucket.value,
      icon: 'globe' as IconType,
    };
    return {
      key: bucket.value,
      label: display.label,
      // Stash the raw value so we don't have to round-trip through the
      // (possibly user-friendly, possibly translated) label.
      data: { value: bucket.value, icon: display.icon },
      checked: selected.includes(bucket.value) ? 'on' : undefined,
      'data-test-subj': `inboxHistoryChannelFilterOption-${bucket.value}`,
    };
  });

  const handleChange = (
    _next: EuiSelectableOption[],
    _event: unknown,
    changed: EuiSelectableOption
  ) => {
    const value = (changed.data as { value?: string } | undefined)?.value;
    if (!value) return;
    onChange(
      changed.checked === 'on'
        ? Array.from(new Set([...selected, value]))
        : selected.filter((entry) => entry !== value)
    );
  };

  return (
    <EuiPopover
      ownFocus
      aria-labelledby={labelId}
      button={
        <EuiFilterButton
          grow
          iconType="arrowDown"
          isSelected={isOpen}
          numFilters={selectableOptions.length}
          numActiveFilters={selected.length}
          hasActiveFilters={selected.length > 0}
          onClick={() => setIsOpen((open) => !open)}
          data-test-subj="inboxHistoryChannelFilterButton"
          id={labelId}
        >
          {i18n.HISTORY_FILTERS_CHANNEL_LABEL}
        </EuiFilterButton>
      }
      isOpen={isOpen}
      closePopover={() => setIsOpen(false)}
      panelPaddingSize="none"
      repositionOnScroll
    >
      <EuiSelectable
        aria-label={i18n.HISTORY_FILTERS_CHANNEL_LABEL}
        options={selectableOptions}
        onChange={handleChange}
        searchable
        searchProps={{
          placeholder: i18n.HISTORY_FILTERS_CHANNEL_SEARCH_PLACEHOLDER,
          'data-test-subj': 'inboxHistoryChannelFilterSearch',
        }}
        listProps={{ isVirtualized: false }}
        emptyMessage={i18n.HISTORY_FILTERS_NO_OPTIONS}
        renderOption={(option, searchValue) => {
          const icon = (option.data as { icon?: IconType } | undefined)?.icon ?? 'globe';
          return (
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                {/*
                  Decorative icon — the row's text label is the affordance and
                  the option is keyboard-targetable via EuiSelectable. The icon
                  must be `aria-hidden` to satisfy
                  `@elastic/eui/icon-accessibility-rules`.
                */}
                <EuiIcon type={icon} aria-hidden={true} />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiHighlight search={searchValue}>{option.label}</EuiHighlight>
              </EuiFlexItem>
            </EuiFlexGroup>
          );
        }}
        data-test-subj="inboxHistoryChannelFilterSelectableList"
      >
        {(list, search) => (
          <div style={{ width: 280 }}>
            {search}
            {list}
          </div>
        )}
      </EuiSelectable>
    </EuiPopover>
  );
};

interface ResponderFilterProps {
  selected: string[];
  options: FacetBucket[];
  onChange: (next: string[]) => void;
}

/**
 * Responder filter: options come from the cross-provider facets agg so the
 * dropdown enumerates every responder seen in the space's processed history.
 * No icon affordance — the value itself is the username and that's the only
 * data the user needs to match against.
 */
const ResponderFilter: React.FC<ResponderFilterProps> = ({ selected, options, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const labelId = useGeneratedHtmlId({ prefix: 'inboxHistoryResponderFilter' });

  const selectableOptions: EuiSelectableOption[] = options.map((bucket) => ({
    key: bucket.value,
    label: bucket.value,
    data: { value: bucket.value },
    checked: selected.includes(bucket.value) ? 'on' : undefined,
    'data-test-subj': `inboxHistoryResponderFilterOption-${bucket.value}`,
  }));

  const handleChange = (
    _next: EuiSelectableOption[],
    _event: unknown,
    changed: EuiSelectableOption
  ) => {
    const value = (changed.data as { value?: string } | undefined)?.value;
    if (!value) return;
    onChange(
      changed.checked === 'on'
        ? Array.from(new Set([...selected, value]))
        : selected.filter((entry) => entry !== value)
    );
  };

  return (
    <EuiPopover
      ownFocus
      aria-labelledby={labelId}
      button={
        <EuiFilterButton
          grow
          iconType="arrowDown"
          isSelected={isOpen}
          numFilters={selectableOptions.length}
          numActiveFilters={selected.length}
          hasActiveFilters={selected.length > 0}
          onClick={() => setIsOpen((open) => !open)}
          data-test-subj="inboxHistoryResponderFilterButton"
          id={labelId}
        >
          {i18n.HISTORY_FILTERS_RESPONDER_LABEL}
        </EuiFilterButton>
      }
      isOpen={isOpen}
      closePopover={() => setIsOpen(false)}
      panelPaddingSize="none"
      repositionOnScroll
    >
      <EuiSelectable
        aria-label={i18n.HISTORY_FILTERS_RESPONDER_LABEL}
        options={selectableOptions}
        onChange={handleChange}
        searchable
        searchProps={{
          placeholder: i18n.HISTORY_FILTERS_RESPONDER_SEARCH_PLACEHOLDER,
          'data-test-subj': 'inboxHistoryResponderFilterSearch',
        }}
        listProps={{ isVirtualized: false }}
        emptyMessage={i18n.HISTORY_FILTERS_NO_OPTIONS}
        data-test-subj="inboxHistoryResponderFilterSelectableList"
      >
        {(list, search) => (
          <div style={{ width: 280 }}>
            {search}
            {list}
          </div>
        )}
      </EuiSelectable>
    </EuiPopover>
  );
};

interface HistoryFiltersBarProps {
  search: string;
  channel: string[];
  respondedBy: string[];
  sortOrder: 'asc' | 'desc';
  channelOptions: FacetBucket[];
  responderOptions: FacetBucket[];
  onSearchChange: (next: string) => void;
  onChannelChange: (next: string[]) => void;
  onRespondedByChange: (next: string[]) => void;
  onSortOrderChange: (next: 'asc' | 'desc') => void;
}

/**
 * Filter bar above the audit feed. Search input on the left, a sort-direction
 * toggle, and two dropdown pills (Responder / Channel) wrapped in a single
 * `EuiFilterGroup` so they render as one connected row. Order intentionally
 * puts the most-discriminating dimensions (Responder, Channel) first.
 */
const HistoryFiltersBar: React.FC<HistoryFiltersBarProps> = ({
  search,
  channel,
  respondedBy,
  sortOrder,
  channelOptions,
  responderOptions,
  onSearchChange,
  onChannelChange,
  onRespondedByChange,
  onSortOrderChange,
}) => {
  return (
    <EuiFlexGroup gutterSize="s" alignItems="center" wrap responsive={false}>
      <EuiFlexItem grow={true} style={{ minWidth: 240 }}>
        <EuiFieldSearch
          fullWidth
          incremental
          placeholder={i18n.HISTORY_FILTERS_SEARCH_PLACEHOLDER}
          aria-label={i18n.HISTORY_FILTERS_SEARCH_ARIA_LABEL}
          value={search}
          maxLength={HISTORY_SEARCH_MAX_LENGTH}
          onChange={(event) => onSearchChange(event.target.value)}
          data-test-subj="inboxHistorySearchInput"
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiButtonEmpty
          size="s"
          iconType={sortOrder === 'desc' ? 'sortDown' : 'sortUp'}
          onClick={() => onSortOrderChange(sortOrder === 'desc' ? 'asc' : 'desc')}
          data-test-subj="inboxHistorySortToggle"
        >
          {sortOrder === 'desc' ? i18n.HISTORY_SORT_NEWEST : i18n.HISTORY_SORT_OLDEST}
        </EuiButtonEmpty>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiFilterGroup>
          <ResponderFilter
            selected={respondedBy}
            options={responderOptions}
            onChange={onRespondedByChange}
          />
          <ChannelFilter selected={channel} options={channelOptions} onChange={onChannelChange} />
        </EuiFilterGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

export const InboxHistoryFeed: React.FC = () => {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_INBOX_ACTIONS_PER_PAGE);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState<string[]>([]);
  const [respondedBy, setRespondedBy] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setSearch(searchInput);
      setPageIndex(0);
    }, HISTORY_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  // Build the filter payload exactly once per render. Whitespace-only search
  // strings collapse to undefined so the hook does not emit an empty-`q`
  // query param (which would still hit the server).
  const filters = useMemo(
    () => ({
      page: pageIndex + 1,
      perPage: pageSize,
      q: search.trim().length > 0 ? search.trim() : undefined,
      channel: channel.length > 0 ? channel : undefined,
      respondedBy: respondedBy.length > 0 ? respondedBy : undefined,
      sortOrder,
    }),
    [pageIndex, pageSize, search, channel, respondedBy, sortOrder]
  );

  const { data, isLoading, error, refetch } = useInboxActionsHistory(filters);
  // Facets feed the dropdown options. React Query holds them with a 60s
  // client-side stale time (see `useInboxActionsHistoryFacets`) so opening a
  // popover doesn't refetch every time; the facets route itself is not cached
  // server-side. Empty fallback keeps the bar operational on first paint /
  // cold cache.
  const { data: facetsData } = useInboxActionsHistoryFacets();
  const channelOptions = facetsData?.channel ?? [];
  const responderOptions = facetsData?.respondedBy ?? [];

  const items = data?.actions ?? [];
  const totalItemCount = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalItemCount / pageSize));

  // Filter changes invalidate the current page index — the merged-sort
  // result-set is different, so showing "page 5 of the new result set" would
  // silently land the user on something they didn't ask for.
  const handleSearchChange = useCallback((next: string) => {
    setSearchInput(next.slice(0, HISTORY_SEARCH_MAX_LENGTH));
  }, []);
  const handleChannelChange = useCallback((next: string[]) => {
    setChannel(next);
    setPageIndex(0);
  }, []);
  const handleRespondedByChange = useCallback((next: string[]) => {
    setRespondedBy(next);
    setPageIndex(0);
  }, []);
  const handleSortOrderChange = useCallback((next: 'asc' | 'desc') => {
    setSortOrder(next);
    setPageIndex(0);
  }, []);

  const hasActiveFilters =
    searchInput.trim().length > 0 || channel.length > 0 || respondedBy.length > 0;

  return (
    <EuiPanel hasBorder paddingSize="l" data-test-subj="inboxHistorySection">
      <EuiTitle size="m">
        <h2>{i18n.HISTORY_SECTION_TITLE}</h2>
      </EuiTitle>
      <EuiSpacer size="xs" />
      <EuiText color="subdued" size="s">
        <p>{i18n.HISTORY_SECTION_DESCRIPTION}</p>
      </EuiText>
      <EuiSpacer size="m" />

      <HistoryFiltersBar
        search={searchInput}
        channel={channel}
        respondedBy={respondedBy}
        sortOrder={sortOrder}
        channelOptions={channelOptions}
        responderOptions={responderOptions}
        onSearchChange={handleSearchChange}
        onChannelChange={handleChannelChange}
        onRespondedByChange={handleRespondedByChange}
        onSortOrderChange={handleSortOrderChange}
      />
      <EuiSpacer size="m" />

      {error ? (
        <EuiEmptyPrompt
          color="danger"
          iconType="warning"
          title={<h3>{i18n.HISTORY_LOAD_ERROR_TITLE}</h3>}
          body={<p>{i18n.getHistoryLoadErrorBody(String(error))}</p>}
          actions={[
            <EuiButton key="retry" onClick={() => refetch()} iconType="refresh">
              {i18n.RETRY_BUTTON}
            </EuiButton>,
          ]}
        />
      ) : isLoading && items.length === 0 ? (
        <EuiFlexGroup justifyContent="center" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="l" />
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : items.length === 0 ? (
        <EuiEmptyPrompt
          iconType={hasActiveFilters ? 'search' : 'clock'}
          title={
            <h3>
              {hasActiveFilters ? i18n.HISTORY_FILTERED_EMPTY_TITLE : i18n.HISTORY_EMPTY_TITLE}
            </h3>
          }
          body={
            <p>{hasActiveFilters ? i18n.HISTORY_FILTERED_EMPTY_BODY : i18n.HISTORY_EMPTY_BODY}</p>
          }
        />
      ) : (
        <>
          <EuiCommentList
            aria-label={i18n.HISTORY_SECTION_TITLE}
            comments={items.map(buildComment)}
          />
          <EuiSpacer size="m" />
          <EuiTablePagination
            pageCount={pageCount}
            activePage={pageIndex}
            onChangePage={setPageIndex}
            itemsPerPage={pageSize}
            itemsPerPageOptions={[10, 25, 50]}
            onChangeItemsPerPage={(size) => {
              setPageSize(size);
              setPageIndex(0);
            }}
          />
        </>
      )}
    </EuiPanel>
  );
};
