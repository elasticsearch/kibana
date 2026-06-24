/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import * as React from 'react';
import {
  EuiButtonIcon,
  EuiFieldText,
  EuiFlexItem,
  EuiFormRow,
  EuiIcon,
  EuiSpacer,
  EuiToolTip,
} from '@elastic/eui';
import type { ESQLSource, ESQLAstBaseItem } from '@elastic/esql/types';
import { useEsqlInspector } from '../../../../../../context';
import { useBehaviorSubject } from '../../../../../../../../hooks/use_behavior_subject';

const getFirstComment = (node: ESQLAstBaseItem): string | undefined => {
  const list = node.formatting?.top ?? node.formatting?.left ?? node.formatting?.right;
  if (list) {
    for (const decoration of list) {
      if (decoration.type === 'comment') {
        return decoration.text;
      }
    }
  }
  return undefined;
};

export interface SourceProps {
  node: ESQLSource;
  index: number;
}

export const Source: React.FC<SourceProps> = ({ node, index }) => {
  const state = useEsqlInspector();
  const query = useBehaviorSubject(state.queryLastValid$);
  const focusedNode = useBehaviorSubject(state.focusedNode$);

  if (!query) {
    return null;
  }

  const comment = getFirstComment(node);

  return (
    <>
      <EuiSpacer size={'m'} />
      <div
        onMouseEnter={() => {
          state.focusedNode$.next(node);
        }}
        style={{
          background: focusedNode === node ? 'rgb(190, 237, 224)' : 'transparent',
          padding: 8,
          margin: -8,
          borderRadius: 8,
          position: 'relative',
        }}
      >
        <EuiFormRow
          fullWidth
          helpText={getFirstComment(node)}
          label={
            comment ? (
              <EuiToolTip content={comment}>
                <span tabIndex={0}>
                  Source {index} <EuiIcon type="editorComment" color="subdued" aria-hidden={true} />
                </span>
              </EuiToolTip>
            ) : (
              <span style={{ color: focusedNode === node ? 'rgb(7, 16, 31)' : 'inherit' }}>
                Source {index}
              </span>
            )
          }
        >
          <EuiFieldText
            fullWidth
            value={node.name}
            onChange={(e) => {
              node.name = e.target.value;
              state.reprint();
            }}
          />
        </EuiFormRow>
        <div style={{ position: 'absolute', right: 0, top: 0 }}>
          <EuiFlexItem grow={false}>
            <EuiToolTip content="Remove" disableScreenReaderOutput>
              <EuiButtonIcon
                iconType="cross"
                aria-label="Remove"
                onClick={() => {
                  if (!query) return;
                  const from = state.from$.getValue();
                  if (!from) return;
                  from.args = from.args.filter((c) => c !== node);
                  state.reprint();
                }}
              />
            </EuiToolTip>
          </EuiFlexItem>
        </div>
      </div>
    </>
  );
};
