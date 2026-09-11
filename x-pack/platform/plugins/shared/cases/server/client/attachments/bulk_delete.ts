/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';

import pMap from 'p-map';
import { partition } from 'lodash';
import type { Logger, SavedObject } from '@kbn/core/server';
import type { File, FileJSON } from '@kbn/files-plugin/common';
import type { FileServiceStart } from '@kbn/files-plugin/server';
import { FileNotFoundError } from '@kbn/files-plugin/server/file_service/errors';
import type { AttachmentAttributesV2 } from '../../../common/types/domain';
import {
  AttachmentRequestRtV2,
  BulkDeleteAttachmentsRequestRt,
  BulkDeleteFileAttachmentsRequestRt,
} from '../../../common/types/api';
import { decodeOrThrow, decodeWithExcessOrThrow } from '../../common/runtime_types';
import { MAX_CONCURRENT_SEARCHES } from '../../../common/constants';
import type { CasesClientArgs } from '../types';
import { createCaseError } from '../../common/error';
import { Operations } from '../../authorization';
import type { BulkDeleteArgs, BulkDeleteFileArgs } from './types';
import { CaseFileMetadataForDeletionRt } from '../../../common/files';
import type { CasesClient } from '../client';
import { createFileEntities, deleteFiles } from '../files';
import { handleAlerts, updateCaseAttachmentStats } from './delete';
import { partitionByCaseAssociation } from '../../common/partitioning';
import type { AttachmentSavedObjectType } from '../../services/user_actions/types';

/**
 * Deletes multiple attachments of a case in a single call.
 *
 * Unlike {@link bulkDeleteFileAttachments} this is type agnostic: any attachment saved object
 * attached to the case can be deleted. The request is rejected as a whole if any of the ids
 * cannot be found on the case, so callers never end up with a partially applied deletion they
 * did not ask for.
 */
export const bulkDeleteAttachments = async (
  { caseId, attachmentIds }: BulkDeleteArgs,
  clientArgs: CasesClientArgs
): Promise<void> => {
  const {
    user,
    services: { caseService, attachmentService, userActionService, alertsService },
    logger,
    authorization,
  } = clientArgs;

  try {
    const request = decodeWithExcessOrThrow(BulkDeleteAttachmentsRequestRt)({ ids: attachmentIds });
    const uniqueIds = [...new Set(request.ids)];

    // Read in unified mode: unified-only types (e.g. `security.attack`) have no legacy
    // representation, so a legacy read of one throws. Attachments still stored in the legacy
    // saved object come back in their legacy shape, which every consumer below accepts.
    const { saved_objects: soAttachments } = await attachmentService.getter.bulkGet(
      uniqueIds,
      'unified'
    );

    const missingIds = soAttachments
      .filter((attachment) => attachment.error != null || attachment.attributes == null)
      .map((attachment) => attachment.id);

    const [attachmentsInCase, attachmentsNotInCase] = partitionByCaseAssociation(
      caseId,
      soAttachments.filter(
        (attachment) => attachment.error == null && attachment.attributes != null
      ) as Array<SavedObject<AttachmentAttributesV2>>
    );

    const invalidIds = [...missingIds, ...attachmentsNotInCase.map((attachment) => attachment.id)];

    if (invalidIds.length > 0) {
      throw Boom.notFound(`These attachments ${invalidIds.join(', ')} do not exist in ${caseId}.`);
    }

    await authorization.ensureAuthorized({
      entities: attachmentsInCase.map((attachment) => ({
        id: attachment.id,
        owner: attachment.attributes.owner,
      })),
      operation: Operations.deleteComment,
    });

    await attachmentService.bulkDelete({ savedObjectIds: uniqueIds, refresh: true });

    await updateCaseAttachmentStats({ caseService, attachmentService, caseId, user });

    await userActionService.creator.bulkCreateAttachmentDeletion({
      caseId,
      attachments: attachmentsInCase.map((attachment) => ({
        id: attachment.id,
        owner: attachment.attributes.owner,
        // strip the non request fields (created_at etc.) the same way the single delete does
        attachment: decodeOrThrow(AttachmentRequestRtV2)(attachment.attributes),
        savedObjectType: attachment.type as AttachmentSavedObjectType,
      })),
      user,
    });

    await handleAlerts({
      alertsService,
      attachments: attachmentsInCase.map((attachment) => attachment.attributes),
      caseId,
    });
  } catch (error) {
    throw createCaseError({
      message: `Failed to bulk delete attachments for case: ${caseId}: ${error}`,
      error,
      logger,
    });
  }
};

export const bulkDeleteFileAttachments = async (
  { caseId, fileIds }: BulkDeleteFileArgs,
  clientArgs: CasesClientArgs,
  casesClient: CasesClient
) => {
  const {
    user,
    services: { attachmentService, userActionService },
    logger,
    authorization,
    fileService,
  } = clientArgs;

  try {
    const request = decodeWithExcessOrThrow(BulkDeleteFileAttachmentsRequestRt)({ ids: fileIds });

    await casesClient.cases.resolve({ id: caseId, includeComments: false });

    const fileEntities = await getFileEntities({
      caseId,
      fileIds: request.ids,
      fileService,
      logger,
    });

    // It's possible for this to return an empty array if there was an error creating file attachments in which case the
    // file would be present but the case attachment would not
    const fileAttachments = await attachmentService.getter.getFileAttachments({
      caseId,
      fileIds: request.ids,
    });

    await authorization.ensureAuthorized({
      entities: [
        ...fileAttachments.map((attachment) => ({
          id: attachment.id,
          owner: attachment.attributes.owner,
        })),
        ...fileEntities,
      ],
      operation: Operations.deleteComment,
    });

    await Promise.all([
      deleteFiles(
        fileEntities.map((entity) => entity.id),
        fileService
      ),
      attachmentService.bulkDelete({
        savedObjectIds: fileAttachments.map((so) => so.id),
        refresh: false,
      }),
    ]);

    await userActionService.creator.bulkCreateAttachmentDeletion({
      caseId,
      attachments: fileAttachments.map((attachment) => ({
        id: attachment.id,
        owner: attachment.attributes.owner,
        attachment: attachment.attributes,
      })),
      user,
    });
  } catch (error) {
    throw createCaseError({
      message: `Failed to delete file attachments for case: ${caseId}: ${error}`,
      error,
      logger,
    });
  }
};

const getFileEntities = async ({
  caseId,
  fileIds,
  fileService,
  logger,
}: {
  caseId: BulkDeleteFileArgs['caseId'];
  fileIds: BulkDeleteFileArgs['fileIds'];
  fileService: FileServiceStart;
  logger: Logger;
}) => {
  const files = await getFiles({ caseId, fileIds, fileService, logger });

  const fileEntities = createFileEntities(files);

  return fileEntities;
};

const getFiles = async ({
  caseId,
  fileIds,
  fileService,
  logger,
}: {
  caseId: BulkDeleteFileArgs['caseId'];
  fileIds: BulkDeleteFileArgs['fileIds'];
  fileService: FileServiceStart;
  logger: Logger;
}): Promise<FileJSON[]> => {
  // it's possible that we're trying to delete a file when an attachment wasn't created (for example if the create
  // attachment request failed)
  const fileSettleResults = await pMap(
    fileIds,
    async (fileId) => {
      try {
        return await fileService.getById({ id: fileId });
      } catch (error) {
        return error;
      }
    },
    {
      concurrency: MAX_CONCURRENT_SEARCHES,
    }
  );

  const files = retrieveFilesIgnoringNotFound(fileSettleResults, fileIds, logger);

  const [validFiles, invalidFiles] = partition(files, (file) => {
    return (
      CaseFileMetadataForDeletionRt.is(file.data.meta) &&
      file.data.meta.caseIds.length === 1 &&
      file.data.meta.caseIds.includes(caseId)
    );
  }) as [File[], File[]];

  if (invalidFiles.length > 0) {
    const invalidIds = invalidFiles.map((fileInfo) => fileInfo.id);

    // I'm intentionally being vague here because it's possible an unauthorized user could attempt to delete files
    throw Boom.badRequest(`Failed to delete files because filed ids were invalid: ${invalidIds}`);
  }

  return validFiles.map((fileInfo) => fileInfo.data);
};

export const retrieveFilesIgnoringNotFound = (
  results: Array<File<unknown> | Error>,
  fileIds: BulkDeleteFileArgs['fileIds'],
  logger: Logger
) => {
  const files: File[] = [];

  results.forEach((result, index) => {
    if (result instanceof FileNotFoundError) {
      const warningMessage = getFileNotFoundErrorMessage({
        resultsLength: results.length,
        fileIds,
        index,
        result,
      });

      logger.warn(warningMessage);
    } else if (result instanceof Error) {
      throw result;
    } else if (result) {
      files.push(result);
    }
  });

  return files;
};

const getFileNotFoundErrorMessage = ({
  resultsLength,
  fileIds,
  index,
  result,
}: {
  resultsLength: number;
  fileIds: BulkDeleteFileArgs['fileIds'];
  index: number;
  result: Error;
}) => {
  if (resultsLength === fileIds.length) {
    return `Failed to find file id: ${fileIds[index]}: ${result}`;
  }

  return `Failed to find file: ${result}`;
};
