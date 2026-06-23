/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * APPROVED TRIGGER DEFINITIONS
 *
 * This list must be kept up-to-date with all registered trigger definitions.
 * When a new trigger is registered, developers must:
 * 1. Add the trigger ID and schema hash to this list (alphabetically sorted)
 * 2. Get approval from the workflows-eng team
 *
 * If the event schema changes, the schema hash must be updated, and get the approval again.
 *
 * Example of an approved trigger definition entry:
 * {
 *   id: 'cases.updated',
 *   schemaHash: 'a1b2c3d4e5f6...',
 * },
 *
 * To get the schemaHash for a trigger: run the server, then GET internal/workflows_extensions/trigger_definitions
 * and copy the schemaHash from the response for the trigger id.
 */
export const APPROVED_TRIGGER_DEFINITIONS: Array<{ id: string; schemaHash: string }> = [
  {
    id: 'alerting.episodeAcked',
    schemaHash: 'd280f377a1b17bcbd655e93f00ebb80b1935ef93951115cc1559305a5da01942',
  },
  {
    id: 'alerting.episodeActivated',
    schemaHash: 'b2d6d720052206559b91d1558e8c2d66376d6eaad15db1f1748cfd59ef894f5f',
  },
  {
    id: 'alerting.episodeAssigned',
    schemaHash: 'cab4d7b9ed82d802f6dd51f4d29327f7fb84bfabcf958a046c53ceb5d7136b0b',
  },
  {
    id: 'alerting.episodeDeactivated',
    schemaHash: '69cf494f29d6410e2df10766ccaef4641e6b8718c8dc3b01e5833cb9a1de1238',
  },
  {
    id: 'alerting.episodeSnoozed',
    schemaHash: 'ca2d9156382a2d132b94e6058488d1f78df92e539445403f1b315ea16a3e6270',
  },
  {
    id: 'alerting.episodeTagged',
    schemaHash: 'c69b1bf9ecdac0753366584be4240b0ae6423ce0fd9aa537a618b4028926f792',
  },
  {
    id: 'alerting.episodeUnacked',
    schemaHash: 'd280f377a1b17bcbd655e93f00ebb80b1935ef93951115cc1559305a5da01942',
  },
  {
    id: 'alerting.episodeUnassigned',
    schemaHash: 'd280f377a1b17bcbd655e93f00ebb80b1935ef93951115cc1559305a5da01942',
  },
  {
    id: 'alerting.episodeUnsnoozed',
    schemaHash: 'd280f377a1b17bcbd655e93f00ebb80b1935ef93951115cc1559305a5da01942',
  },
  {
    id: 'cases.caseCreated',
    schemaHash: '616f3b574681800b6ee48d4809ea220bd2179ddc97a08c72f77171c0844de98b',
  },
  {
    id: 'cases.caseUpdated',
    schemaHash: '5f4cb5e0a152336c08a9db71fd74da5557a69e4473e7d98d91166500d6f8a75f',
  },
  {
    id: 'cases.caseStatusUpdated',
    schemaHash: 'fb77dec382f8f3be96e72d49cd5512f79bf37c8dba3eb11b97603a9acacaedf7',
  },
  {
    id: 'cases.attachmentsAdded',
    schemaHash: 'af8917afcff27e816e16aab810bb0295d4ea16931414fc266aa629f220e4592c',
  },
  {
    id: 'cases.commentsAdded',
    schemaHash: '7e13967e0f1185cbd309f016b25d3631b514706e5217da41f8655e93d23d90c6',
  },
  {
    id: 'workflows.failed',
    schemaHash: '2ac7a279823d7ca59c4d47de93ea7bd7103b1953ea484cef7f489d12d0c81980',
  },
];
