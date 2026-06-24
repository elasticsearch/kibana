/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useEffect, useMemo } from 'react';
import { EuiButton } from '@elastic/eui';
import type { ScopedHistory } from '@kbn/core/public';
import { METRIC_TYPE } from '@kbn/analytics';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { UserContentCommonSchema } from '@kbn/content-management-table-list-view-common';
import type { ContentListItem, ContentListItemConfig } from '@kbn/content-list';
import { KibanaContentListPage } from '@kbn/content-list-page';
import {
  ContentListClientProvider,
  createTagsService,
  type ContentEditorConfig,
  type ContentListClientFeatures,
  type ContentListClientServices,
  type TableListViewFindItemsFn,
} from '@kbn/content-list-provider-client';

import type { MapItem } from '../../../common/content_management';
import { APP_ID, APP_NAME, getEditPath, MAP_PATH } from '../../../common/constants';
import {
  getCore,
  getCoreChrome,
  getExecutionContextService,
  getMapsCapabilities,
  getNavigateToApp,
  getSavedObjectsTagging,
  getServerless,
  getUsageCollection,
} from '../../kibana_services';
import { MapList } from '../../components/map_list';
import { getMapClient } from '../../content_management';

const PAGE_DATA_TEST_SUBJ = 'mapLandingPage';

interface MapUserContent extends UserContentCommonSchema {
  type: string;
  attributes: {
    title: string;
  };
}

const toContentListItem = (mapItem: MapItem): MapUserContent => {
  return {
    ...mapItem,
    updatedAt: mapItem.updatedAt!,
    attributes: {
      ...mapItem.attributes,
      title: mapItem.attributes.title ?? '',
    },
  };
};

const navigateToNewMap = () => {
  getUsageCollection()?.reportUiCounter(APP_ID, METRIC_TYPE.CLICK, 'create_maps_vis_editor');
  getNavigateToApp()(APP_ID, { path: MAP_PATH });
};

const deleteMap = async (item: ContentListItem) => {
  await getMapClient().delete(item.id);
};

const deleteMaps = async (items: ContentListItem[]) => {
  await Promise.all(items.map(deleteMap));
};

const onSave: ContentEditorConfig['onSave'] = async ({ id, title, description, tags }) => {
  const { item } = await getMapClient().get(id);
  const tagging = getSavedObjectsTagging();
  const references = tagging
    ? tagging.ui.updateTagsReferences(item.references ?? [], tags)
    : item.references ?? [];
  await getMapClient().update({
    id,
    data: { ...item.attributes, title, description },
    options: { references },
  });
};

const findItems: TableListViewFindItemsFn = async (searchTerm, { listingLimit: limit } = {}) => {
  try {
    const {
      hits,
      pagination: { total },
    } = await getMapClient().search({
      text: searchTerm ? `${searchTerm}*` : undefined,
      limit,
    });

    return {
      hits: hits.map(toContentListItem),
      total,
    };
  } catch {
    return { total: 0, hits: [] };
  }
};

const labels = {
  entity: i18n.translate('xpack.maps.mapListing.entityName', {
    defaultMessage: 'map',
  }),
  entityPlural: i18n.translate('xpack.maps.mapListing.entityNamePlural', {
    defaultMessage: 'maps',
  }),
};

const CreateMapButton = ({ isReadOnly }: { isReadOnly: boolean }) =>
  isReadOnly ? null : (
    <EuiButton
      fill
      iconType="plusInCircle"
      onClick={navigateToNewMap}
      data-test-subj="newItemButton"
    >
      <FormattedMessage
        id="xpack.maps.mapListing.createMapButtonLabel"
        defaultMessage="Create map"
      />
    </EuiButton>
  );

interface Props {
  history: ScopedHistory;
}

const MapsListViewComp = ({ history }: Props) => {
  getExecutionContextService().set({
    type: 'application',
    name: APP_ID,
    page: 'list',
  });

  const isReadOnly = !getMapsCapabilities().save;

  // `setBreadcrumbs` triggers observables that change state in adjacent
  // components (e.g. `ScreenReaderRouteAnnouncements`); run the chrome side
  // effects after render so we never trigger a state change during render.
  useEffect(() => {
    getCoreChrome().docTitle.change(APP_NAME);
    const serverless = getServerless();

    if (serverless) {
      serverless.setBreadcrumbs({ text: APP_NAME });
    } else {
      getCoreChrome().setBreadcrumbs([{ text: APP_NAME }]);
    }
  }, []);

  const services: ContentListClientServices = useMemo(() => {
    const savedObjectsTagging = getSavedObjectsTagging();
    return {
      tags: createTagsService(savedObjectsTagging?.ui),
      savedObjectsTagging,
    };
  }, []);

  const item: ContentListItemConfig = useMemo(
    () => ({
      getHref: ({ id }: ContentListItem) => history.createHref({ pathname: getEditPath(id) }),
      actions: {
        delete: { onBulkAction: deleteMaps, onItemAction: deleteMap },
      },
    }),
    [history]
  );

  const features: ContentListClientFeatures = useMemo(
    () => ({ contentEditor: { isReadonly: isReadOnly, onSave } }),
    [isReadOnly]
  );

  return (
    <ContentListClientProvider
      id="map"
      core={getCore()}
      {...{ labels, isReadOnly, findItems, services, features, item }}
    >
      <KibanaContentListPage data-test-subj={PAGE_DATA_TEST_SUBJ}>
        <KibanaContentListPage.Header
          title={APP_NAME}
          actions={<CreateMapButton isReadOnly={isReadOnly} />}
        />
        <KibanaContentListPage.Section>
          <MapList />
        </KibanaContentListPage.Section>
      </KibanaContentListPage>
    </ContentListClientProvider>
  );
};

export const MapsListView = memo(MapsListViewComp);
