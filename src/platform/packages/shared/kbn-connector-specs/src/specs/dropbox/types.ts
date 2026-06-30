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

export const SearchInputSchema = lazySchema(() =>
  z.object({
    query: z
      .string()
      .min(1)
      .max(2000)
      .describe(
        'Full-text search query across file names and content. Example: "Q3 budget report" or "product roadmap"'
      ),
    path: z
      .string()
      .max(1024)
      .optional()
      .describe(
        'Restrict search to files and folders inside this path. Example: "/team-projects/finance". Leave empty to search the entire account.'
      ),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20)
      .describe('Maximum number of results to return (1–100, default 20)'),
    fileExtensions: z
      .array(z.string().max(50))
      .optional()
      .describe(
        'Filter results to specific file extensions. Example: ["pdf", "docx", "xlsx"]. Leave empty to match all file types.'
      ),
    fileCategories: z
      .array(
        z.enum([
          'image',
          'document',
          'spreadsheet',
          'presentation',
          'audio',
          'video',
          'folder',
          'paper',
          'others',
        ])
      )
      .optional()
      .describe(
        'Filter results to specific file categories: "image", "document", "spreadsheet", "presentation", "audio", "video", "folder", "paper", or "others"'
      ),
  })
);
export type SearchInput = z.infer<typeof SearchInputSchema>;

export const ListFolderInputSchema = lazySchema(() =>
  z.object({
    path: z
      .string()
      .max(1024)
      .describe(
        'Path to the folder to list. Use an empty string "" for the root folder, or a path like "/team-projects/finance".'
      ),
    recursive: z
      .boolean()
      .optional()
      .default(false)
      .describe('If true, list contents of all subdirectories recursively. Default is false.'),
  })
);
export type ListFolderInput = z.infer<typeof ListFolderInputSchema>;

export const GetFileMetadataInputSchema = lazySchema(() =>
  z.object({
    path: z
      .string()
      .min(1)
      .max(1024)
      .describe(
        'Path to the file or folder to retrieve metadata for. Example: "/Documents/report.pdf". Use paths from search or listFolder results.'
      ),
  })
);
export type GetFileMetadataInput = z.infer<typeof GetFileMetadataInputSchema>;

export const GetFileContentInputSchema = lazySchema(() =>
  z.object({
    path: z
      .string()
      .min(1)
      .max(1024)
      .describe(
        'Path to the file to retrieve content for. Example: "/Documents/notes.txt". Use paths from search or listFolder results. WARNING: Returns base64-encoded binary content — only use when you have a plan to process the data (e.g. via an Elasticsearch ingest pipeline attachment processor). Large files can produce very large payloads.'
      ),
  })
);
export type GetFileContentInput = z.infer<typeof GetFileContentInputSchema>;

export const CreateSharedLinkInputSchema = lazySchema(() =>
  z.object({
    path: z
      .string()
      .min(1)
      .max(1024)
      .describe(
        'Path to the file or folder to create a shared link for. Example: "/Documents/report.pdf".'
      ),
    visibility: z
      .enum(['public', 'team_only'])
      .optional()
      .default('team_only')
      .describe(
        'Link visibility: "team_only" (Dropbox team members only, default) or "public" (anyone with the link).'
      ),
  })
);
export type CreateSharedLinkInput = z.infer<typeof CreateSharedLinkInputSchema>;

export const ListSharedLinksInputSchema = lazySchema(() =>
  z.object({
    path: z
      .string()
      .max(1024)
      .optional()
      .describe(
        'Filter to shared links for a specific file or folder path. Leave empty to list all shared links in the account.'
      ),
  })
);
export type ListSharedLinksInput = z.infer<typeof ListSharedLinksInputSchema>;

export const CallToolInputSchema = lazySchema(() =>
  z.object({
    name: z.string().min(1).max(200).describe('Name of the Dropbox MCP tool to call'),
    arguments: z
      .record(z.string().max(200), z.unknown())
      .optional()
      .describe('Arguments to pass to the tool (tool-specific)'),
  })
);
export type CallToolInput = z.infer<typeof CallToolInputSchema>;
