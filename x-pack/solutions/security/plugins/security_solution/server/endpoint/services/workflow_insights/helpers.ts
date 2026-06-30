/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createHash } from 'crypto';
import { get as _get } from 'lodash';

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient } from '@kbn/core/server';

import { DataStreamSpacesAdapter } from '@kbn/data-stream-adapter';

import type { ExceptionListClient } from '@kbn/lists-plugin/server';
import type {
  SearchParams,
  SecurityWorkflowInsight,
} from '../../../../common/endpoint/types/workflow_insights';
import { WorkflowInsightType } from '../../../../common/endpoint/types/workflow_insights';
import type { SupportedHostOsType } from '../../../../common/endpoint/constants';

import type { EndpointMetadataService } from '../metadata';
import {
  COMPONENT_TEMPLATE_NAME,
  DATA_STREAM_PREFIX,
  INDEX_TEMPLATE_NAME,
  INGEST_PIPELINE_NAME,
  TOTAL_FIELDS_LIMIT,
} from './constants';
import { securityWorkflowInsightsFieldMap } from './field_map_configurations';

export interface FileEventDoc {
  process: {
    code_signature?: {
      subject_name: string;
      trusted: boolean;
    };
    Ext?: {
      code_signature?:
        | Array<{
            subject_name: string;
            trusted: boolean;
          }>
        | { subject_name: string; trusted: boolean };
    };
  };
}

export function createDatastream(kibanaVersion: string): DataStreamSpacesAdapter {
  const ds = new DataStreamSpacesAdapter(DATA_STREAM_PREFIX, {
    kibanaVersion,
    totalFieldsLimit: TOTAL_FIELDS_LIMIT,
  });
  ds.setComponentTemplate({
    name: COMPONENT_TEMPLATE_NAME,
    fieldMap: securityWorkflowInsightsFieldMap,
  });
  ds.setIndexTemplate({
    name: INDEX_TEMPLATE_NAME,
    componentTemplateRefs: [COMPONENT_TEMPLATE_NAME],
    template: {
      settings: {
        default_pipeline: INGEST_PIPELINE_NAME,
      },
    },
    hidden: true,
  });
  return ds;
}

export async function createPipeline(esClient: ElasticsearchClient): Promise<boolean> {
  const response = await esClient.ingest.putPipeline({
    id: INGEST_PIPELINE_NAME,
    processors: [
      // requires @elastic/elasticsearch 8.16.0
      // {
      //   fingerprint: {
      //     fields: ['type', 'category', 'value', 'target.type', 'target.id'],
      //     target_field: '_id',
      //     method: 'SHA-256',
      //     if: 'ctx._id == null',
      //   },
      // },
    ],
    _meta: {
      managed: true,
    },
  });
  return response.acknowledged;
}

const validKeys = new Set([
  'ids',
  'categories',
  'types',
  'sourceTypes',
  'sourceIds',
  'targetTypes',
  'targetIds',
  'actionTypes',
]);

const paramFieldMap = {
  ids: '_id',
  types: 'type',
  sourceTypes: 'source.type',
  sourceIds: 'source.id',
  targetTypes: 'target.type',
  targetIds: 'target.ids',
  actionTypes: 'action.type',
};
const nestedKeys = new Set(['source', 'target', 'action']);
export function buildEsQueryParams(searchParams: SearchParams): QueryDslQueryContainer[] {
  return Object.entries(searchParams).reduce((acc: object[], [k, v]) => {
    if (!validKeys.has(k)) {
      return acc;
    }

    const paramKey = _get(paramFieldMap, k, k);

    const topKey = paramKey.split('.')[0];
    if (nestedKeys.has(topKey)) {
      const nestedQuery = {
        nested: {
          path: topKey,
          query: {
            terms: { [paramKey]: v },
          },
        },
      };
      return [...acc, nestedQuery];
    }

    const next = { terms: { [paramKey]: v } };
    return [...acc, next];
  }, []);
}

export async function groupEndpointIdsByOS(
  endpointIds: string[],
  endpointMetadataService: EndpointMetadataService,
  ccsEnabled: boolean
): Promise<Record<SupportedHostOsType, string[]>> {
  const metadata = await endpointMetadataService.getMetadataForEndpoints(endpointIds, ccsEnabled);
  return metadata.reduce<Record<string, string[]>>((acc, m) => {
    const os = m.host.os.name.toLowerCase() as SupportedHostOsType;
    if (!acc[os]) {
      acc[os] = [];
    }

    acc[os].push(m.agent.id);

    return acc;
  }, {});
}

export function generateInsightId(insight: SecurityWorkflowInsight): string {
  const { type, category, value, target } = insight;
  const targetType = target.type;
  const targetIds = target.ids.join(',');

  const hash = createHash('sha256');
  hash.update(type);
  hash.update(category);
  hash.update(value);
  hash.update(targetType);
  hash.update(targetIds);

  return hash.digest('hex');
}

export function getUniqueInsights(insights: SecurityWorkflowInsight[]): SecurityWorkflowInsight[] {
  const uniqueInsights: { [key: string]: SecurityWorkflowInsight } = {};
  for (const insight of insights) {
    const id = generateInsightId(insight);
    if (!uniqueInsights[id]) {
      uniqueInsights[id] = insight;
    }
  }
  return Object.values(uniqueInsights);
}

export const generateTrustedAppsFilter = (
  insight: SecurityWorkflowInsight,
  packagePolicyId: string
): string | undefined => {
  const filterParts =
    insight.remediation.exception_list_items
      ?.flatMap((item) =>
        item.entries.map((entry) => {
          if (!('value' in entry)) return '';

          if (entry.field === 'process.executable.caseless') {
            return `exception-list-agnostic.attributes.entries.value:"${entry.value}"`;
          }

          if (
            entry.field === 'process.code_signature' ||
            (entry.field === 'process.Ext.code_signature' && typeof entry.value === 'string')
          ) {
            const sanitizedValue = (entry.value as string)
              .replace(/[)(<>}{":\\]/gm, '\\$&')
              .replace(/\s/gm, '*');
            return `exception-list-agnostic.attributes.entries.entries.value:(*${sanitizedValue}*)`;
          }

          return '';
        })
      )
      .filter(Boolean) || [];

  // Only create a filter if there are valid entries
  if (filterParts.length) {
    const combinedFilter = filterParts.join(' AND ');
    const policyFilter = `(exception-list-agnostic.attributes.tags:"policy:${packagePolicyId}" OR exception-list-agnostic.attributes.tags:"policy:all")`;
    return `${policyFilter} AND ${combinedFilter}`;
  }

  return undefined;
};

export const checkIfRemediationExists = async ({
  insight,
  exceptionListsClient,
  endpointMetadataClient,
  ccsEnabled = false,
}: {
  insight: SecurityWorkflowInsight;
  exceptionListsClient: ExceptionListClient;
  endpointMetadataClient: EndpointMetadataService;
  ccsEnabled?: boolean;
}): Promise<boolean> => {
  if (insight.type !== WorkflowInsightType.enum.incompatible_antivirus) {
    return false;
  }

  // One endpoint only for incompatible antivirus insights
  const hostMetadata = await endpointMetadataClient.getHostMetadata(
    insight.target.ids[0],
    ccsEnabled
  );

  const filter = generateTrustedAppsFilter(insight, hostMetadata.Endpoint.policy.applied.id);

  if (!filter) return false;

  const response = await exceptionListsClient.findExceptionListItem({
    listId: 'endpoint_trusted_apps',
    page: 1,
    perPage: 1,
    namespaceType: 'agnostic',
    filter,
    sortField: 'created_at',
    sortOrder: 'desc',
  });

  return !!response?.total && response.total > 0;
};

export function getValidCodeSignature(
  os: string,
  hit: FileEventDoc | undefined
): { field: string; value: string } | null {
  const WINDOWS_PUBLISHER = 'Microsoft Windows Hardware Compatibility Publisher';

  if (os !== 'windows') {
    const codeSignature = hit?.process?.code_signature;
    if (codeSignature?.trusted) {
      return {
        field: 'process.code_signature',
        value: codeSignature.subject_name,
      };
    }
    return null;
  }

  // Windows specific code signature
  const rawSignature = hit?.process?.Ext?.code_signature;
  if (!rawSignature) return null;

  // In serverless environment, a single item array is flattened to an object.
  const codeSignatures = Array.isArray(rawSignature) ? rawSignature : [rawSignature];

  // If there's a single trusted signature from Windows publisher, return it
  if (
    codeSignatures.length === 1 &&
    codeSignatures[0].trusted &&
    codeSignatures[0].subject_name === WINDOWS_PUBLISHER
  ) {
    return {
      field: 'process.Ext.code_signature',
      value: codeSignatures[0].subject_name,
    };
  }

  // Otherwise, return the first trusted signature that is not from the Windows publisher
  for (const codeSignature of codeSignatures) {
    if (codeSignature.trusted && codeSignature.subject_name !== WINDOWS_PUBLISHER) {
      return {
        field: 'process.Ext.code_signature',
        value: codeSignature.subject_name,
      };
    }
  }
  return null;
}
