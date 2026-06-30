/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment';
import { uniqBy } from 'lodash';

import { ENDPOINT_ARTIFACT_LISTS } from '@kbn/securitysolution-list-constants';
import type {
  DefendInsight,
  SecurityWorkflowInsight,
} from '../../../../../common/endpoint/types/workflow_insights';

import type { SupportedHostOsType } from '../../../../../common/endpoint/constants';
import type { BuildWorkflowInsightParams } from '.';

import { FILE_EVENTS_INDEX_PATTERN } from '../../../../../common/endpoint/constants';
import {
  WorkflowInsightActionType,
  WorkflowInsightCategory,
  WorkflowInsightSourceType,
  WorkflowInsightTargetType,
} from '../../../../../common/endpoint/types/workflow_insights';
import { prefixIndexPatternsWithCcs } from '../../../utils/ccs_utils';
import type { FileEventDoc } from '../helpers';
import { getValidCodeSignature, groupEndpointIdsByOS } from '../helpers';

export async function buildIncompatibleAntivirusWorkflowInsights(
  params: BuildWorkflowInsightParams
): Promise<SecurityWorkflowInsight[]> {
  const currentTime = moment();
  const { defendInsights, options, endpointMetadataService, esClient, ccsEnabled } = params;
  const { insightType, endpointIds, connectorId, model } = options;

  const osEndpointIdsMap = await groupEndpointIdsByOS(
    endpointIds,
    endpointMetadataService,
    ccsEnabled
  );

  const insightsPromises = defendInsights.map(
    async (defendInsight: DefendInsight): Promise<SecurityWorkflowInsight[]> => {
      const uniqueFilePathsInsights = uniqBy(defendInsight.events, 'value');
      const eventIds = Array.from(new Set(uniqueFilePathsInsights.map((event) => event.id)));

      const codeSignaturesHits = (
        await esClient.search<FileEventDoc>({
          index: prefixIndexPatternsWithCcs(FILE_EVENTS_INDEX_PATTERN, ccsEnabled),
          size: eventIds.length,
          query: {
            bool: {
              must: [
                {
                  terms: {
                    _id: eventIds,
                  },
                },
                {
                  bool: {
                    should: [
                      {
                        term: {
                          'process.code_signature.trusted': true,
                        },
                      },
                      {
                        term: {
                          'process.Ext.code_signature.trusted': true,
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        })
      ).hits.hits;

      const createRemediation = (
        filePath: string,
        os: string,
        signatureField?: string,
        signatureValue?: string
      ): SecurityWorkflowInsight => {
        return {
          '@timestamp': currentTime,
          // TODO add i18n support
          message: 'Incompatible antiviruses detected',
          category: WorkflowInsightCategory.enum.endpoint,
          type: insightType,
          source: {
            type: WorkflowInsightSourceType.enum['llm-connector'],
            id: connectorId ?? '',
            // TODO use actual time range when we add support
            data_range_start: currentTime,
            data_range_end: currentTime.clone().add(24, 'hours'),
          },
          target: {
            type: WorkflowInsightTargetType.enum.endpoint,
            ids: endpointIds,
          },
          action: {
            type: WorkflowInsightActionType.enum.refreshed,
            timestamp: currentTime,
          },
          value: `${filePath}${signatureValue ? ` ${signatureValue}` : ''}`,
          metadata: {
            notes: {
              llm_model: model ?? '',
            },
            display_name: defendInsight.group,
          },
          remediation: {
            exception_list_items: [
              {
                list_id: ENDPOINT_ARTIFACT_LISTS.trustedApps.id,
                name: defendInsight.group,
                description: 'Suggested by Automatic Troubleshooting',
                entries: [
                  {
                    field: 'process.executable.caseless',
                    operator: 'included' as const,
                    type: 'match' as const,
                    value: filePath,
                  },
                  ...(signatureField && signatureValue
                    ? [
                        {
                          field: signatureField,
                          operator: 'included' as const,
                          type: 'match' as const,
                          value: signatureValue,
                        },
                      ]
                    : []),
                ],
                // TODO add per policy support
                tags: ['policy:all'],
                os_types: [os as SupportedHostOsType],
              },
            ],
          },
        };
      };

      return Object.keys(osEndpointIdsMap).flatMap((os): SecurityWorkflowInsight[] => {
        return uniqueFilePathsInsights.map((insight) => {
          const { value: filePath, id } = insight;

          if (codeSignaturesHits.length) {
            const codeSignatureSearchHit = codeSignaturesHits.find((hit) => hit._id === id);

            if (codeSignatureSearchHit) {
              const signature = getValidCodeSignature(os, codeSignatureSearchHit._source);
              if (signature) {
                return createRemediation(filePath, os, signature.field, signature.value);
              }
            }
          }

          return createRemediation(filePath, os);
        });
      });
    }
  );

  const insightsArr = await Promise.all(insightsPromises);
  return insightsArr.flat();
}
