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
// Slack Web API response types (minimal shapes used by this connector spec)
// =============================================================================

export interface SlackAssistantSearchContextMessage {
  author_name?: string;
  author_user_id?: string;
  team_id?: string;
  channel_id?: string;
  channel_name?: string;
  message_ts?: string;
  content?: string;
  is_author_bot?: boolean;
  permalink?: string;
  blocks?: unknown;
  context_messages?: unknown;
}

export interface SlackAssistantSearchContextResponse {
  ok: boolean;
  error?: string;
  needed?: string;
  provided?: string;
  results?: {
    messages?: SlackAssistantSearchContextMessage[];
    files?: unknown[];
    channels?: unknown[];
  };
  response_metadata?: { next_cursor?: string };
}

export interface SlackErrorFields {
  error?: string;
  needed?: string;
  provided?: string;
}

export interface SlackConversationsListChannel {
  id?: string;
  name?: string;
  is_private?: boolean;
  is_archived?: boolean;
  is_member?: boolean;
}

export interface SlackConversationsListResponse extends SlackErrorFields {
  ok: boolean;
  channels?: SlackConversationsListChannel[];
  response_metadata?: { next_cursor?: string };
}

export type SlackConversationsListParams = Record<string, string | number | boolean>;

const SLACK_CONVERSATION_TYPES = ['public_channel', 'private_channel', 'im', 'mpim'] as const;

const SLACK_MAX_CONVERSATIONS_LIST_LIMIT = 1000;
const SLACK_DEFAULT_CONVERSATIONS_LIST_LIMIT = SLACK_MAX_CONVERSATIONS_LIST_LIMIT;
const SLACK_DEFAULT_RESOLVE_CHANNEL_MAX_PAGES = 10;
const SLACK_MAX_RESOLVE_CHANNEL_MAX_PAGES = 100;

const slackConversationTypesWithPublicDefault = () =>
  z
    .array(z.enum(SLACK_CONVERSATION_TYPES))
    .optional()
    .transform(
      (val): Array<(typeof SLACK_CONVERSATION_TYPES)[number]> =>
        val && val.length > 0 ? val : ['public_channel']
    );

export const SlackResolveChannelIdInputSchema = lazySchema(() =>
  z.object({
    name: z
      .string()
      .min(1)
      .describe(
        'Channel name to resolve (e.g. "general" or "#general"). Returns the first matching conversation ID (C.../G...). To list or browse channels (e.g. what is available), use listChannels instead of probing many names here.'
      ),
    types: slackConversationTypesWithPublicDefault().describe(
      'Conversation types to search. Defaults to public_channel. Valid: public_channel, private_channel, im, mpim.'
    ),
    match: z
      .enum(['exact', 'contains'])
      .default('exact')
      .describe(
        'How to match the channel name. exact is fastest/most precise. contains is for a partial name you already know (e.g. a word from the channel name); do not use contains with very short strings to scan or discover channels — use listChannels for discovery.'
      ),
    excludeArchived: z.boolean().default(true).describe('Exclude archived channels (default true)'),
    cursor: z
      .string()
      .optional()
      .describe('Optional cursor to resume a previous scan (advanced). Usually omit.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(SLACK_MAX_CONVERSATIONS_LIST_LIMIT)
      .default(SLACK_DEFAULT_CONVERSATIONS_LIST_LIMIT)
      .describe(
        `Channels per page to request (1-${SLACK_MAX_CONVERSATIONS_LIST_LIMIT}). Defaults to ${SLACK_DEFAULT_CONVERSATIONS_LIST_LIMIT}.`
      ),
    maxPages: z
      .number()
      .int()
      .min(1)
      .max(SLACK_MAX_RESOLVE_CHANNEL_MAX_PAGES)
      .default(SLACK_DEFAULT_RESOLVE_CHANNEL_MAX_PAGES)
      .describe(
        `Maximum number of pages to scan before giving up. Defaults to ${SLACK_DEFAULT_RESOLVE_CHANNEL_MAX_PAGES}.`
      ),
  })
);
export type SlackResolveChannelIdInput = z.infer<typeof SlackResolveChannelIdInputSchema>;

export const SlackListChannelsInputSchema = lazySchema(() =>
  z.object({
    types: slackConversationTypesWithPublicDefault().describe(
      'Conversation types to list. Defaults to public_channel only. Valid: public_channel, private_channel, im, mpim.'
    ),
    excludeArchived: z.boolean().default(true).describe('Exclude archived channels (default true)'),
    cursor: z
      .string()
      .optional()
      .describe(
        'Pagination cursor from a previous listChannels response (nextCursor). Omit for the first page.'
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(SLACK_MAX_CONVERSATIONS_LIST_LIMIT)
      .default(SLACK_DEFAULT_CONVERSATIONS_LIST_LIMIT)
      .describe(
        `Channels per page to request (1-${SLACK_MAX_CONVERSATIONS_LIST_LIMIT}). Defaults to ${SLACK_DEFAULT_CONVERSATIONS_LIST_LIMIT}.`
      ),
    raw: z
      .boolean()
      .optional()
      .describe(
        'Return the full raw Slack API response instead of a compact, LLM-friendly result. Defaults to false.'
      ),
  })
);

export type SlackListChannelsInput = z.infer<typeof SlackListChannelsInputSchema>;

const SLACK_MAX_SEARCH_RESULTS_PER_PAGE = 20;
export const SLACK_SEARCH_DEFAULT_COUNT = SLACK_MAX_SEARCH_RESULTS_PER_PAGE;

export const SlackSearchMessagesInputSchema = lazySchema(() =>
  z.object({
    query: z
      .string()
      .min(1)
      .describe(
        'Plain text search query to find messages. Do NOT embed Slack search operators like from: or in: here — use the dedicated fromUser, inChannel, after, and before parameters instead. Keep queries focused on a few keywords rather than long phrases for better results.'
      ),
    inChannel: z
      .string()
      .optional()
      .describe(
        'Optional Slack search constraint. Adds `in:CHANNEL_NAME` to the query (e.g. in:general).'
      ),
    fromUser: z
      .string()
      .optional()
      .describe(
        "Optional Slack search constraint. Adds `from:USER_ID` (e.g. from:U012ABCDEF) or `from:username` to the query. Accepts a Slack username or user ID, NOT a full name. If you only know a person's full name, search for it as keywords in the query parameter first, then use the sender.username field from results for subsequent filtered searches."
      ),
    after: z
      .string()
      .optional()
      .describe(
        'Optional Slack search constraint. Adds `after:YYYY-MM-DD` to the query (e.g. after:2026-02-10).'
      ),
    before: z
      .string()
      .optional()
      .describe(
        'Optional Slack search constraint. Adds `before:YYYY-MM-DD` to the query (e.g. before:2026-02-10).'
      ),
    sort: z
      .enum(['score', 'timestamp'])
      .optional()
      .describe('Sort order: score (relevance) or timestamp'),
    sortDir: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
    count: z
      .number()
      .int()
      .min(1)
      .max(SLACK_MAX_SEARCH_RESULTS_PER_PAGE)
      .optional()
      .describe(
        `Number of results to return (1-${SLACK_MAX_SEARCH_RESULTS_PER_PAGE}). Slack returns up to ${SLACK_MAX_SEARCH_RESULTS_PER_PAGE} results per page.`
      ),
    cursor: z
      .string()
      .optional()
      .describe(
        'Pagination cursor to fetch the next page of results (use response_metadata.next_cursor from a previous call).'
      ),
    includeContextMessages: z
      .boolean()
      .optional()
      .describe(
        'Include contextual messages (messages before/after the matched message, or thread context). Defaults to true.'
      ),
    includeBots: z
      .boolean()
      .optional()
      .describe('Include bot-authored messages. Defaults to false.'),
    includeMessageBlocks: z
      .boolean()
      .optional()
      .describe(
        'Include Block Kit blocks in message results (useful for extracting mentions/links). Defaults to true.'
      ),
    raw: z
      .boolean()
      .optional()
      .describe(
        'Return the full raw Slack API response instead of a compact, LLM-friendly result.'
      ),
  })
);
export type SlackSearchMessagesInput = z.infer<typeof SlackSearchMessagesInputSchema>;

export const SlackCreateConversationInputSchema = lazySchema(() =>
  z.object({
    name: z
      .string()
      .min(1)
      .describe(
        'Name of the channel to create. Channel names can only contain lowercase letters, numbers, hyphens, and underscores, and must be 80 characters or fewer.'
      ),
    isPrivate: z
      .boolean()
      .optional()
      .describe('Whether to create a private channel. Defaults to false (public).'),
  })
);
export type SlackCreateConversationInput = z.infer<typeof SlackCreateConversationInputSchema>;

export const SlackInviteToConversationInputSchema = lazySchema(() =>
  z.object({
    channel: z
      .string()
      .min(1)
      .describe('The ID of the channel to invite users to (e.g. C... or G...).'),
    users: z
      .string()
      .min(1)
      .describe(
        'Comma-separated list of user IDs to invite to the channel (e.g. U01PWE77HD2,U02ABC1234).'
      ),
  })
);
export type SlackInviteToConversationInput = z.infer<typeof SlackInviteToConversationInputSchema>;

// Conservative upper bounds on user-supplied strings to keep schema validation
// cheap and prevent unbounded input. Slack IDs/timestamps are short; cursors
// are opaque tokens kept generous; email follows RFC 5321.
const SLACK_MAX_ID_LENGTH = 64;
const SLACK_MAX_TIMESTAMP_LENGTH = 32;
const SLACK_MAX_CURSOR_LENGTH = 1024;
const SLACK_MAX_EMAIL_LENGTH = 320;

const SLACK_MAX_HISTORY_LIMIT = 1000;
const SLACK_DEFAULT_HISTORY_LIMIT = 100;

export const SlackGetConversationHistoryInputSchema = lazySchema(() =>
  z.object({
    channel: z
      .string()
      .min(1)
      .max(SLACK_MAX_ID_LENGTH)
      .describe(
        'Conversation ID to fetch history for (e.g. C... for channels, G... for private channels, D... for DMs).'
      ),
    oldest: z
      .string()
      .max(SLACK_MAX_TIMESTAMP_LENGTH)
      .optional()
      .describe(
        'Only messages after this Unix timestamp (inclusive). String form, e.g. "1234567890.123456".'
      ),
    latest: z
      .string()
      .max(SLACK_MAX_TIMESTAMP_LENGTH)
      .optional()
      .describe('Only messages before this Unix timestamp. String form, e.g. "1234567890.123456".'),
    inclusive: z
      .boolean()
      .optional()
      .describe('Include messages with the oldest or latest timestamps in results.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(SLACK_MAX_HISTORY_LIMIT)
      .default(SLACK_DEFAULT_HISTORY_LIMIT)
      .describe(
        `Number of messages to return per page (1-${SLACK_MAX_HISTORY_LIMIT}). Defaults to ${SLACK_DEFAULT_HISTORY_LIMIT}.`
      ),
    cursor: z
      .string()
      .max(SLACK_MAX_CURSOR_LENGTH)
      .optional()
      .describe(
        'Pagination cursor from a previous getConversationHistory response (nextCursor). Omit for the first page.'
      ),
    raw: z
      .boolean()
      .optional()
      .describe(
        'Return the full raw Slack API response instead of a compact result. Defaults to false.'
      ),
  })
);
export type SlackGetConversationHistoryInput = z.infer<
  typeof SlackGetConversationHistoryInputSchema
>;

export interface SlackConversationsHistoryAttachment {
  fallback?: string;
  text?: string;
  title?: string;
  pretext?: string;
}

export interface SlackConversationsHistoryFile {
  id?: string;
  name?: string;
  mimetype?: string;
  url_private?: string;
  permalink?: string;
}

export interface SlackConversationsHistoryMessage {
  type?: string;
  subtype?: string;
  user?: string;
  bot_id?: string;
  username?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  reply_count?: number;
  blocks?: unknown[];
  attachments?: SlackConversationsHistoryAttachment[];
  files?: SlackConversationsHistoryFile[];
}

export interface SlackConversationsHistoryResponse extends SlackErrorFields {
  ok: boolean;
  messages?: SlackConversationsHistoryMessage[];
  has_more?: boolean;
  response_metadata?: { next_cursor?: string };
}

export const SlackGetConversationInfoInputSchema = lazySchema(() =>
  z.object({
    channel: z
      .string()
      .min(1)
      .max(SLACK_MAX_ID_LENGTH)
      .describe(
        'Conversation ID to look up (e.g. C... for channels, G... for private channels, D... for DMs).'
      ),
    includeNumMembers: z
      .boolean()
      .optional()
      .describe('Set to true to include the member count in the channel object.'),
    includeLocale: z.boolean().optional().describe('Set to true to include the channel locale.'),
    raw: z
      .boolean()
      .optional()
      .describe(
        'Return the full raw Slack API response instead of just the channel object. Defaults to false.'
      ),
  })
);
export type SlackGetConversationInfoInput = z.infer<typeof SlackGetConversationInfoInputSchema>;

export const SlackLookupUserByEmailInputSchema = lazySchema(() =>
  z.object({
    email: z
      .string()
      .min(1)
      .max(SLACK_MAX_EMAIL_LENGTH)
      .describe(
        'Email address of the user to look up. Returns the matching Slack user or an error if no user has that email.'
      ),
    raw: z
      .boolean()
      .optional()
      .describe(
        'Return the full raw Slack API response instead of just the user object. Defaults to false.'
      ),
  })
);
export type SlackLookupUserByEmailInput = z.infer<typeof SlackLookupUserByEmailInputSchema>;

const SLACK_MAX_USERS_LIST_LIMIT = 1000;
const SLACK_DEFAULT_USERS_LIST_LIMIT = 200;

export const SlackListUsersInputSchema = lazySchema(() =>
  z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(SLACK_MAX_USERS_LIST_LIMIT)
      .default(SLACK_DEFAULT_USERS_LIST_LIMIT)
      .describe(
        `Number of users to return per page (1-${SLACK_MAX_USERS_LIST_LIMIT}). Defaults to ${SLACK_DEFAULT_USERS_LIST_LIMIT}.`
      ),
    cursor: z
      .string()
      .max(SLACK_MAX_CURSOR_LENGTH)
      .optional()
      .describe(
        'Pagination cursor from a previous listUsers response (nextCursor). Omit for the first page.'
      ),
    includeLocale: z.boolean().optional().describe('Set to true to include the user locale.'),
    raw: z
      .boolean()
      .optional()
      .describe(
        'Return the full raw Slack API response instead of a compact result. Defaults to false.'
      ),
  })
);
export type SlackListUsersInput = z.infer<typeof SlackListUsersInputSchema>;

// For "what conversations is this user in?", DMs and private channels are usually
// the more interesting answer. Unlike listChannels (a discovery action), this
// defaults to all four conversation types.
const slackConversationTypesAllDefault = () =>
  z
    .array(z.enum(SLACK_CONVERSATION_TYPES))
    .optional()
    .transform(
      (val): Array<(typeof SLACK_CONVERSATION_TYPES)[number]> =>
        val && val.length > 0 ? val : ['public_channel', 'private_channel', 'im', 'mpim']
    );

export const SlackListUserConversationsInputSchema = lazySchema(() =>
  z.object({
    user: z
      .string()
      .max(SLACK_MAX_ID_LENGTH)
      .optional()
      .describe(
        'User ID (e.g. U...) whose conversations to list. Omit to list conversations for the authenticated user.'
      ),
    types: slackConversationTypesAllDefault().describe(
      'Conversation types to list. Defaults to all four (public_channel, private_channel, im, mpim) since most "what is this user in" questions expect DMs and private channels too.'
    ),
    excludeArchived: z.boolean().default(true).describe('Exclude archived channels (default true)'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(SLACK_MAX_CONVERSATIONS_LIST_LIMIT)
      .default(SLACK_DEFAULT_CONVERSATIONS_LIST_LIMIT)
      .describe(
        `Channels per page (1-${SLACK_MAX_CONVERSATIONS_LIST_LIMIT}). Defaults to ${SLACK_DEFAULT_CONVERSATIONS_LIST_LIMIT}.`
      ),
    cursor: z
      .string()
      .max(SLACK_MAX_CURSOR_LENGTH)
      .optional()
      .describe(
        'Pagination cursor from a previous listUserConversations response (nextCursor). Omit for the first page.'
      ),
    raw: z
      .boolean()
      .optional()
      .describe(
        'Return the full raw Slack API response instead of a compact result. Defaults to false.'
      ),
  })
);
export type SlackListUserConversationsInput = z.infer<typeof SlackListUserConversationsInputSchema>;

export const SlackWhoAmIInputSchema = lazySchema(() =>
  z.object({
    raw: z
      .boolean()
      .optional()
      .describe(
        'Return the full raw Slack API response instead of a compact result. Defaults to false.'
      ),
  })
);
export type SlackWhoAmIInput = z.infer<typeof SlackWhoAmIInputSchema>;

export interface SlackAuthTestResponse extends SlackErrorFields {
  ok: boolean;
  url?: string;
  team?: string;
  user?: string;
  team_id?: string;
  user_id?: string;
  enterprise_id?: string;
  bot_id?: string;
  is_enterprise_install?: boolean;
}

const SLACK_MAX_FILE_ID_LENGTH = 64;

export const SlackGetFileInfoInputSchema = lazySchema(() =>
  z.object({
    file: z
      .string()
      .min(1)
      .max(SLACK_MAX_FILE_ID_LENGTH)
      .describe('Slack file ID to look up (e.g. F0123ABCDE).'),
    raw: z
      .boolean()
      .optional()
      .describe(
        'Return the full raw Slack API response instead of just the file object. Defaults to false.'
      ),
  })
);
export type SlackGetFileInfoInput = z.infer<typeof SlackGetFileInfoInputSchema>;

const SLACK_MAX_FILES_LIST_LIMIT = 200;
const SLACK_DEFAULT_FILES_LIST_LIMIT = 100;
const SLACK_MAX_FILES_LIST_PAGE = 10000;

// Slack `files.list` is one of the legacy classic-paginated endpoints — it does
// NOT support cursor-based pagination, so this action accepts a `page` number
// and reads `paging.page` / `paging.pages` from the response.
export const SlackListFilesInputSchema = lazySchema(() =>
  z.object({
    channel: z
      .string()
      .max(SLACK_MAX_ID_LENGTH)
      .optional()
      .describe('Restrict results to a single channel/DM ID.'),
    user: z
      .string()
      .max(SLACK_MAX_ID_LENGTH)
      .optional()
      .describe('Restrict results to files uploaded by a single user ID.'),
    tsFrom: z
      .string()
      .max(SLACK_MAX_TIMESTAMP_LENGTH)
      .optional()
      .describe('Only include files created after this Unix timestamp (string form, seconds).'),
    tsTo: z
      .string()
      .max(SLACK_MAX_TIMESTAMP_LENGTH)
      .optional()
      .describe('Only include files created before this Unix timestamp (string form, seconds).'),
    types: z
      .string()
      .max(128)
      .optional()
      .describe(
        'Comma-separated Slack file type filter (e.g. "images,pdfs"). See Slack files.list for valid values.'
      ),
    count: z
      .number()
      .int()
      .min(1)
      .max(SLACK_MAX_FILES_LIST_LIMIT)
      .default(SLACK_DEFAULT_FILES_LIST_LIMIT)
      .describe(
        `Files per page (1-${SLACK_MAX_FILES_LIST_LIMIT}). Defaults to ${SLACK_DEFAULT_FILES_LIST_LIMIT}.`
      ),
    page: z
      .number()
      .int()
      .min(1)
      .max(SLACK_MAX_FILES_LIST_PAGE)
      .default(1)
      .describe('1-indexed page number to fetch. Use nextPage from a previous response.'),
    raw: z
      .boolean()
      .optional()
      .describe(
        'Return the full raw Slack API response instead of a compact result. Defaults to false.'
      ),
  })
);
export type SlackListFilesInput = z.infer<typeof SlackListFilesInputSchema>;

export interface SlackFile {
  id?: string;
  name?: string;
  title?: string;
  mimetype?: string;
  filetype?: string;
  pretty_type?: string;
  user?: string;
  size?: number;
  created?: number;
  url_private?: string;
  url_private_download?: string;
  permalink?: string;
  permalink_public?: string;
  channels?: string[];
  groups?: string[];
  ims?: string[];
}

export interface SlackFilesListResponse extends SlackErrorFields {
  ok: boolean;
  files?: SlackFile[];
  paging?: { count?: number; total?: number; page?: number; pages?: number };
}

export interface SlackFilesInfoResponse extends SlackErrorFields {
  ok: boolean;
  file?: SlackFile;
  response_metadata?: { next_cursor?: string };
}

export const SlackSendMessageInputSchema = lazySchema(() =>
  z.object({
    channel: z
      .string()
      .min(1)
      .describe(
        'Conversation ID to send the message to (e.g. C... for channels, G... for private channels, D... for DMs). Use listChannels to browse available channels, or resolveChannelId when you know the channel name and need its ID.'
      ),
    text: z.string().min(1).describe('The message text to send'),
    threadTs: z
      .string()
      .optional()
      .describe('Timestamp of another message to reply to (creates a threaded reply)'),
    unfurlLinks: z
      .boolean()
      .optional()
      .describe('Whether to enable unfurling of primarily text-based content'),
    unfurlMedia: z.boolean().optional().describe('Whether to enable unfurling of media content'),
  })
);
export type SlackSendMessageInput = z.infer<typeof SlackSendMessageInputSchema>;
