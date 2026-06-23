/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { StoryFn } from '@storybook/react';
import { EuiIcon } from '@elastic/eui';
import { ExpandablePanel } from './expandable_panel';

export default {
  component: ExpandablePanel,
  title: 'Flyout/ExpandablePanel',
};

const defaultProps = {
  header: {
    title: 'title',
    iconType: 'storage',
  },
};
const headerContent = <EuiIcon type="maximize" aria-hidden={true} />;

const children = <p>{'test content'}</p>;

export const Default: StoryFn = () => {
  return <ExpandablePanel {...defaultProps}>{children}</ExpandablePanel>;
};

export const DefaultWithoutIcon: StoryFn = () => {
  const props = { header: { title: 'title' } };
  return <ExpandablePanel {...props}>{children}</ExpandablePanel>;
};

export const DefaultWithHeaderContent: StoryFn = () => {
  const props = {
    ...defaultProps,
    header: { ...defaultProps.header, headerContent },
  };
  return <ExpandablePanel {...props}>{children}</ExpandablePanel>;
};

export const Expandable: StoryFn = () => {
  const props = {
    ...defaultProps,
    expand: { expandable: true },
  };
  return <ExpandablePanel {...props}>{children}</ExpandablePanel>;
};

export const ExpandableDefaultOpen: StoryFn = () => {
  const props = {
    ...defaultProps,
    expand: { expandable: true, expandedOnFirstRender: true },
  };
  return <ExpandablePanel {...props}>{children}</ExpandablePanel>;
};

export const EmptyDefault: StoryFn = () => {
  return <ExpandablePanel {...defaultProps} />;
};

export const EmptyDefaultExpanded: StoryFn = () => {
  const props = {
    ...defaultProps,
    expand: { expandable: true },
  };
  return <ExpandablePanel {...props} />;
};
