/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useMemo, useState } from 'react';

import {
  EuiButton,
  EuiButtonIcon,
  EuiCodeBlock,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiPopover,
  EuiPopoverFooter,
  EuiToolTip,
} from '@elastic/eui';

import { css } from '@emotion/react';
import type { AggregateQuery } from '@kbn/es-query';
import { getAggregateQueryMode, isOfQueryType } from '@kbn/es-query';
import { ACTION_EDIT_PANEL } from '@kbn/embeddable-plugin/public';
import { FilterItems } from '@kbn/unified-search-plugin/public';
import type { EmbeddableApiContext } from '@kbn/presentation-publishing';
import {
  apiCanLockHoverActions,
  getViewModeSubject,
  useBatchedPublishingSubjects,
} from '@kbn/presentation-publishing';
import { ON_OPEN_PANEL_MENU } from '@kbn/ui-actions-plugin/common/trigger_ids';
import { type ActionExecutionMeta, triggers } from '@kbn/ui-actions-plugin/public';
import { BehaviorSubject } from 'rxjs';
import { uiActionsService } from '../services/kibana_services';
import { dashboardFilterNotificationActionStrings } from './_dashboard_actions_strings';
import type { FiltersNotificationActionApi } from './filters_notification_action';

export function FiltersNotificationPopover({ api }: { api: FiltersNotificationActionApi }) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [disableEditbutton, setDisableEditButton] = useState(false);

  const filters = useMemo(() => api.filters$?.value, [api]);
  const displayName = dashboardFilterNotificationActionStrings.getDisplayName();
  const canEditUnifiedSearch = api.canEditUnifiedSearch?.() ?? true;

  const closePopover = useCallback(() => {
    setIsPopoverOpen(false);
    if (apiCanLockHoverActions(api)) {
      api.lockHoverActions(false);
    }
  }, [api]);

  const executeEditAction = useCallback(async () => {
    try {
      const action = await uiActionsService.getAction(ACTION_EDIT_PANEL);
      action.execute({
        embeddable: api,
        trigger: triggers[ON_OPEN_PANEL_MENU],
      } as EmbeddableApiContext & ActionExecutionMeta);
      closePopover();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Unable to execute edit action, Error: ', error.message);
    }
  }, [api, closePopover]);

  const { queryString, queryLanguage } = useMemo(() => {
    const query = api.query$?.value;
    if (!query) return {};
    if (isOfQueryType(query)) {
      if (typeof query.query === 'string') {
        return { queryString: query.query };
      } else {
        return { queryString: JSON.stringify(query.query, null, 2) };
      }
    } else {
      setDisableEditButton(true);
      const language: 'esql' | undefined = getAggregateQueryMode(query);
      return {
        queryString: query[language as keyof AggregateQuery],
        queryLanguage: language,
      };
    }
  }, [api, setDisableEditButton]);

  const [dataViews, parentViewMode] = useBatchedPublishingSubjects(
    api.parentApi?.dataViews$ ?? new BehaviorSubject(undefined),
    getViewModeSubject(api) ?? new BehaviorSubject(undefined)
  );

  const showEditButton = !disableEditbutton && parentViewMode === 'edit' && canEditUnifiedSearch;

  return (
    <EuiPopover
      button={
        <EuiToolTip content={displayName} disableScreenReaderOutput>
          <EuiButtonIcon
            color="text"
            iconType={'filter'}
            onClick={() => {
              setIsPopoverOpen(!isPopoverOpen);
              if (apiCanLockHoverActions(api)) {
                api?.lockHoverActions(!api.hasLockedHoverActions$.value);
              }
            }}
            data-test-subj={`embeddablePanelNotification-${api.uuid}`}
            aria-label={displayName}
          />
        </EuiToolTip>
      }
      isOpen={isPopoverOpen}
      closePopover={closePopover}
      anchorPosition="upCenter"
      aria-label={displayName}
    >
      <EuiForm
        component="div"
        css={css`
          min-width: 300px;
        `}
      >
        {Boolean(queryString) && (
          <EuiFormRow
            label={dashboardFilterNotificationActionStrings.getQueryTitle()}
            data-test-subj={'filtersNotificationModal__query'}
            display="rowCompressed"
          >
            <EuiCodeBlock
              language={queryLanguage}
              paddingSize="s"
              aria-labelledby={`${dashboardFilterNotificationActionStrings.getQueryTitle()}: ${queryString}`}
              tabIndex={0} // focus so that keyboard controls will not skip over the code block
            >
              {queryString}
            </EuiCodeBlock>
          </EuiFormRow>
        )}
        {filters && filters.length > 0 && (
          <EuiFormRow
            label={dashboardFilterNotificationActionStrings.getFiltersTitle()}
            data-test-subj={'filtersNotificationModal__filterItems'}
          >
            <EuiFlexGroup wrap={true} gutterSize="xs">
              <FilterItems filters={filters} indexPatterns={dataViews ?? []} readOnly={true} />
            </EuiFlexGroup>
          </EuiFormRow>
        )}
      </EuiForm>
      {showEditButton && (
        <EuiPopoverFooter>
          <EuiFlexGroup
            gutterSize="s"
            alignItems="center"
            justifyContent="flexEnd"
            responsive={false}
            wrap={true}
          >
            <EuiFlexItem grow={false}>
              <EuiButton
                data-test-subj={'filtersNotificationModal__editButton'}
                size="s"
                fill
                onClick={executeEditAction}
              >
                {dashboardFilterNotificationActionStrings.getEditButtonTitle()}
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPopoverFooter>
      )}
    </EuiPopover>
  );
}
