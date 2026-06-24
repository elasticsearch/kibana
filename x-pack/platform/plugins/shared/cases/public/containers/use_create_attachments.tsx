/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMutation } from '@kbn/react-query';
import type { attachmentApiV2 } from '../../common/types/api';
import { createAttachments } from './api';
import * as i18n from './translations';
import type { CaseAttachmentsWithoutOwner, ServerError } from '../types';
import { useCasesToast } from '../common/use_cases_toast';
import { casesMutationsKeys } from './constants';

export interface PostComment {
  caseId: string;
  caseOwner: string;
  attachments: CaseAttachmentsWithoutOwner;
}

export const useCreateAttachments = () => {
  const { showErrorToast } = useCasesToast();

  return useMutation(
    (request: PostComment) => {
      const attachments = request.attachments.map((attachment) => ({
        ...attachment,
        owner: request.caseOwner,
      }));

      // The v2 io-ts `BulkCreateAttachmentsRequestV2` types `data`/`metadata`
      // through io-ts's `JsonValue`, which doesn't structurally accept the
      // Zod-derived `Record<string, unknown>` shapes used by the new SO
      // attachment payloads (dashboard `data.config`, map `data.attributes`,
      // etc.). Both contracts describe the same runtime JSON; this cast just
      // bridges the two type systems at the wire boundary. Server-side
      // validation re-runs through the per-type Zod schemas.
      return createAttachments({
        attachments: attachments as unknown as attachmentApiV2.BulkCreateAttachmentsRequestV2,
        caseId: request.caseId,
      });
    },
    {
      mutationKey: casesMutationsKeys.bulkCreateAttachments,
      onError: (error: ServerError) => {
        showErrorToast(error, { title: i18n.ERROR_TITLE });
      },
    }
  );
};

export type UseCreateAttachments = ReturnType<typeof useCreateAttachments>;
