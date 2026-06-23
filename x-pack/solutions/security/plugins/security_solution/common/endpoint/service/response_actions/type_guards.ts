/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ActionDetails,
  MaybeImmutable,
  ResponseActionExecuteOutputContent,
  ResponseActionGetFileOutputContent,
  ResponseActionGetFileParameters,
  ResponseActionsExecuteParameters,
  ResponseActionUploadOutputContent,
  ResponseActionUploadParameters,
  GetProcessesActionOutputContent,
  ResponseActionRunScriptOutputContent,
  ResponseActionRunScriptParameters,
  ResponseActionMemoryDumpOutputContent,
  ResponseActionMemoryDumpParameters,
  ResponseActionCancelOutputContent,
  ResponseActionCancelParameters,
} from '../../types';
import { RESPONSE_ACTION_AGENT_TYPE, RESPONSE_ACTION_TYPE } from './constants';

type SomeObjectWithCommand = Pick<ActionDetails, 'command'>;

export const isUploadAction = (
  action: MaybeImmutable<SomeObjectWithCommand>
): action is ActionDetails<ResponseActionUploadOutputContent, ResponseActionUploadParameters> => {
  return action.command === 'upload';
};

export const isExecuteAction = (
  action: MaybeImmutable<SomeObjectWithCommand>
): action is ActionDetails<
  ResponseActionExecuteOutputContent,
  ResponseActionsExecuteParameters
> => {
  return action.command === 'execute';
};

export const isGetFileAction = (
  action: MaybeImmutable<SomeObjectWithCommand>
): action is ActionDetails<ResponseActionGetFileOutputContent, ResponseActionGetFileParameters> => {
  return action.command === 'get-file';
};

export const isProcessesAction = (
  action: MaybeImmutable<SomeObjectWithCommand>
): action is ActionDetails<GetProcessesActionOutputContent> => {
  return action.command === 'running-processes';
};

export const isRunScriptAction = (
  action: MaybeImmutable<SomeObjectWithCommand>
): action is ActionDetails<
  ResponseActionRunScriptOutputContent,
  ResponseActionRunScriptParameters
> => {
  return action.command === 'runscript';
};

export const isMemoryDumpAction = (
  action: MaybeImmutable<SomeObjectWithCommand>
): action is ActionDetails<
  ResponseActionMemoryDumpOutputContent,
  ResponseActionMemoryDumpParameters
> => {
  return action.command === 'memory-dump';
};

export const isCancelAction = (
  action: MaybeImmutable<SomeObjectWithCommand>
): action is ActionDetails<ResponseActionCancelOutputContent, ResponseActionCancelParameters> => {
  return action.command === 'cancel';
};

// type guards to ensure only the matching string values are attached to the types filter type
export const isAgentType = (type: string): type is (typeof RESPONSE_ACTION_AGENT_TYPE)[number] =>
  RESPONSE_ACTION_AGENT_TYPE.includes(type as (typeof RESPONSE_ACTION_AGENT_TYPE)[number]);

export const isActionType = (type: string): type is (typeof RESPONSE_ACTION_TYPE)[number] =>
  RESPONSE_ACTION_TYPE.includes(type as (typeof RESPONSE_ACTION_TYPE)[number]);
