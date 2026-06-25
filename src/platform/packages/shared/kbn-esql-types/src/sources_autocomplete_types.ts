/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
export interface IndicesAutocompleteResult {
  indices: IndexAutocompleteItem[];
}

export interface IndexAutocompleteItem {
  name: string;
  mode: 'lookup' | 'time_series' | string;
  aliases: string[];
  isClosed?: boolean;
}

export interface ESQLSourceResult {
  name: string;
  hidden: boolean;
  title?: string;
  description?: string;
  links?: Array<{ label: string; url: string }>;
  dataStreams?: Array<{ name: string; title?: string }>;
  type?: string;
}

// response from resolve_index api
interface ResolveIndexResponseItem {
  name: string;
  mode?: 'lookup' | 'time_series' | string;
  indices?: string[];
  aliases?: string[];
  attributes?: string[];
  backing_indices?: string[];
}

export interface ResolveIndexResponse {
  indices?: ResolveIndexResponseItem[];
  aliases?: ResolveIndexResponseItem[];
  data_streams?: ResolveIndexResponseItem[];
}

export interface EsqlView {
  name: string;
  query: string;
  description?: string;
  links?: Array<{ label: string; url: string }>;
  type?: string;
}

export interface EsqlViewsResult {
  views: EsqlView[];
}

export interface EsqlDataset {
  name: string;
  data_source: string;
  resource: string;
  description?: string;
  settings?: Record<string, unknown>;
}

export interface EsqlDatasetsResult {
  datasets: EsqlDataset[];
}
