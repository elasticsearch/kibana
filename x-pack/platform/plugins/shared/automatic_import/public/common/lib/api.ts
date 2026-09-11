/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpSetup } from '@kbn/core/public';
import type {
  CreateAutoImportIntegrationResponse,
  GetAutoImportIntegrationResponse,
  GetAllAutoImportIntegrationsResponse,
} from '../../../common/model/api/integrations/integration.gen';

import type { UploadSamplesToDataStreamResponse } from '../../../common/model/api/data_streams/data_stream.gen';
import type { DataStream, OriginalSource } from '../../../common/model/common_attributes.gen';
import { getLangSmithOptions } from './lang_smith';
import type { LangSmithOptions } from './lang_smith';

export const FLEET_PACKAGES_PATH = `/api/fleet/epm/packages`;
export const AUTOMATIC_IMPORT_INTEGRATIONS_PATH = `/api/automatic_import/integrations`;

const fleetDefaultHeaders = {
  'Elastic-Api-Version': '2023-10-31',
};

export interface RequestDeps {
  http: HttpSetup;
  abortSignal?: AbortSignal;
}

export interface EpmPackageInstallationInfo {
  install_source?: string;
  version?: string;
}

export interface EpmPackageItem {
  id: string;
  type: string;
  version?: string;
  installationInfo?: EpmPackageInstallationInfo;
}

export interface EpmPackageResponse {
  items: EpmPackageItem[];
  _meta?: {
    install_source: string;
    name: string;
  };
}

export const runInstallPackage = async (
  zipFile: Blob,
  { http, abortSignal }: RequestDeps
): Promise<EpmPackageResponse> =>
  http.post<EpmPackageResponse>(FLEET_PACKAGES_PATH, {
    headers: {
      ...fleetDefaultHeaders,
      Accept: 'application/zip',
      'Content-Type': 'application/zip',
    },
    body: zipFile,
    signal: abortSignal,
  });

export const getInstalledPackages = async ({
  http,
  abortSignal,
}: RequestDeps): Promise<EpmPackageResponse> =>
  http.get<EpmPackageResponse>(FLEET_PACKAGES_PATH, {
    headers: fleetDefaultHeaders,
    query: { prerelease: true },
    signal: abortSignal,
  });

export interface CreateUpdateIntegrationRequest {
  connectorId: string;
  integrationId: string;
  title: string;
  description: string;
  logo?: string;
  dataStreams?: DataStream[];
  langSmithOptions?: LangSmithOptions;
}

export const createIntegration = async ({
  http,
  abortSignal,
  ...body
}: RequestDeps & CreateUpdateIntegrationRequest): Promise<CreateAutoImportIntegrationResponse> =>
  http.put<CreateAutoImportIntegrationResponse>(AUTOMATIC_IMPORT_INTEGRATIONS_PATH, {
    version: '1',
    body: JSON.stringify({
      ...body,
      langSmithOptions: body.langSmithOptions ?? getLangSmithOptions(),
    }),
    signal: abortSignal,
  });

export const getIntegrationById = async ({
  http,
  abortSignal,
  integrationId,
}: RequestDeps & { integrationId: string }): Promise<GetAutoImportIntegrationResponse> =>
  http.get<GetAutoImportIntegrationResponse>(
    `${AUTOMATIC_IMPORT_INTEGRATIONS_PATH}/${encodeURIComponent(integrationId)}`,
    {
      version: '1',
      signal: abortSignal,
    }
  );

export const getAllIntegrations = async ({
  http,
  abortSignal,
}: RequestDeps): Promise<GetAllAutoImportIntegrationsResponse> =>
  http.get<GetAllAutoImportIntegrationsResponse>(AUTOMATIC_IMPORT_INTEGRATIONS_PATH, {
    version: '1',
    signal: abortSignal,
  });

export interface DeleteIntegrationRequest {
  integrationId: string;
}

export const deleteIntegration = async ({
  http,
  integrationId,
}: RequestDeps & DeleteIntegrationRequest): Promise<void> =>
  http.delete<void>(`${AUTOMATIC_IMPORT_INTEGRATIONS_PATH}/${encodeURIComponent(integrationId)}`, {
    version: '1',
  });

export interface UploadSamplesRequest {
  integrationId: string;
  dataStreamId: string;
  samples?: string[];
  sourceIndex?: string;
  originalSource: OriginalSource;
}

export const uploadSamplesToDataStream = async ({
  http,
  abortSignal,
  integrationId,
  dataStreamId,
  samples,
  sourceIndex,
  originalSource,
}: RequestDeps & UploadSamplesRequest): Promise<UploadSamplesToDataStreamResponse> =>
  http.post<UploadSamplesToDataStreamResponse>(
    `${AUTOMATIC_IMPORT_INTEGRATIONS_PATH}/${encodeURIComponent(
      integrationId
    )}/data_streams/${encodeURIComponent(dataStreamId)}/upload`,
    {
      version: '1',
      body: JSON.stringify({
        ...(samples ? { samples } : {}),
        ...(sourceIndex ? { sourceIndex } : {}),
        originalSource,
      }),
      signal: abortSignal,
    }
  );

export interface DeleteDataStreamRequest {
  integrationId: string;
  dataStreamId: string;
}

export const deleteDataStream = async ({
  http,
  integrationId,
  dataStreamId,
}: RequestDeps & DeleteDataStreamRequest): Promise<void> =>
  http.delete<void>(
    `${AUTOMATIC_IMPORT_INTEGRATIONS_PATH}/${encodeURIComponent(
      integrationId
    )}/data_streams/${encodeURIComponent(dataStreamId)}`,
    {
      version: '1',
    }
  );

export interface ReanalyzeDataStreamRequest {
  integrationId: string;
  dataStreamId: string;
  connectorId: string;
}

export interface ReanalyzeDataStreamResponse {
  success: boolean;
}

export const reanalyzeDataStream = async ({
  http,
  abortSignal,
  integrationId,
  dataStreamId,
  connectorId,
}: RequestDeps & ReanalyzeDataStreamRequest): Promise<ReanalyzeDataStreamResponse> =>
  http.put<ReanalyzeDataStreamResponse>(
    `${AUTOMATIC_IMPORT_INTEGRATIONS_PATH}/${encodeURIComponent(
      integrationId
    )}/data_streams/${encodeURIComponent(dataStreamId)}/reanalyze`,
    {
      version: '1',
      body: JSON.stringify({ connectorId }),
      signal: abortSignal,
    }
  );

export interface GetDataStreamResultsRequest {
  integrationId: string;
  dataStreamId: string;
}

export interface GetDataStreamResultsResponse {
  ingest_pipeline: Record<string, unknown>;
  results: Array<Record<string, unknown>>;
}

export const getDataStreamResults = async ({
  http,
  abortSignal,
  integrationId,
  dataStreamId,
}: RequestDeps & GetDataStreamResultsRequest): Promise<GetDataStreamResultsResponse> =>
  http.get<GetDataStreamResultsResponse>(
    `${AUTOMATIC_IMPORT_INTEGRATIONS_PATH}/${encodeURIComponent(
      integrationId
    )}/data_streams/${encodeURIComponent(dataStreamId)}/results`,
    {
      version: '1',
      signal: abortSignal,
    }
  );

export interface UpdateDataStreamPipelineRequest {
  integrationId: string;
  dataStreamId: string;
  ingestPipeline: string;
}

export const updateDataStreamPipeline = async ({
  http,
  abortSignal,
  integrationId,
  dataStreamId,
  ingestPipeline,
}: RequestDeps & UpdateDataStreamPipelineRequest): Promise<GetDataStreamResultsResponse> =>
  http.patch<GetDataStreamResultsResponse>(
    `${AUTOMATIC_IMPORT_INTEGRATIONS_PATH}/${encodeURIComponent(
      integrationId
    )}/data_streams/${encodeURIComponent(dataStreamId)}`,
    {
      version: '1',
      body: JSON.stringify({ ingest_pipeline: ingestPipeline }),
      signal: abortSignal,
    }
  );
