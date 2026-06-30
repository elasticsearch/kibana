/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export enum ConversationAccessControlMode {
  Private = 'private',
  Public = 'public',
}

export interface ConversationAccessControl {
  access_mode: ConversationAccessControlMode;
}

export const getDefaultConversationAccessControl = (): ConversationAccessControl => ({
  access_mode: ConversationAccessControlMode.Private,
});
