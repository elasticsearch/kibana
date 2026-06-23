/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InternalSkillDefinition } from '../skills';
import type { FileEntryAccessor } from './file_entry_accessor';

/**
 * Store to access skills during execution.
 */
export interface SkillsStore extends FileEntryAccessor {
  has(skillId: string): boolean;
  get(skillId: string): InternalSkillDefinition;
}

/**
 * Writable version of SkillsStore, used internally by the runner/agent
 */
export interface WritableSkillsStore extends SkillsStore {
  add(result: InternalSkillDefinition): void;
  delete(skillId: string): boolean;
  asReadonly(): SkillsStore;
}
