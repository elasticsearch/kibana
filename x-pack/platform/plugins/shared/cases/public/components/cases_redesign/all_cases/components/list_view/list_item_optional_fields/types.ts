/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CasesColumnSelection } from '../../../types';
import type { CaseUI } from '../../../../../../../common/ui/types';

export interface ListItemFieldContent {
  label: string;
  content: React.ReactNode;
  testSubj: string;
}

export interface ListItemOptionalFieldsProps {
  theCase: CaseUI;
  selectedFields: CasesColumnSelection[];
}
