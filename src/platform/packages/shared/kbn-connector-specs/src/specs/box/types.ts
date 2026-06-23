/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z, lazySchema } from '@kbn/zod/v4';

// =============================================================================
// Action input schemas & inferred types
// =============================================================================

export const WhoAmIInputSchema = lazySchema(() => z.object({}));
export type WhoAmIInput = z.infer<typeof WhoAmIInputSchema>;

export const ListToolsInputSchema = lazySchema(() => z.object({}));
export type ListToolsInput = z.infer<typeof ListToolsInputSchema>;

export const SearchFilesKeywordInputSchema = lazySchema(() =>
  z.object({
    query: z
      .string()
      .min(1)
      .max(2000)
      .describe(
        'Keyword search query. Box searches file and folder names, content, descriptions, and metadata. Example: "Q3 budget report"'
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .default(20)
      .describe('Maximum number of results to return (1–200, default 20)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Pagination offset. Pass the next offset from a previous response to get subsequent pages.'
      ),
    folderId: z
      .string()
      .max(256)
      .optional()
      .describe(
        'Restrict search to files inside a specific folder (by folder ID). Leave empty to search all content.'
      ),
  })
);
export type SearchFilesKeywordInput = z.infer<typeof SearchFilesKeywordInputSchema>;

export const SearchFoldersByNameInputSchema = lazySchema(() =>
  z.object({
    query: z
      .string()
      .min(1)
      .max(2000)
      .describe('Folder name search query. Matches folder names containing this string.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .default(20)
      .describe('Maximum number of results to return (1–200, default 20)'),
  })
);
export type SearchFoldersByNameInput = z.infer<typeof SearchFoldersByNameInputSchema>;

export const ListFolderContentInputSchema = lazySchema(() =>
  z.object({
    folderId: z
      .string()
      .max(256)
      .describe(
        'The ID of the folder to list. Use "0" for the root folder, or a folder ID from search results.'
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .default(100)
      .describe('Maximum items to return per page (1–1000, default 100)'),
  })
);
export type ListFolderContentInput = z.infer<typeof ListFolderContentInputSchema>;

export const GetFileContentInputSchema = lazySchema(() =>
  z.object({
    fileId: z
      .string()
      .min(1)
      .max(256)
      .describe(
        'The ID of the file to retrieve content for. Use file IDs from searchFilesKeyword or listFolderContent results.'
      ),
  })
);
export type GetFileContentInput = z.infer<typeof GetFileContentInputSchema>;

export const GetFileDetailsInputSchema = lazySchema(() =>
  z.object({
    fileId: z
      .string()
      .min(1)
      .max(256)
      .describe(
        'The ID of the file to retrieve details for. Use file IDs from searchFilesKeyword or listFolderContent results.'
      ),
  })
);
export type GetFileDetailsInput = z.infer<typeof GetFileDetailsInputSchema>;

export const GetFolderDetailsInputSchema = lazySchema(() =>
  z.object({
    folderId: z
      .string()
      .min(1)
      .max(256)
      .describe(
        'The ID of the folder to retrieve details for. Use folder IDs from searchFoldersByName or listFolderContent results.'
      ),
  })
);
export type GetFolderDetailsInput = z.infer<typeof GetFolderDetailsInputSchema>;

export const AiQaSingleFileInputSchema = lazySchema(() =>
  z.object({
    fileId: z
      .string()
      .min(1)
      .max(256)
      .describe(
        'The ID of the Box file to query. Use file IDs from searchFilesKeyword or listFolderContent results.'
      ),
    prompt: z
      .string()
      .min(1)
      .max(10000)
      .describe(
        'The question or instruction to send to Box AI about the file. Example: "Summarize the key findings" or "What is the total budget in this document?"'
      ),
  })
);
export type AiQaSingleFileInput = z.infer<typeof AiQaSingleFileInputSchema>;

export const AiQaMultiFileInputSchema = lazySchema(() =>
  z.object({
    fileIds: z
      .array(z.string().min(1).max(256))
      .min(1)
      .describe(
        'Array of Box file IDs to query across. Use file IDs from searchFilesKeyword or listFolderContent results.'
      ),
    prompt: z
      .string()
      .min(1)
      .max(10000)
      .describe(
        'The question or instruction to send to Box AI about the selected files. Example: "Compare the budget figures across these reports."'
      ),
  })
);
export type AiQaMultiFileInput = z.infer<typeof AiQaMultiFileInputSchema>;

export const AiQaHubInputSchema = lazySchema(() =>
  z.object({
    hubId: z
      .string()
      .min(1)
      .max(256)
      .describe('The ID of the Box Hub to query. Use hub IDs from listHubs results.'),
    prompt: z
      .string()
      .min(1)
      .max(10000)
      .describe(
        'The question or instruction to send to Box AI about the hub content. Example: "What projects are currently in progress?"'
      ),
  })
);
export type AiQaHubInput = z.infer<typeof AiQaHubInputSchema>;

export const AiExtractFreeformInputSchema = lazySchema(() =>
  z.object({
    fileId: z
      .string()
      .min(1)
      .max(256)
      .describe(
        'The ID of the Box file to extract metadata from. Use file IDs from searchFilesKeyword or listFolderContent results.'
      ),
    prompt: z
      .string()
      .min(1)
      .max(10000)
      .describe(
        'Natural-language description of what metadata to extract. Example: "Extract the contract start date, end date, and total contract value."'
      ),
  })
);
export type AiExtractFreeformInput = z.infer<typeof AiExtractFreeformInputSchema>;

export const AiExtractStructuredFromMetadataTemplateInputSchema = lazySchema(() =>
  z.object({
    fileId: z
      .string()
      .min(1)
      .max(256)
      .describe(
        'The ID of the Box file to extract structured metadata from. Use file IDs from searchFilesKeyword or listFolderContent results.'
      ),
    templateKey: z
      .string()
      .min(1)
      .max(256)
      .describe(
        'The key of the Box metadata template to use for extraction. Use template keys from list_metadata_templates results.'
      ),
    scope: z
      .string()
      .max(64)
      .optional()
      .default('enterprise')
      .describe(
        'The metadata template scope. Use "enterprise" for enterprise templates (default) or "global" for global templates.'
      ),
  })
);
export type AiExtractStructuredFromMetadataTemplateInput = z.infer<
  typeof AiExtractStructuredFromMetadataTemplateInputSchema
>;

export const ListHubsInputSchema = lazySchema(() => z.object({}));
export type ListHubsInput = z.infer<typeof ListHubsInputSchema>;

export const GetHubDetailsInputSchema = lazySchema(() =>
  z.object({
    hubId: z
      .string()
      .min(1)
      .max(256)
      .describe(
        'The ID of the Box Hub to retrieve details for. Use hub IDs from listHubs results.'
      ),
  })
);
export type GetHubDetailsInput = z.infer<typeof GetHubDetailsInputSchema>;

export const GetHubItemsInputSchema = lazySchema(() =>
  z.object({
    hubId: z
      .string()
      .min(1)
      .max(256)
      .describe(
        'The ID of the Box Hub to list items for. Use hub IDs from listHubs results. Returns associated files and folders.'
      ),
  })
);
export type GetHubItemsInput = z.infer<typeof GetHubItemsInputSchema>;

export const ListRecentItemsInputSchema = lazySchema(() =>
  z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .optional()
      .default(100)
      .describe('Maximum number of recent items to return (1–1000, default 100)'),
  })
);
export type ListRecentItemsInput = z.infer<typeof ListRecentItemsInputSchema>;

export const GetCommentsInputSchema = lazySchema(() =>
  z.object({
    fileId: z
      .string()
      .min(1)
      .max(256)
      .describe(
        'The ID of the Box file to retrieve comments for. Use file IDs from searchFilesKeyword or listFolderContent results.'
      ),
  })
);
export type GetCommentsInput = z.infer<typeof GetCommentsInputSchema>;

export const SearchByMetadataInputSchema = lazySchema(() =>
  z.object({
    query: z
      .string()
      .min(1)
      .max(2000)
      .describe(
        'A metadata query expression. Example: `amount >= 100 AND currency = "USD"`. Refer to Box metadata query syntax for operators and field references.'
      ),
    templateKey: z
      .string()
      .min(1)
      .max(256)
      .describe(
        'The key of the metadata template to query against. Use `callTool` with `list_metadata_templates` to discover available template keys.'
      ),
    scope: z
      .string()
      .max(64)
      .optional()
      .default('enterprise')
      .describe(
        'The metadata template scope. Use "enterprise" for enterprise templates (default) or "global" for global templates.'
      ),
    ancestorFolderId: z
      .string()
      .max(256)
      .optional()
      .describe(
        'Restrict results to items inside this folder (by folder ID). Leave empty to search all content.'
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20)
      .describe('Maximum number of results to return (1–100, default 20)'),
  })
);
export type SearchByMetadataInput = z.infer<typeof SearchByMetadataInputSchema>;

export const CallToolInputSchema = lazySchema(() =>
  z.object({
    name: z.string().min(1).max(200).describe('Name of the Box MCP tool to call'),
    arguments: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Arguments to pass to the tool (tool-specific)'),
  })
);
export type CallToolInput = z.infer<typeof CallToolInputSchema>;
