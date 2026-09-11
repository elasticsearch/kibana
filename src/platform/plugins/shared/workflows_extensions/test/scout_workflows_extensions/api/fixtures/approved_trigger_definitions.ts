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
 * This list is the full catalog of registered trigger definitions. The Scout
 * suite under `test/scout_workflows_extensions` boots the
 * `workflows_extensions` config set so gated plugins are enabled and every
 * registered trigger is present.
 *
 * When a new trigger is registered, developers must:
 * 1. Add the trigger ID and schema hash to this list (alphabetically sorted)
 * 2. Get approval from the workflows-eng team
 * 3. If registration is gated by a plugin `enabled` config that is not already
 *    on in the `workflows_extensions` Scout config set
 *    (`classic.stateful.config.ts`), add that flag there. Do not add flags
 *    that already default to `true` on stateful (for example
 *    `xpack.alerting_v2.enabled` and `xpack.significantEvents.enabled`).
 *
 * If the event schema changes, the schema hash must be updated, and get the approval again.
 *
 * Example of an approved trigger definition entry:
 * {
 *   id: 'cases.updated',
 *   schemaHash: 'a1b2c3d4e5f6...',
 * },
 *
 * To get the schemaHash for a trigger: run this suite (or start the server with
 * `--serverConfigSet workflows_extensions`), then GET
 * internal/workflows_extensions/trigger_definitions and copy the schemaHash
 * from the response for the trigger id.
 */
export const APPROVED_TRIGGER_DEFINITIONS: Array<{ id: string; schemaHash: string }> = [
  {
    id: 'ai.conversation.metadataUpdated',
    schemaHash: '3ddfb053989618f32071989376a39b001b3ed1bead0e81bf9f48c20253a53c57',
  },
  {
    id: 'alerting.episodeAcked',
    schemaHash: '53f31d5468c0fb12a49faa3233c78a87837772cb161d1db8072803877bddf3b6',
  },
  {
    id: 'alerting.episodeActivated',
    schemaHash: 'c5a55a218565c7d084269021a9d6252d9ea972a8a9ce496082da5c6e76d09a01',
  },
  {
    id: 'alerting.episodeAssigned',
    schemaHash: 'b99211de1fdabb5e2a2942031495b8c34d317a3feccd7efaa81bf997c0412439',
  },
  {
    id: 'alerting.episodeDeactivated',
    schemaHash: '623ec35bd18482cc9a3bc7a9ecaf3b3de4f203c8cacc207e102b8a5b14fa554a',
  },
  {
    id: 'alerting.episodeSnoozed',
    schemaHash: 'f0517884b4e0560f86a62515c0d84420fed367ef2cfdda501cfedad010f22914',
  },
  {
    id: 'alerting.episodeTagged',
    schemaHash: 'd6ad1872b85995d8088dfacbad85f775236ceb61a3982b077c7a00902c84bf95',
  },
  {
    id: 'alerting.episodeUnacked',
    schemaHash: '53f31d5468c0fb12a49faa3233c78a87837772cb161d1db8072803877bddf3b6',
  },
  {
    id: 'alerting.episodeUnassigned',
    schemaHash: '53f31d5468c0fb12a49faa3233c78a87837772cb161d1db8072803877bddf3b6',
  },
  {
    id: 'alerting.episodeUnsnoozed',
    schemaHash: '53f31d5468c0fb12a49faa3233c78a87837772cb161d1db8072803877bddf3b6',
  },
  {
    id: 'alerting.ruleCreated',
    schemaHash: '2e5bdb73915698a7e5f65fd71b9feab19a60a7273c710b32c591939762bd7084',
  },
  {
    id: 'alerting.ruleDeleted',
    schemaHash: '2e5bdb73915698a7e5f65fd71b9feab19a60a7273c710b32c591939762bd7084',
  },
  {
    id: 'alerting.ruleDisabled',
    schemaHash: '2e5bdb73915698a7e5f65fd71b9feab19a60a7273c710b32c591939762bd7084',
  },
  {
    id: 'alerting.ruleEnabled',
    schemaHash: '2e5bdb73915698a7e5f65fd71b9feab19a60a7273c710b32c591939762bd7084',
  },
  {
    id: 'alerting.ruleEventsGenerated',
    schemaHash: '809265f7f0af6bdd32df0498a0f756a17220587024df2fe25eb69b0060b38fe1',
  },
  {
    id: 'alerting.ruleExecutionFailed',
    schemaHash: 'c6153bb406d59918ee8127e5573ab2cd4715c78ca9f2fa8f4dc4ba6883044224',
  },
  {
    id: 'alerting.ruleUpdated',
    schemaHash: '2e5bdb73915698a7e5f65fd71b9feab19a60a7273c710b32c591939762bd7084',
  },
  {
    id: 'cases.attachmentsAdded',
    schemaHash: 'af8917afcff27e816e16aab810bb0295d4ea16931414fc266aa629f220e4592c',
  },
  {
    id: 'cases.caseCreated',
    schemaHash: '616f3b574681800b6ee48d4809ea220bd2179ddc97a08c72f77171c0844de98b',
  },
  {
    id: 'cases.caseStatusUpdated',
    schemaHash: 'fb77dec382f8f3be96e72d49cd5512f79bf37c8dba3eb11b97603a9acacaedf7',
  },
  {
    id: 'cases.caseUpdated',
    schemaHash: '5f4cb5e0a152336c08a9db71fd74da5557a69e4473e7d98d91166500d6f8a75f',
  },
  {
    id: 'cases.commentsAdded',
    schemaHash: '7e13967e0f1185cbd309f016b25d3631b514706e5217da41f8655e93d23d90c6',
  },
  {
    id: 'cases.extendedFieldsUpdated',
    schemaHash: 'cfb4b84727e79d6826fa8a786b7591ea1a86661c7fff2bb2fa768abbc3aaf37c',
  },
  {
    id: 'entityStore.entityAssetCriticalityUpdated',
    schemaHash: 'ef5a71ccf64832ea19fda336a36fbf0b8200a1bd4f703d78417075deedb77c3f',
  },
  {
    id: 'entityStore.entityRiskScoreChanged',
    schemaHash: '9f825d6e3cd79ed834759edfec89c88eef2be3a3e33b5872f53bddc365915593',
  },
  {
    id: 'nightshift-investigations.completed',
    schemaHash: '7221629d3ea4194a6d04fd878b545871bad555684ef0efea7928c74ed34fd6a8',
  },
  {
    id: 'nightshift-investigations.failed',
    schemaHash: '364cbd9e4f78aafbf4636dabe22d6d2a1f971d9ece23abafc1fc6804fb225de2',
  },
  {
    id: 'nightshift-investigations.started',
    schemaHash: 'c181a1cc5edb929c6426ad17250d8285736620dc4770a6056737442843b7f716',
  },
  {
    id: 'security.alertAssigneesChanged',
    schemaHash: '2f73bfc4659d7a78e7f7f9020e5be9ef644df23d4dde94b701871cdc49df48f8',
  },
  {
    id: 'security.alertStatusChanged',
    schemaHash: '975d9066961cad2453415869279d140e23af66ca7e637c04d6c1b22e0eb5b75a',
  },
  {
    id: 'security.alertTagsChanged',
    schemaHash: '350c63009d6e43bb86787622207801d4c0f3f2e9e466583634c2ce4d63ddd79f',
  },
  {
    id: 'security.attackAssigneesChanged',
    schemaHash: 'ab4559cad4bb8cca4f1828f318bf37c0931d2adbf968b05fd6a0713a1b7ffff0',
  },
  {
    id: 'security.attackStatusChanged',
    schemaHash: 'f335fee29e4c6ede819550ad725a0fdc25d84e655b4ae7557856524a76dfc1d3',
  },
  {
    id: 'security.attackTagsChanged',
    schemaHash: 'd7e515158ccc9d49d7e8d07d7f0c9eb4911adc6ae7819e67f59d612742d9b7d9',
  },
  {
    id: 'security.noteCreated',
    schemaHash: 'ea5ae619dc62034662d523423d67601c66b1e67bdf89ab38425bd20990de5e30',
  },
  {
    id: 'security.noteUpdated',
    schemaHash: '83c558e058984b93c00d27b5a14082f7c0b3051ad6db06dc2e2b9c15b189a987',
  },
  {
    id: 'significant-events.eventCreated',
    schemaHash: '537230a2eb86302d4a80e93f396effd93681ba4a2e11fd70c5b7b5b56fe4c3fb',
  },
  {
    id: 'significant-events.eventStatusChanged',
    schemaHash: 'f140133a6ecef997484c3d4ef94b326207b4f1124cce889d34fef6e38fa019fe',
  },
  {
    id: 'workflows.failed',
    schemaHash: '2ac7a279823d7ca59c4d47de93ea7bd7103b1953ea484cef7f489d12d0c81980',
  },
];
