/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  type DataTableRecord,
  TRACE_ID_FIELD,
  getFieldValue,
  INDEX_FIELD,
  DATASTREAM_TYPE_FIELD,
} from '@kbn/discover-utils';
import { TRACES_PRODUCT_FEATURE_ID } from '../../../../../../common/constants';
import type { DocumentProfileProvider } from '../../../../profiles';
import { DataSourceCategory, DocumentType, SolutionType } from '../../../../profiles';
import type { ProfileProviderServices } from '../../../profile_provider_services';
import { createGetDocViewer } from './accessors';

const OBSERVABILITY_TRACES_SPAN_DOCUMENT_PROFILE_ID = 'observability-traces-document-profile';

export const createObservabilityTracesDocumentProfileProvider = ({
  apmContextService,
  logsContextService,
  analytics,
}: ProfileProviderServices): DocumentProfileProvider => ({
  profileId: OBSERVABILITY_TRACES_SPAN_DOCUMENT_PROFILE_ID,
  restrictedToProductFeature: TRACES_PRODUCT_FEATURE_ID,
  profile: {
    getDocViewer: createGetDocViewer(
      {
        apm: {
          errors: apmContextService.errorsService.getErrorsIndexPattern(),
          traces: apmContextService.tracesService.getAllTracesIndexPattern(),
        },
        logs: logsContextService.getAllLogsIndexPattern(),
      },
      OBSERVABILITY_TRACES_SPAN_DOCUMENT_PROFILE_ID,
      analytics.reportEvent
    ),
  },
  resolve: ({ record, rootContext }) => {
    const isSupportedSolution =
      rootContext.solutionType === SolutionType.Observability ||
      rootContext.solutionType === SolutionType.Default;

    if (
      isSupportedSolution &&
      isTraceDocument(record, apmContextService.tracesService.isTracesIndexPattern)
    ) {
      return {
        isMatch: true,
        context: {
          type: DocumentType.Trace,
        },
      };
    }

    return { isMatch: false };
  },
});

function isTraceDocument(
  record: DataTableRecord,
  isTracesIndexPattern: ProfileProviderServices['apmContextService']['tracesService']['isTracesIndexPattern']
): boolean {
  const traceId = getFieldValue(record, TRACE_ID_FIELD);
  const index = getFieldValues(record, INDEX_FIELD);
  const dataStream = getFieldValues(record, DATASTREAM_TYPE_FIELD);

  return (
    (index.some(isTracesIndexPattern) || dataStream.includes(DataSourceCategory.Traces)) &&
    !!traceId
  );
}

const getFieldValues = <TRecord extends DataTableRecord, TField extends string>(
  record: TRecord,
  field: TField & keyof TRecord['flattened']
): TRecord['flattened'][TField][] => {
  const value = record.flattened[field];
  return (Array.isArray(value) ? value : [value]) as TRecord['flattened'][TField][];
};
