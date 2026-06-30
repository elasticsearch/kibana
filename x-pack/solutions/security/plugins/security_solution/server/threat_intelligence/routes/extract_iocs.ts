/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import {
  EXTRACT_IOCS_API_PATH,
  THREAT_INTELLIGENCE_API_PRIVILEGES,
} from '../../../common/threat_intelligence/hub';
import { htmlToStructured } from '../adapters/text';
import { extractIocs } from '../services';
import type { RouteRegistrationDeps } from '.';

const extractIocsBodySchema = schema.object({
  // `text` is the body_text fallback (STIX/manual/text-only sources and the gold-eval path).
  text: schema.string({ minLength: 1 }),
  // `html` is the primary path: body_html from stored reports. When present the route
  // converts it to structured text via htmlToStructured() and passes THAT to extractIocs.
  // The html field is optional so existing callers (STIX ingestion, the eval script, manual
  // API calls) continue to work without change.
  html: schema.maybe(schema.string()),
  defang: schema.maybe(schema.boolean()),
});

// RSS/STIX/TAXII feeds persisted by `source_ingestion.yaml` into
// `.kibana-threat-reports.content.body_text` routinely exceed Kibana's default
// 1 MiB body cap, which surfaces as HTTP 413 on this internal POST when the
// `nl_extraction_behavioral` workflow forwards the full report body for IOC
// extraction. 10 MiB matches the ceiling other "big text body" Kibana routes
// pick (e.g. `internal/file_upload/analyze_file`).
const EXTRACT_IOCS_MAX_BODY_BYTES = 10 * 1024 * 1024;

/**
 * Public route for the `extract_iocs` domain action.
 *
 * Pure regex-based extraction — no I/O, no LLM. Workflow 2 also calls
 * the same `extractIocs` service directly during automated ingestion.
 */
export const registerExtractIocsRoute = ({ router, logger }: RouteRegistrationDeps): void => {
  router.versioned
    .post({
      path: EXTRACT_IOCS_API_PATH,
      access: 'public',
      security: {
        authz: {
          requiredPrivileges: [THREAT_INTELLIGENCE_API_PRIVILEGES.read],
        },
      },
      options: {
        body: {
          accepts: ['application/json'],
          maxBytes: EXTRACT_IOCS_MAX_BODY_BYTES,
        },
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: { request: { body: extractIocsBodySchema } },
      },
      async (_context, request, response) => {
        try {
          // html primary / body_text fallback: the route owns the conversion so
          // extractIocs stays a pure string-in function.
          const inputText =
            request.body.html != null
              ? htmlToStructured(request.body.html)
              : request.body.text;
          const result = extractIocs({
            text: inputText,
            defang: request.body.defang,
          });
          return response.ok({ body: result });
        } catch (err) {
          logger.warn(`extract_iocs failed: ${(err as Error).message}`);
          return response.customError({
            statusCode: 500,
            body: { message: `Failed to extract IOCs: ${(err as Error).message}` },
          });
        }
      }
    );
};
