/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { EuiButton } from '@elastic/eui';
import { useHistory } from 'react-router-dom';
import type { UserContentCommonSchema } from '@kbn/content-management-table-list-view-common';
import { KibanaContentListPage } from '@kbn/content-list-page';
import { ContentListClientProvider } from '@kbn/content-list-provider-client';
import type { TableListViewFindItemsFn } from '@kbn/content-list-provider-client';
import type { ContentListItem } from '@kbn/content-list-provider';
import { GraphContentList } from '../components/content_list';
import { findSavedWorkspace, deleteSavedWorkspace } from '../helpers/saved_workspace_utils';
import { getEditPath, getEditUrl, getNewPath, setBreadcrumbs } from '../services/url';
import type { GraphServices } from '../application';
import type { GraphWorkspaceSavedObject } from '../types';

type GraphUserContent = UserContentCommonSchema;

const labels = {
  entity: i18n.translate('xpack.graph.listing.table.entityName', {
    defaultMessage: 'graph',
  }),
  entityPlural: i18n.translate('xpack.graph.listing.table.entityNamePlural', {
    defaultMessage: 'graphs',
  }),
};

const toGraphUserContent = (savedObject: GraphWorkspaceSavedObject): GraphUserContent => {
  return {
    id: savedObject.id!,
    updatedAt: savedObject.updatedAt!,
    references: savedObject.references ?? [],
    type: savedObject.type,
    attributes: {
      title: savedObject.title,
      description: savedObject.description,
    },
  };
};
export interface ListingRouteProps {
  deps: Omit<GraphServices, 'savedObjects'>;
}

export function ListingRoute({
  deps: { chrome, contentClient, coreStart, capabilities, addBasePath },
}: ListingRouteProps) {
  const history = useHistory();
  const canSave = capabilities.graph.save === true;
  const canDelete = capabilities.graph.delete === true;
  const isReadOnly = !canSave && !canDelete;
  const basePath = coreStart.http.basePath;

  useEffect(() => {
    setBreadcrumbs({ chrome });
  }, [chrome]);

  const onCreateGraph = useCallback(() => {
    history.push(getNewPath());
  }, [history]);

  const findItems: TableListViewFindItemsFn = useCallback(
    async (searchQuery, options) => {
      const { total, hits } = await findSavedWorkspace(
        { contentClient, basePath },
        searchQuery,
        options?.listingLimit
      );
      return { total, hits: hits.map(toGraphUserContent) };
    },
    [contentClient, basePath]
  );

  const sampleDataUrl = coreStart.application.getUrlForApp('home', {
    path: '#/tutorial_directory/sampleData',
  });

  const createGraphButton = useMemo(
    () => (
      <EuiButton
        fill
        iconType="plusInCircle"
        onClick={onCreateGraph}
        data-test-subj="graphCreateGraphButton"
      >
        <FormattedMessage
          id="xpack.graph.listing.createGraphButtonLabel"
          defaultMessage="Create graph"
        />
      </EuiButton>
    ),
    [onCreateGraph]
  );

  const getHref = useCallback(
    ({ id }: ContentListItem) => getEditUrl(addBasePath, { id }),
    [addBasePath]
  );

  const handleEdit = useCallback(
    ({ id }: ContentListItem) => history.push(getEditPath({ id })),
    [history]
  );

  const handleDelete = useCallback(
    async (items: ContentListItem[]) => {
      await deleteSavedWorkspace(
        contentClient,
        items.map(({ id }) => id)
      );
    },
    [contentClient]
  );

  const item = useMemo(
    () => ({
      getHref,
      actions: {
        ...(canSave && { edit: { onItemAction: handleEdit } }),
        ...(canDelete && { delete: { onBulkAction: handleDelete } }),
      },
    }),
    [canDelete, canSave, getHref, handleDelete, handleEdit]
  );

  return (
    <ContentListClientProvider
      {...{ labels, findItems, item }}
      id="graph-listing"
      isReadOnly={isReadOnly}
      core={coreStart}
      features={{
        sorting: { initialSort: { field: 'updatedAt', direction: 'desc' } },
        pagination: true,
        selection: canDelete,
      }}
    >
      <KibanaContentListPage>
        <KibanaContentListPage.Header
          title={i18n.translate('xpack.graph.listing.graphsTitle', {
            defaultMessage: 'Graphs',
          })}
          {...(canSave && {
            actions: createGraphButton,
          })}
        />
        <KibanaContentListPage.Section>
          <GraphContentList {...{ canSave, sampleDataUrl, onCreateGraph }} />
        </KibanaContentListPage.Section>
      </KibanaContentListPage>
    </ContentListClientProvider>
  );
}
