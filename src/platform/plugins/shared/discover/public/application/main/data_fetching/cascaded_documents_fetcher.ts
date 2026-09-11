/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { constructCascadeQuery } from '@kbn/esql-utils';
import type { TimeRange } from '@kbn/es-query';
import type { CascadeQueryArgs } from '@kbn/esql-utils/src/utils/cascaded_documents_helpers';
import { apm } from '@elastic/apm-rum';
import { i18n } from '@kbn/i18n';
import { isEqual } from 'lodash';
import type { DataTableColumnsMeta, DataTableRecord } from '@kbn/discover-utils';
import { RequestAdapter } from '@kbn/inspector-plugin/public';
import type { DiscoverServices } from '../../../build_services';
import { fetchEsql } from './fetch_esql';
import type { ScopedProfilesManager } from '../../../context_awareness';
import { columnsToColumnsMeta } from '../../../utils/columns_to_columns_meta';

export interface FetchCascadedDocumentsParams extends CascadeQueryArgs {
  nodeId: string;
  timeRange: TimeRange | undefined;
  esqlApproximation: boolean;
}

export interface CascadedDocumentsStateManager {
  getIsActiveInstance(): boolean;
  getCascadedDocuments(nodeId: string): DataTableRecord[] | undefined;
  getColumnsMeta(): DataTableColumnsMeta;
  setCascadedDocuments(nodeId: string, records: DataTableRecord[]): void;
  setColumnsMeta(columnsMeta: DataTableColumnsMeta): void;
}

export class CascadedDocumentsFetcher {
  private readonly abortControllers: Map<string, AbortController> = new Map();
  private readonly requestAdapter = new RequestAdapter();

  constructor(
    private readonly services: DiscoverServices,
    private readonly scopedProfilesManager: ScopedProfilesManager,
    private readonly stateManager: CascadedDocumentsStateManager
  ) {}

  getRequestAdapter(): RequestAdapter {
    return this.requestAdapter;
  }

  async fetchCascadedDocuments({
    nodeId,
    nodeType,
    nodePath,
    nodePathMap,
    query,
    esqlVariables,
    dataView,
    timeRange,
    esqlApproximation,
  }: FetchCascadedDocumentsParams) {
    this.cancelFetch(nodeId);

    const existingRecords = this.stateManager.getCascadedDocuments(nodeId);

    if (existingRecords) {
      return existingRecords;
    }

    const abortController = new AbortController();

    this.abortControllers.set(nodeId, abortController);

    let records: DataTableRecord[] = [];

    try {
      const cascadeQuery = constructCascadeQuery({
        query,
        esqlVariables,
        dataView,
        nodeType,
        nodePath,
        nodePathMap,
      });

      if (!cascadeQuery) {
        // maybe track the inputted query, to learn about the kind of queries that bug
        apm.captureError(new Error('Failed to construct cascade query'));
        return [];
      }

      const { dataSource: esqlSource, records: fetchedRecords } = await fetchEsql({
        query: cascadeQuery,
        esqlVariables,
        dataView,
        data: this.services.data,
        expressions: this.services.expressions,
        abortSignal: abortController.signal,
        timeRange,
        scopedProfilesManager: this.scopedProfilesManager,
        inspectorAdapters: { requests: this.requestAdapter },
        esqlApproximation,
        inspectorConfig: {
          title: i18n.translate('discover.dataCascade.inspector.cascadeQueryTitle', {
            defaultMessage: 'Cascade Row Data Query',
          }),
          description: i18n.translate('discover.dataCascade.inspector.cascadeQueryDescription', {
            defaultMessage:
              'This request queries Elasticsearch to fetch the documents matching the value of the expanded cascade row.',
          }),
        },
      });

      records = fetchedRecords;
      this.stateManager.setCascadedDocuments(nodeId, records);

      const columnsMeta = esqlSource ? columnsToColumnsMeta(esqlSource.getColumns()) : {};
      const previousColumnsMeta = this.stateManager.getColumnsMeta();
      if (!isEqual(previousColumnsMeta, columnsMeta)) {
        this.stateManager.setColumnsMeta(columnsMeta);
      }
    } finally {
      this.abortControllers.delete(nodeId);
    }

    return records;
  }

  cancelFetch(nodeId: string) {
    if (!this.stateManager.getIsActiveInstance()) {
      return;
    }

    const abortController = this.abortControllers.get(nodeId);

    if (abortController) {
      abortController.abort();
      this.abortControllers.delete(nodeId);
    }
  }

  cancelAllFetches() {
    this.abortControllers.forEach((abortController) => abortController.abort());
    this.abortControllers.clear();
  }
}
