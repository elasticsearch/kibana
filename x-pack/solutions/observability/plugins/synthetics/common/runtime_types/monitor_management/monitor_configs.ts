/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as t from 'io-ts';
import { tEnum } from '../../utils/t_enum';

export enum MonitorTypeEnum {
  HTTP = 'http',
  TCP = 'tcp',
  ICMP = 'icmp',
  BROWSER = 'browser',
  API = 'api',
}

export const MonitorTypeCodec = tEnum<MonitorTypeEnum>('type', MonitorTypeEnum);

export enum HTTPMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  HEAD = 'HEAD',
}

export enum ResponseBodyIndexPolicy {
  ALWAYS = 'always',
  NEVER = 'never',
  ON_ERROR = 'on_error',
}

export const ResponseBodyIndexPolicyCodec = tEnum<ResponseBodyIndexPolicy>(
  'ResponseBodyIndexPolicy',
  ResponseBodyIndexPolicy
);

export enum MonacoEditorLangId {
  JSON = 'xjson',
  PLAINTEXT = 'plaintext',
  XML = 'xml',
  JAVASCRIPT = 'javascript',
}

export enum CodeEditorMode {
  FORM = 'form',
  JSON = 'json',
  PLAINTEXT = 'text',
  XML = 'xml',
}

export const CodeEditorModeCodec = tEnum<CodeEditorMode>('CodeEditorMode', CodeEditorMode);

export enum ContentType {
  JSON = 'application/json',
  TEXT = 'text/plain',
  XML = 'application/xml',
  FORM = 'application/x-www-form-urlencoded',
}

export enum ScheduleUnit {
  MINUTES = 'm',
  SECONDS = 's',
}

export const ScheduleUnitCodec = tEnum<ScheduleUnit>('ScheduleUnit', ScheduleUnit);

export enum VerificationMode {
  CERTIFICATE = 'certificate',
  FULL = 'full',
  NONE = 'none',
  STRICT = 'strict',
}

export const VerificationModeCodec = tEnum<VerificationMode>('VerificationMode', VerificationMode);

export enum TLSVersion {
  ONE_ZERO = 'TLSv1.0',
  ONE_ONE = 'TLSv1.1',
  ONE_TWO = 'TLSv1.2',
  ONE_THREE = 'TLSv1.3',
}

export const TLSVersionCodec = tEnum<TLSVersion>('TLSVersion', TLSVersion);

export enum ScreenshotOption {
  ON = 'on',
  OFF = 'off',
  ONLY_ON_FAILURE = 'only-on-failure',
}

export const ScreenshotOptionCodec = tEnum<ScreenshotOption>('ScreenshotOption', ScreenshotOption);

export enum SourceType {
  UI = 'ui',
  PROJECT = 'project',
}

export const SourceTypeCodec = tEnum<SourceType>('SourceType', SourceType);

export enum FormMonitorType {
  SINGLE = 'single',
  MULTISTEP = 'multistep',
  API = 'api',
  HTTP = 'http',
  TCP = 'tcp',
  ICMP = 'icmp',
}

export const FormMonitorTypeCodec = tEnum<FormMonitorType>('FormMonitorType', FormMonitorType);

export enum Mode {
  ANY = 'any',
  ALL = 'all',
}
export const ModeCodec = tEnum<Mode>('Mode', Mode);

export const ResponseCheckJSONCodec = t.interface({
  description: t.string,
  expression: t.string,
});
export type ResponseCheckJSON = t.TypeOf<typeof ResponseCheckJSONCodec>;

export const RequestBodyCheckCodec = t.interface({ value: t.string, type: CodeEditorModeCodec });

export type RequestBodyCheck = t.TypeOf<typeof RequestBodyCheckCodec>;
