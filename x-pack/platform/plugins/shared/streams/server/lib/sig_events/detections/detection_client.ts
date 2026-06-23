/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IDataStreamClient } from '@kbn/data-streams';
import { esql } from '@elastic/esql';
import type { ESQLAstExpression } from '@elastic/esql/types';
import type { ElasticsearchClient } from '@kbn/core/server';
import {
  type CommonSearchOptions,
  type PaginatedSearchOptions,
  type PaginatedResponse,
} from '../query_utils';
import {
  andWhere,
  runLatestSourceEsqlQuery,
  runPaginatedLatestSourceEsqlQuery,
  runFindByIdEsqlQuery,
  runFindByIdsEsqlQuery,
  runGetProcessedIds,
} from '../latest_source_query';
import {
  DETECTIONS_DATA_STREAM,
  type Detection,
  type StoredDetection,
  type detectionsMappings,
} from './data_stream';
import { FIELD_DETECTION_ID } from '../field_names';

export type DetectionDataStreamClient = IDataStreamClient<
  typeof detectionsMappings,
  StoredDetection
>;

// _source holds all stored fields; `processed` is derived at query time, not stored.
// Using Omit<Detection, 'processed'> avoids the string | string[] widening from GetFieldsOf.
type RawDetection = Omit<Detection, 'processed'>;

export interface DetectionsSearchOptions extends CommonSearchOptions {
  rule_uuid?: string[];
  rule_name?: string;
}

export interface DetectionsPaginatedSearchOptions extends PaginatedSearchOptions {
  rule_uuid?: string[];
  rule_name?: string;
}

const KIND_HANDLED = 'handled' satisfies Detection['kind'];
const KIND_QUIET = 'quiet' satisfies Detection['kind'];
const PROCESSED_IDS_CHUNK_SIZE = 250;

export class DetectionClient {
  constructor(
    private readonly clients: {
      dataStreamClient: DetectionDataStreamClient;
      esClient: ElasticsearchClient;
      space: string;
    }
  ) {}

  async bulkCreate(detections: Detection[]) {
    return this.clients.dataStreamClient.create({
      space: this.clients.space,
      documents: detections,
    });
  }

  // Exclude kind:handled from the main query — handled docs are pipeline stamps,
  // not anomaly state. processed is derived separately via getProcessedIds.
  private buildWhere(options: DetectionsSearchOptions): ESQLAstExpression {
    let where: ESQLAstExpression = esql.exp`${esql.col('kind')} != ${esql.str(KIND_HANDLED)}`;

    const ruleUuidLiterals = options.rule_uuid?.map((ruleUuid) => esql.str(ruleUuid));
    if (ruleUuidLiterals?.length) {
      where = andWhere(where, esql.exp`${esql.col('rule_uuid')} IN (${ruleUuidLiterals})`);
    }

    if (options.rule_name) {
      where = andWhere(where, esql.exp`${esql.col('rule_name')} == ${esql.str(options.rule_name)}`);
    }

    return where;
  }

  private async getProcessedIds(detectionIds: string[]): Promise<Set<string>> {
    return runGetProcessedIds({
      esClient: this.clients.esClient,
      space: this.clients.space,
      index: DETECTIONS_DATA_STREAM,
      idField: FIELD_DETECTION_ID,
      idValues: detectionIds,
      stateKinds: ['detection', KIND_QUIET],
      handledKind: KIND_HANDLED,
      chunkSize: PROCESSED_IDS_CHUNK_SIZE,
    });
  }

  async findById(detectionId: string): Promise<{ hits: Detection[] }> {
    return runFindByIdEsqlQuery<Detection>({
      esClient: this.clients.esClient,
      space: this.clients.space,
      index: DETECTIONS_DATA_STREAM,
      idField: FIELD_DETECTION_ID,
      idValue: detectionId,
    });
  }

  async findByIds(detectionIds: string[]): Promise<{ hits: Detection[] }> {
    return runFindByIdsEsqlQuery<Detection>({
      esClient: this.clients.esClient,
      space: this.clients.space,
      index: DETECTIONS_DATA_STREAM,
      idField: FIELD_DETECTION_ID,
      idValues: detectionIds,
    });
  }

  async findLatest(options: DetectionsSearchOptions = {}): Promise<{ hits: Detection[] }> {
    const result = await runLatestSourceEsqlQuery<RawDetection>({
      esClient: this.clients.esClient,
      space: this.clients.space,
      options,
      index: DETECTIONS_DATA_STREAM,
      where: this.buildWhere(options),
      groupBy: FIELD_DETECTION_ID,
    });
    const processedIds = await this.getProcessedIds(
      result.hits.map((h) => h.detection_id).filter((id): id is string => Boolean(id))
    );
    return {
      hits: result.hits.map(
        (raw) => ({ ...raw, processed: processedIds.has(raw.detection_id ?? '') } as Detection)
      ),
    };
  }

  async findLatestPaginated(
    options: DetectionsPaginatedSearchOptions = {}
  ): Promise<PaginatedResponse<Detection>> {
    const result = await runPaginatedLatestSourceEsqlQuery<RawDetection>({
      esClient: this.clients.esClient,
      space: this.clients.space,
      options,
      index: DETECTIONS_DATA_STREAM,
      where: this.buildWhere(options),
      groupBy: FIELD_DETECTION_ID,
      sort: [['@timestamp', 'DESC']],
    });

    const processedIds = await this.getProcessedIds(
      result.hits.map((h) => h.detection_id).filter((id): id is string => Boolean(id))
    );
    return {
      ...result,
      hits: result.hits.map((raw) => ({ ...raw, processed: processedIds.has(raw.detection_id) })),
    };
  }
}
