/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export {
  UPLOAD_SAMPLES_MAX_LINES,
  normalizeLogSamplesFromFileContent,
  normalizeLogLinesForUpload,
} from './upload_samples_limits';

export type { NormalizeLogSamplesResult } from './upload_samples_limits';

export type {
  ApproveIntegrationRequest,
  CreateAutoImportIntegrationResponse,
  GetAutoImportIntegrationResponse,
  GetAllAutoImportIntegrationsResponse,
  UpdateAutoImportIntegrationRequestBody,
  UpdateAutoImportIntegrationRequestParams,
} from './model/api/integrations/integration.gen';

export {
  ApproveAutoImportIntegrationRequestBody,
  ApproveAutoImportIntegrationRequestParams,
  CreateAutoImportIntegrationRequestBody,
  DeleteAutoImportIntegrationRequestParams,
  DownloadAutoImportIntegrationRequestParams,
  DownloadAutoImportIntegrationRequestQuery,
  DownloadIntentEnum,
  GetAutoImportIntegrationRequestParams,
} from './model/api/integrations/integration.gen';

export {
  UploadSamplesToDataStreamRequestBody,
  UploadSamplesToDataStreamRequestParams,
  UploadSamplesToDataStreamResponse,
  DeleteDataStreamRequestParams,
  ReanalyzeDataStreamRequestParams,
  ReanalyzeDataStreamRequestBody,
  UpdateDataStreamPipelineRequestBody,
} from './model/api/data_streams/data_stream.gen';

export type {
  Integration,
  DataStream,
  InputType,
  TaskStatusEnum,
  TaskStatus,
  IntegrationResponse,
  DataStreamResponse,
  AllIntegrationsResponseIntegration,
  OriginalSource,
  OriginalSourceType,
  LangSmithOptions,
} from './model/common_attributes.gen';

export {
  AutomaticImportTelemetryEventType,
  type CreateIntegrationPageLoadedPayload,
  type EditIntegrationPageLoadedPayload,
  type DataStreamFlyoutOpenedPayload,
  type EditDataStreamFlyoutOpenedPayload,
  type AnalyzeLogsTriggeredPayload,
  type EditPipelineTabOpenedPayload,
  type CodeEditorCopyClickedPayload,
  type DataStreamCreationCompletePayload,
  type IntegrationInstalledPayload,
  type ManageIntegrationsTableViewedPayload,
  type UploadIntegrationClickedPayload,
  type CancelButtonClickedPayload,
  type DoneButtonClickedPayload,
  type ReviewApproveMenuClickedPayload,
  type IntegrationDownloadZipClickedPayload,
  type ApproveModalCancelClickedPayload,
  type ApproveModalApproveClickedPayload,
  type ApproveModalApproveWithAutoInstallClickedPayload,
  type DataStreamDeleteConfirmedPayload,
  type DataStreamRefreshConfirmedPayload,
  type PipelineEditedPayload,
  type AutomaticImportTelemetryEventPayload,
} from './telemetry/types';

export { MAX_STRING_LENGTH } from './constants';

export {
  DATA_STREAM_PHASES,
  DATA_STREAM_PHASE_ORDER,
  getDataStreamPhaseIndex,
  getDataStreamPhaseProgress,
} from './phases';
export type { DataStreamPhase } from './phases';
