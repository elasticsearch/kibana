/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ProductName, ResourceType } from '@kbn/product-doc-common';
import type { ProductInstallState, InstallationStatus } from '../install_status';

export const INSTALLATION_STATUS_API_PATH = '/internal/product_doc_base/status';
export const INSTALL_ALL_API_PATH = '/internal/product_doc_base/install';
export const UNINSTALL_ALL_API_PATH = '/internal/product_doc_base/uninstall';
export const UPDATE_ALL_API_PATH = '/internal/product_doc_base/update_all';
export const GET_DEFAULT_INFERENCE_ID_API_PATH = '/internal/product_doc_base/default_inference_id';

export interface InstallationStatusResponse {
  inferenceId: string;
  overall: InstallationStatus;
  perProducts: Record<ProductName, ProductInstallState>;
  /** Resource type for this installation status */
  resourceType?: ResourceType;
  openApiStatus?: OpenAPISpecInstallStatusResponse;
}

export interface PerformInstallResponse {
  installed: boolean;
  failureReason?: string;
}

export interface PerformUpdateResponse {
  installed: boolean;
  failureReason?: string;
}

export interface UninstallResponse {
  success: boolean;
}

export interface DefaultInferenceIdResponse {
  inferenceId: string;
}

export interface ProductDocInstallParams {
  inferenceId: string | undefined;
  /**
   * Resource type to install/uninstall.
   * - 'product_doc': Elastic product documentation (default)
   * - 'security_labs': Elastic Security Labs content
   */
  resourceType?: ResourceType;
}
export interface BaseInstallStatusResponse<T extends ResourceType> {
  inferenceId: string;
  resourceType: T;
  status: InstallationStatus;
  version?: string;
  latestVersion?: string;
  isUpdateAvailable?: boolean;
  failureReason?: string;
}

export type OpenAPISpecInstallStatusResponse = BaseInstallStatusResponse<'openapi_spec'>;

export type SecurityLabsInstallStatusResponse = BaseInstallStatusResponse<'security_labs'>;
