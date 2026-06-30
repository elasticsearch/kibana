/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import { useMemoryTree } from './use_memory';
import type { MemoryCategoryNode } from './types';

export const useCategoryOptions = (): Array<EuiComboBoxOptionOption<string>> => {
  const { data: treeData } = useMemoryTree();
  return useMemo(() => {
    const paths = new Set<string>();
    const collect = (nodes: MemoryCategoryNode[]) => {
      for (const node of nodes) {
        paths.add(node.category);
        collect(node.children);
      }
    };
    collect(treeData?.tree ?? []);
    return Array.from(paths).map((p) => ({ label: p }));
  }, [treeData]);
};
