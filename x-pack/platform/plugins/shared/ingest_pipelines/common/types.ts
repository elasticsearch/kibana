/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface ESProcessorConfig {
  on_failure?: Processor[];
  ignore_failure?: boolean;
  if?: string;
  tag?: string;
  [key: string]: any;
}

export interface Processor {
  [typeName: string]: ESProcessorConfig;
}

export type FieldAccessPattern = 'classic' | 'flexible';

export interface Pipeline {
  name: string;
  description?: string;
  version?: number;
  processors: Processor[];
  _meta?: { [key: string]: any };
  on_failure?: Processor[];
  field_access_pattern?: FieldAccessPattern;
  isManaged?: boolean;
  deprecated?: boolean;
}

export enum FieldCopyAction {
  Copy = 'copy',
  Rename = 'rename',
}

export type DatabaseType = 'maxmind' | 'ipinfo' | 'web' | 'local' | 'unknown';

export interface DatabaseNameOption {
  value: string;
  text: string;
}

export interface GeoipDatabase {
  name: string;
  id: string;
  type: DatabaseType;
}
