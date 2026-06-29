/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface MemoryEntry {
  id: string;
  name: string;
  title: string;
  content: string;
  categories: string[];
  references: string[];
  version: number;
  tags: string[];
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}

export interface MemoryCategoryNode {
  name: string;
  category: string;
  pages: Array<{ id: string; name: string; title: string }>;
  children: MemoryCategoryNode[];
}

export interface MemorySearchResult {
  id: string;
  name: string;
  title: string;
  snippet: string;
  score: number;
  updated_at: string;
  updated_by: string;
  tags: string[];
  categories: string[];
}

export interface MemoryVersionRecord {
  id: string;
  entry_id: string;
  version: number;
  name: string;
  title: string;
  content: string;
  tags: string[];
  categories: string[];
  change_type: 'create' | 'update' | 'delete' | 'rename';
  change_summary: string;
  created_at: string;
  created_by: string;
}
