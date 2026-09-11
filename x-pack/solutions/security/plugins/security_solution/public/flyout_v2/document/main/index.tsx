/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiLink,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiTab,
  EuiTabs,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { css } from '@emotion/react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { getFieldValue } from '@kbn/discover-utils';
import { EVENT_KIND } from '@kbn/rule-data-utils';
import type { CellActionRenderer } from '../../shared/components/cell_actions';
import { useAlertsPrivileges } from '../../../detections/containers/detection_engine/alerts/use_alerts_privileges';
import { FlyoutLoading } from '../../shared/components/flyout_loading';
import { FlyoutMissingAlertsPrivilege } from './components/flyout_missing_alerts_privilege';
import { EventKind } from './constants/event_kinds';
import { Footer } from './footer';
import { Header } from './header';
import { OverviewTab } from './tabs/overview_tab';
import { JsonTab } from './tabs/json_tab';
import { TableTab } from './tabs/table_tab';
import { FLYOUT_STORAGE_KEYS } from './constants/local_storage';
import { useTabs } from '../../shared/hooks/use_tabs';
import { useFlyoutApi } from '../../use_flyout_api';
import type { OpenFlyoutLinkProps } from '../../shared/components/open_flyout_link';
import { OpenFlyoutLink } from '../../shared/components/open_flyout_link';
import { useIsInSecurityApp } from '../../../common/hooks/is_in_security_app';
import {
  EVENT_SOURCE_FIELD_NAME,
  LEGACY_EVENT_SOURCE_FIELD_NAME,
  LEGACY_SIGNAL_RULE_NAME_FIELD_NAME,
  SIGNAL_RULE_NAME_FIELD_NAME,
} from '../../../timelines/components/timeline/body/renderers/constants';
import { RemoteDocumentCallout } from './components/remote_document_callout';
import { getAncestorsIndexById } from './utils/get_ancestors_index_by_id';
import { FLYOUT_ORIGIN, FLYOUT_TYPE } from '../../../common/lib/telemetry';
import { isRulePreviewDocument } from '../../shared/utils/is_rule_preview_document';
import { FLYOUT_V2_LOADING_SPINNER_TEST_ID } from './components/test_ids';

const footerStyles = css`
  @media (max-width: 767px) {
    overflow: auto;
  }
`;

const headerStyles = css`
  @media (max-width: 767px) {
    overflow: auto;
  }
`;

type DocumentFlyoutTabId = 'overview' | 'table' | 'json';

const VALID_TAB_IDS: DocumentFlyoutTabId[] = ['overview', 'table', 'json'];

export const OVERVIEW_TAB_TEST_ID = 'securitySolutionDocumentDetailsFlyoutOverviewTab';
export const TABLE_TAB_TEST_ID = 'securitySolutionDocumentDetailsFlyoutTableTab';
export const JSON_TAB_TEST_ID = 'securitySolutionDocumentDetailsFlyoutJsonTab';
export const TABLE_TAB_SOURCE_EVENT_LINK_TEST_ID =
  'securitySolutionDocumentDetailsFlyoutTableTabSourceEventLink';

const OVERVIEW_TAB_LABEL = i18n.translate(
  'xpack.securitySolution.flyout.document.overviewTabLabel',
  {
    defaultMessage: 'Overview',
  }
);
const TABLE_TAB_LABEL = i18n.translate('xpack.securitySolution.flyout.document.tableTabLabel', {
  defaultMessage: 'Table',
});
const JSON_TAB_LABEL = i18n.translate('xpack.securitySolution.flyout.document.jsonTabLabel', {
  defaultMessage: 'JSON',
});

export interface DocumentFlyoutProps {
  /**
   * The document to display
   */
  hit: DataTableRecord;
  /**
   * Cell action renderer for the analyzer
   */
  renderCellActions: CellActionRenderer;
  /**
   * Callback invoked after alert mutations to refresh related flyouts.
   */
  onAlertUpdated: () => void;
  /**
   * Optional test subject applied to the existing flyout header.
   */
  dataTestSubj?: string;
  /**
   * `true` while in-flyout pagination is resolving the document on another page
   * of the source. The previously displayed document is kept mounted (so the
   * header keeps its pagination controls) while the body shows a spinner.
   */
  isPaginationLoading?: boolean;
  /**
   * Callout rendered in the flyout body when the requested document could not be resolved (it was
   * not found, or the fetch failed). `hit` then holds the last document that did resolve, so the
   * header — and with it the pagination controls — survives a bad target and the user can page back
   * instead of having to close and reopen the flyout.
   */
  unavailableDocumentCallout?: ReactNode;
}

/**
 * Content for the document flyout, combining the header and overview tab.
 */
export const DocumentFlyout = memo(
  ({
    hit,
    onAlertUpdated,
    renderCellActions,
    dataTestSubj,
    isPaginationLoading = false,
    unavailableDocumentCallout,
  }: DocumentFlyoutProps) => {
    const { openNotes, openDocumentFlyoutFromPattern } = useFlyoutApi();
    // In both cases the rendered `hit` is no longer the document the flyout is resolving, so the
    // body is swapped out and the controls that would act on `hit` are withheld.
    const isDocumentStale = isPaginationLoading || unavailableDocumentCallout != null;
    const isAlert = useMemo(
      () => (getFieldValue(hit, EVENT_KIND) as string) === EventKind.signal,
      [hit]
    );
    const isRulePreview = useMemo(() => isRulePreviewDocument(hit), [hit]);
    const isSecurityApp = useIsInSecurityApp();
    const { hasAlertsRead, loading } = useAlertsPrivileges();
    const missingAlertsPrivilege = !loading && !hasAlertsRead && isAlert;
    // The Table and JSON tabs are only available in Security Solution, not in Discover.
    // The selected tab is persisted to localStorage.
    const { selectedTabId, setSelectedTabId } = useTabs<DocumentFlyoutTabId>({
      validTabIds: VALID_TAB_IDS,
      storageKey: FLYOUT_STORAGE_KEYS.SELECTED_TAB,
      flyoutType: FLYOUT_TYPE.DOCUMENT,
    });

    // The rule flyout is keyed by the rule UUID, but the table/highlighted fields display the rule
    // name. We resolve the UUID from the document so a click on a rule name opens the right rule.
    const ruleId = useMemo(
      () =>
        (getFieldValue(hit, EVENT_KIND) as string) === EventKind.signal
          ? (getFieldValue(hit, 'kibana.alert.rule.uuid') as string)
          : (getFieldValue(hit, 'signal.rule.id') as string),
      [hit]
    );

    // Maps each ancestor document id to the index it lives in, so a Source event value in the Table
    // tab can open that specific ancestor document. Threshold rules are excluded (see helper).
    const ancestorsIndexById = useMemo(
      () =>
        getAncestorsIndexById(
          hit,
          hit.raw._index ?? (getFieldValue(hit, '_index') as string) ?? ''
        ),
      [hit]
    );

    // Opens the relevant system flyout (host, ip, rule) when a supported value is clicked in the
    // Table tab. Mirrors the Highlighted Fields behavior in the Overview tab.
    const renderFlyoutLink = useCallback(
      (props: OpenFlyoutLinkProps) => {
        // Source event: the raw `kibana.alert.ancestors.id` field (or its legacy `signal.ancestors.id`
        // equivalent) can list several ancestor documents, so each value is matched to its own index
        // and opened in a new flyout. Values without a resolved index (e.g. a threshold rule's
        // synthetic ancestor) render as plain text.
        //
        // We resolve by *pattern* (routing the search at the ancestor index) rather than by concrete
        // `_index`: the from-index path pins the lookup with a `term` filter on `_index`, which never
        // matches a cross-cluster document (on the remote the stored `_index` is bare, while the
        // resolved index carries the `cluster:` alias). Routing at the index reaches the document,
        // like the legacy flyout. See SDH https://github.com/elastic/sdh-security-team/issues/1666.
        if (
          props.field === EVENT_SOURCE_FIELD_NAME ||
          props.field === LEGACY_EVENT_SOURCE_FIELD_NAME
        ) {
          const indexName = ancestorsIndexById[props.value];
          if (!indexName) {
            return <>{props.children}</>;
          }
          return (
            <EuiLink
              onClick={() =>
                openDocumentFlyoutFromPattern({
                  documentId: props.value,
                  indexName,
                  origin: FLYOUT_ORIGIN.FLYOUT_FIELD_LINK,
                })
              }
              data-test-subj={TABLE_TAB_SOURCE_EVENT_LINK_TEST_ID}
            >
              {props.children}
            </EuiLink>
          );
        }
        // Rule name fields: substitute the rule UUID as the link target (the flyout is keyed by
        // UUID) while keeping the rule name as the displayed text. When no UUID is available,
        // or when in rule preview (the rule doesn't exist yet), render plain text.
        if (
          props.field === SIGNAL_RULE_NAME_FIELD_NAME ||
          props.field === LEGACY_SIGNAL_RULE_NAME_FIELD_NAME
        ) {
          if (!ruleId || isRulePreview) {
            return <>{props.children}</>;
          }
          return <OpenFlyoutLink {...props} value={ruleId} displayValue={props.value} asParent />;
        }
        return <OpenFlyoutLink {...props} />;
      },
      [ruleId, isRulePreview, ancestorsIndexById, openDocumentFlyoutFromPattern]
    );

    const onShowNotesFromHeader = useCallback(() => {
      openNotes({ hit, origin: FLYOUT_ORIGIN.FLYOUT_HEADER });
    }, [openNotes, hit]);

    const onShowNotesFromFooter = useCallback(() => {
      openNotes({ hit, origin: FLYOUT_ORIGIN.FOOTER_TAKE_ACTION });
    }, [openNotes, hit]);

    if (isAlert && loading) {
      return <FlyoutLoading data-test-subj="document-overview-loading" />;
    }

    if (missingAlertsPrivilege) {
      return <FlyoutMissingAlertsPrivilege />;
    }

    return (
      <>
        <RemoteDocumentCallout hit={hit} />
        <EuiFlyoutHeader
          css={isDocumentStale ? undefined : headerStyles}
          data-test-subj={dataTestSubj}
        >
          <Header
            hit={hit}
            renderCellActions={renderCellActions}
            onAlertUpdated={onAlertUpdated}
            onShowNotes={onShowNotesFromHeader}
            isDocumentStale={isDocumentStale}
          />
        </EuiFlyoutHeader>
        <EuiFlyoutBody>
          {unavailableDocumentCallout ? (
            unavailableDocumentCallout
          ) : isPaginationLoading ? (
            <EuiFlexGroup
              alignItems="center"
              justifyContent="center"
              css={{ height: '100%' }}
              data-test-subj={FLYOUT_V2_LOADING_SPINNER_TEST_ID}
            >
              <EuiFlexItem grow={false}>
                <EuiLoadingSpinner size="xl" />
              </EuiFlexItem>
            </EuiFlexGroup>
          ) : (
            <>
              {isSecurityApp && (
                <>
                  <EuiTabs>
                    <EuiTab
                      isSelected={selectedTabId === 'overview'}
                      onClick={() => setSelectedTabId('overview')}
                      data-test-subj={OVERVIEW_TAB_TEST_ID}
                    >
                      {OVERVIEW_TAB_LABEL}
                    </EuiTab>
                    <EuiTab
                      isSelected={selectedTabId === 'table'}
                      onClick={() => setSelectedTabId('table')}
                      data-test-subj={TABLE_TAB_TEST_ID}
                    >
                      {TABLE_TAB_LABEL}
                    </EuiTab>
                    <EuiTab
                      isSelected={selectedTabId === 'json'}
                      onClick={() => setSelectedTabId('json')}
                      data-test-subj={JSON_TAB_TEST_ID}
                    >
                      {JSON_TAB_LABEL}
                    </EuiTab>
                  </EuiTabs>
                  <EuiSpacer size="m" />
                </>
              )}
              {isSecurityApp && selectedTabId === 'table' ? (
                <TableTab
                  hit={hit}
                  renderCellActions={renderCellActions}
                  renderFlyoutLink={renderFlyoutLink}
                />
              ) : isSecurityApp && selectedTabId === 'json' ? (
                <JsonTab hit={hit} isRulePreview={isRulePreview} />
              ) : (
                <OverviewTab
                  hit={hit}
                  renderCellActions={renderCellActions}
                  onAlertUpdated={onAlertUpdated}
                />
              )}
            </>
          )}
        </EuiFlyoutBody>
        {!isRulePreview && !isDocumentStale && (
          <EuiFlyoutFooter css={footerStyles}>
            <Footer hit={hit} onAlertUpdated={onAlertUpdated} onShowNotes={onShowNotesFromFooter} />
          </EuiFlyoutFooter>
        )}
      </>
    );
  }
);

DocumentFlyout.displayName = 'DocumentFlyout';
