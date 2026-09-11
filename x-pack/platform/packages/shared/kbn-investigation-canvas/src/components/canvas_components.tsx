/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiTitle,
  EuiText,
  EuiStat,
  EuiBasicTable,
  EuiBadge,
  EuiCodeBlock,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
} from '@elastic/eui';

export const Section = ({ title, children }: { title: string; children?: React.ReactNode }) => (
  <div style={{ marginBottom: 16 }}>
    <EuiTitle size="s">
      <h3>{title}</h3>
    </EuiTitle>
    <EuiSpacer size="s" />
    {children}
  </div>
);

export const StatTile = ({
  value,
  label,
  color,
}: {
  value: string | number;
  label: string;
  color?: string;
}) => (
  <EuiStat
    title={String(value)}
    description={label}
    titleColor={(color as any) || 'default'}
    titleSize="l"
  />
);

export const DataTable = ({
  columns,
  rows,
}: {
  columns: Array<{ field: string; name: string }>;
  rows: object[];
}) => (
  <EuiBasicTable
    columns={columns.map((c) => ({ field: c.field, name: c.name }))}
    items={rows as any[]}
  />
);

export const KeyFindings = ({
  items,
}: {
  items: Array<{ title: string; description: string; severity?: string }>;
}) => (
  <div>
    {items.map((item, i) => (
      <div key={i} style={{ marginBottom: 12 }}>
        <EuiFlexGroup gutterSize="s" alignItems="center">
          <EuiFlexItem grow={false}>
            <strong>{item.title}</strong>
          </EuiFlexItem>
          {item.severity && (
            <EuiFlexItem grow={false}>
              <EuiBadge
                color={
                  item.severity === 'high' || item.severity === 'critical'
                    ? 'danger'
                    : item.severity === 'medium'
                    ? 'warning'
                    : 'default'
                }
              >
                {item.severity}
              </EuiBadge>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
        <EuiText size="s">
          <p>{item.description}</p>
        </EuiText>
      </div>
    ))}
  </div>
);

export const Badge = ({ label, color }: { label: string; color?: string }) => (
  <EuiBadge color={color}>{label}</EuiBadge>
);

export const CodeBlock = ({ language, children }: { language?: string; children: string }) => (
  <EuiCodeBlock language={language || 'text'} isCopyable>
    {children}
  </EuiCodeBlock>
);

export const Timeline = ({
  items,
}: {
  items: Array<{ timestamp: string; label: string; description?: string }>;
}) => (
  <div>
    {items.map((item, i) => (
      <div key={i} style={{ marginBottom: 8 }}>
        <EuiFlexGroup gutterSize="s" alignItems="flexStart">
          <EuiFlexItem grow={false}>
            <code style={{ whiteSpace: 'nowrap' }}>{item.timestamp}</code>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <strong>{item.label}</strong>
          </EuiFlexItem>
          {item.description && (
            <EuiFlexItem>
              <EuiText size="s">
                <p>{item.description}</p>
              </EuiText>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </div>
    ))}
  </div>
);
