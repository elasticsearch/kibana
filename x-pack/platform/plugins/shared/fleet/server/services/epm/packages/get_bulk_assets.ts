/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  SavedObjectsClientContract,
  ISavedObjectTypeRegistry,
  SavedObjectsType,
} from '@kbn/core/server';
import { isSavedObjectErrorResult } from '@kbn/core/server';

import type { AssetSOObject, KibanaSavedObjectType, SimpleSOAssetType } from '../../../../common';
import { ElasticsearchAssetType } from '../../../../common';

import { displayedAssetTypesLookup } from '../../../../common/constants';

import type { SimpleSOAssetAttributes } from '../../../types';

type DisplayableSOAssetAttributes = SimpleSOAssetAttributes & {
  name?: string;
};

const getKibanaLinkForESAsset = (type: ElasticsearchAssetType, id: string): string => {
  switch (type) {
    case 'index':
      return `/app/management/data/index_management/indices/index_details?indexName=${id}`;
    case 'index_template':
      return `/app/management/data/index_management/templates/${id}`;
    case 'component_template':
      return `/app/management/data/index_management/component_templates/${id}`;
    case 'ingest_pipeline':
      return `/app/management/ingest/ingest_pipelines/?pipeline=${id}`;
    case 'ilm_policy':
      return `/app/management/data/index_lifecycle_management/policies/edit/${id}`;
    case 'data_stream_ilm_policy':
      return `/app/management/data/index_lifecycle_management/policies/edit/${id}`;
    case 'transform':
      return `/app/management/data/transform?_a=(transform:(queryText:${id}))`;
    case 'ml_model':
      return `/app/management/ml/trained_models?_a=(trained_models:(queryText:'model_id:(${id})'))`;
    case 'esql_view':
    // TODO Update when feature flag is turned on https://github.com/elastic/kibana/issues/244655
    default:
      return '';
  }
};

export async function getBulkAssets(
  soClient: SavedObjectsClientContract,
  soTypeRegistry: ISavedObjectTypeRegistry,
  assetIds: AssetSOObject[]
) {
  const { resolved_objects: resolvedObjects } =
    await soClient.bulkResolve<DisplayableSOAssetAttributes>(assetIds);
  const types: Record<string, SavedObjectsType | undefined> = {};

  const res: SimpleSOAssetType[] = resolvedObjects
    .map(({ saved_object: savedObject }) => savedObject)
    .filter(
      (savedObject) =>
        (!isSavedObjectErrorResult(savedObject) || savedObject.error.statusCode !== 404) &&
        displayedAssetTypesLookup.has(savedObject.type)
    )
    .map((obj) => {
      // Kibana SOs are registered with an app URL getter, so try to use that
      // for retrieving links to assets whenever possible
      if (!types[obj.type]) {
        types[obj.type] = soTypeRegistry.getType(obj.type);
      }
      let appLink: string = '';
      try {
        if (types[obj.type]?.management?.getInAppUrl) {
          appLink = types[obj.type]!.management!.getInAppUrl!(obj)?.path || '';
        }
      } catch (e) {
        // Ignore errors from `getInAppUrl()`
        // This can happen if user can't access the saved object (i.e. in a different space)
      }

      // TODO: Ask for Kibana SOs to have `getInAppUrl()` registered so that the above works safely:
      //  security-rule
      //  csp-rule-template
      //  osquery-pack-asset
      //  osquery-saved-query

      // If we still don't have an app link at this point, manually map them (only ES types)
      if (!appLink) {
        if (Object.values(ElasticsearchAssetType).includes(obj.type as ElasticsearchAssetType)) {
          appLink = getKibanaLinkForESAsset(obj.type as ElasticsearchAssetType, obj.id);
        }
      }

      const title =
        types[obj.type]?.management?.getTitle?.(obj) ??
        obj.attributes?.title ??
        obj.attributes?.name;

      return {
        id: obj.id,
        type: obj.type as unknown as ElasticsearchAssetType | KibanaSavedObjectType,
        updatedAt: obj.updated_at,
        attributes: {
          title,
          description: obj.attributes?.description,
        },
        appLink,
      };
    });
  return res;
}
