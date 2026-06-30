/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0"; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { LocatorParams, ReportingServerInfo } from '@kbn/reporting-common/types';
import { PDF_JOB_TYPE_V2 } from '@kbn/reporting-export-types-pdf-common';
import type { TaskPayloadPDFV2 } from '@kbn/reporting-export-types-pdf-common';
import { PNG_JOB_TYPE_V2 } from '@kbn/reporting-export-types-png-common';
import type { TaskPayloadPNGV2 } from '@kbn/reporting-export-types-png-common';
import { getFullRedirectAppUrl, type ReportingConfigType } from '@kbn/reporting-server';

export interface ResolvedScreenshotTarget {
  readonly redirectUrl: string;
  readonly locatorParams: LocatorParams;
}

/**
 * Payload forwarded to the remote executor (screenshot-backed exports).
 * Adds resolved redirect URLs so the executor does not need Reporting ServerInfo/config parity with Kibana.
 */
export function buildReportingRemoteExecutionPayload(
  jobtype: string,
  payload: Record<string, unknown>,
  config: ReportingConfigType,
  serverInfo: ReportingServerInfo
): unknown {
  switch (jobtype) {
    case PDF_JOB_TYPE_V2: {
      const pdfPayload = payload as unknown as TaskPayloadPDFV2;
      const redirectUrl = getFullRedirectAppUrl(
        config,
        serverInfo,
        pdfPayload.spaceId,
        pdfPayload.forceNow
      );
      const resolvedScreenshots: ResolvedScreenshotTarget[] = pdfPayload.locatorParams.map(
        (locatorParams) => ({
          redirectUrl,
          locatorParams,
        })
      );
      return { ...pdfPayload, resolvedScreenshots };
    }
    case PNG_JOB_TYPE_V2: {
      const pngPayload = payload as unknown as TaskPayloadPNGV2;
      const redirectUrl = getFullRedirectAppUrl(
        config,
        serverInfo,
        pngPayload.spaceId,
        pngPayload.forceNow
      );
      const locatorParams = pngPayload.locatorParams[0];
      if (!locatorParams) {
        throw new Error('PNG V2 reporting payload is missing locatorParams');
      }
      const resolvedScreenshots: ResolvedScreenshotTarget[] = [{ redirectUrl, locatorParams }];
      return { ...pngPayload, resolvedScreenshots };
    }
    default:
      throw new Error(
        `Remote reporting execution is only implemented for ${PDF_JOB_TYPE_V2} and ${PNG_JOB_TYPE_V2}. ` +
          `Received unsupported job type: "${jobtype}".`
      );
  }
}
