/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLink,
  EuiText,
  EuiTextTruncate,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import {
  DOCUMENT_TYPE_ENTITY,
  DOCUMENT_TYPE_EVENT,
  DOCUMENT_TYPE_ALERT,
} from '@kbn/cloud-security-posture-common/schema/graph/v1';
import {
  GROUPED_ITEM_TITLE_TEST_ID_LINK,
  GROUPED_ITEM_TITLE_TEST_ID_TEXT,
  GROUPED_ITEM_TITLE_TOOLTIP_TEST_ID,
} from '../../../test_ids';
import type { EntityOrEventItem, EntityItem, EventItem, AlertItem } from '../types';
import { displayEntityName, displayEventName } from '../utils';
import { EntityActionsButton } from './entity_actions_button';
import { EventActionsButton } from './event_actions_button';
import {
  DocumentDetailsPreviewPanelKey,
  ALERT_PREVIEW_BANNER,
  EVENT_PREVIEW_BANNER,
} from '../../../constants';
import { useOpenEntityPreviewPanel } from '../../../hooks/use_open_entity_preview_panel';
import { isInitialEntityForScope } from '../../../../filters/filter_store';

const entityUnavailableTooltip = i18n.translate(
  'securitySolutionPackages.csp.graph.groupedItem.entityUnavailable.tooltip',
  {
    defaultMessage: 'Entity unavailable in entity store',
  }
);

export interface HeaderRowProps {
  item: EntityOrEventItem;
  /**
   * Unique identifier for the graph instance, used to scope filter state.
   */
  scopeId: string;
}

export const HeaderRow = ({ item, scopeId }: HeaderRowProps) => {
  const { euiTheme } = useEuiTheme();
  const { openPreviewPanel } = useExpandableFlyoutApi();
  const openEntityPreviewPanel = useOpenEntityPreviewPanel();

  const title = useMemo(() => {
    switch (item.itemType) {
      case DOCUMENT_TYPE_EVENT:
      case DOCUMENT_TYPE_ALERT:
        return displayEventName(item);
      case DOCUMENT_TYPE_ENTITY:
        return displayEntityName(item);
      default:
        return '-';
    }
  }, [item]);

  const handlePreviewClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();

      if (item.itemType === DOCUMENT_TYPE_ENTITY) {
        const entityItem = item as EntityItem;
        openEntityPreviewPanel(entityItem.id, scopeId, entityItem.entity);
      } else {
        // event or alert
        const eventOrAlertItem = item as EventItem | AlertItem;
        openPreviewPanel({
          id: DocumentDetailsPreviewPanelKey,
          params: {
            id: eventOrAlertItem.docId,
            indexName: eventOrAlertItem.index,
            scopeId,
            banner:
              item.itemType === DOCUMENT_TYPE_ALERT ? ALERT_PREVIEW_BANNER : EVENT_PREVIEW_BANNER,
            isPreviewMode: true,
          },
        });
      }
    },
    [item, openPreviewPanel, openEntityPreviewPanel, scopeId]
  );

  const isClickable =
    item.itemType === DOCUMENT_TYPE_EVENT ||
    item.itemType === DOCUMENT_TYPE_ALERT ||
    (item.itemType === DOCUMENT_TYPE_ENTITY && (item as EntityItem).entity?.availableInEntityStore);

  return (
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
      {item.itemType === DOCUMENT_TYPE_ALERT && (
        <EuiFlexItem grow={false}>
          <EuiIcon type="warningFill" size="m" color="danger" aria-hidden={true} />
        </EuiFlexItem>
      )}
      {item.itemType === DOCUMENT_TYPE_ENTITY && (item as EntityItem).icon && (
        <EuiFlexItem grow={false}>
          <EuiIcon
            type={(item as EntityItem).icon as string}
            size="m"
            color="primary"
            css={css`
              /* Icon is 1px mis-aligned vs link (entity name) */
              position: relative;
              top: 1px;
            `}
            aria-hidden={true}
          />
        </EuiFlexItem>
      )}
      <EuiFlexItem
        css={css`
          min-width: 0;
          overflow: hidden;
        `}
      >
        {isClickable ? (
          <EuiLink
            onClick={handlePreviewClick}
            color="primary"
            css={css`
              font-weight: ${euiTheme.font.weight.semiBold};
            `}
            data-test-subj={GROUPED_ITEM_TITLE_TEST_ID_LINK}
          >
            <EuiTextTruncate text={title} truncation="middle" />
          </EuiLink>
        ) : (
          <EuiToolTip
            content={entityUnavailableTooltip}
            position="left"
            data-test-subj={GROUPED_ITEM_TITLE_TOOLTIP_TEST_ID}
          >
            <EuiText
              size="s"
              color="text"
              tabIndex={0}
              data-test-subj={GROUPED_ITEM_TITLE_TEST_ID_TEXT}
              css={css`
                font-weight: ${euiTheme.font.weight.medium};
              `}
            >
              <EuiTextTruncate text={title} truncation="middle" />
            </EuiText>
          </EuiToolTip>
        )}
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        {item.itemType === DOCUMENT_TYPE_ENTITY ? (
          <EntityActionsButton
            item={item as EntityItem}
            scopeId={scopeId}
            isInitialEntity={isInitialEntityForScope(scopeId, (item as EntityItem).id)}
          />
        ) : (
          <EventActionsButton item={item as EventItem | AlertItem} scopeId={scopeId} />
        )}
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
