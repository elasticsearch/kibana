/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpSetup } from '@kbn/core-http-browser';
import { defaultInferenceEndpoints } from '@kbn/inference-common';
import type {
  InstallationStatusResponse,
  SecurityLabsInstallStatusResponse,
  PerformInstallResponse,
  PerformUpdateResponse,
  UninstallResponse,
  ProductDocInstallParams,
  DefaultInferenceIdResponse,
} from '../../../common/http_api/installation';
import {
  INSTALLATION_STATUS_API_PATH,
  INSTALL_ALL_API_PATH,
  UNINSTALL_ALL_API_PATH,
  UPDATE_ALL_API_PATH,
  GET_DEFAULT_INFERENCE_ID_API_PATH,
} from '../../../common/http_api/installation';

export class InstallationService {
  private readonly http: HttpSetup;

  constructor({ http }: { http: HttpSetup }) {
    this.http = http;
  }

  async getInstallationStatus(
    params: ProductDocInstallParams
  ): Promise<InstallationStatusResponse | SecurityLabsInstallStatusResponse> {
    const inferenceId = params?.inferenceId ?? defaultInferenceEndpoints.ELSER;
    const resourceType = params?.resourceType;

    const response = await this.http.get<
      InstallationStatusResponse | SecurityLabsInstallStatusResponse
    >(INSTALLATION_STATUS_API_PATH, {
      query: { inferenceId, ...(resourceType ? { resourceType } : {}) },
    });

    return response;
  }

  async install(params: ProductDocInstallParams): Promise<PerformInstallResponse> {
    const inferenceId = params?.inferenceId ?? defaultInferenceEndpoints.ELSER;
    const resourceType = params?.resourceType;

    const response = await this.http.post<PerformInstallResponse>(INSTALL_ALL_API_PATH, {
      body: JSON.stringify({ inferenceId, ...(resourceType ? { resourceType } : {}) }),
    });

    if (!response?.installed) {
      throw new Error(
        `Installation did not complete successfully.${
          response.failureReason ? `\n${response.failureReason}` : ''
        }`
      );
    }
    return response;
  }

  async uninstall(params: ProductDocInstallParams): Promise<UninstallResponse> {
    const inferenceId = params?.inferenceId ?? defaultInferenceEndpoints.ELSER;
    const resourceType = params?.resourceType;

    const response = await this.http.post<UninstallResponse>(UNINSTALL_ALL_API_PATH, {
      body: JSON.stringify({ inferenceId, ...(resourceType ? { resourceType } : {}) }),
    });

    return response;
  }

  async getDefaultInferenceId(params?: {
    resourceType?: ProductDocInstallParams['resourceType'];
  }): Promise<string> {
    const resourceType = params?.resourceType;
    const response = await this.http.get<DefaultInferenceIdResponse>(
      GET_DEFAULT_INFERENCE_ID_API_PATH,
      {
        query: { ...(resourceType ? { resourceType } : {}) },
      }
    );
    return response.inferenceId;
  }

  /**
   * Update all product documentation to the latest version.
   *
   * @param forceUpdate - If true, the docs with the same version majorMinor version will be forced to updated regardless
   * @param inferenceIds - If provided, only the product docs for the given inference IDs will be updated. If not, all previously installed inference IDs will be updated.
   * @returns
   */
  async updateAll(params?: {
    forceUpdate?: boolean;
    inferenceIds?: string[];
  }): Promise<PerformUpdateResponse> {
    const forceUpdate = params?.forceUpdate ?? false;
    const inferenceIds = params?.inferenceIds ?? [];
    const response = await this.http.post<PerformUpdateResponse>(UPDATE_ALL_API_PATH, {
      body: JSON.stringify({ forceUpdate, ...(inferenceIds.length > 0 ? { inferenceIds } : {}) }),
    });

    return response;
  }
}
