/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import type { ReactElement } from 'react';
import { Hunk, Decoration, getCollapsedLinesCountBetween } from 'react-diff-view';
import type { HunkData, DecorationProps } from 'react-diff-view';
import { EuiSpacer, EuiIcon, EuiLink, EuiFlexGroup, EuiText } from '@elastic/eui';
import * as i18n from './translations';

interface UnfoldButtonProps extends Omit<DecorationProps, 'children'> {
  start: number;
  end: number;
  onExpand: (start: number, end: number) => void;
}

const UnfoldButton = ({ start, end, onExpand, ...props }: UnfoldButtonProps) => {
  const expand = useCallback(() => onExpand(start, end), [onExpand, start, end]);

  const linesCount = end - start;

  return (
    <Decoration {...props}>
      <EuiFlexGroup direction="column" gutterSize="none">
        {start > 1 && <EuiSpacer size="m" />}
        <EuiFlexGroup justifyContent="center">
          <EuiLink onClick={expand}>
            <EuiFlexGroup justifyContent="center" alignItems="center" gutterSize="s">
              <EuiIcon type="sortable" aria-hidden={true} />
              <EuiText size="s">{i18n.EXPAND_UNCHANGED_LINES(linesCount)}</EuiText>
            </EuiFlexGroup>
          </EuiLink>
        </EuiFlexGroup>
        <EuiSpacer size="m" />
      </EuiFlexGroup>
    </Decoration>
  );
};

interface UnfoldCollapsedProps {
  previousHunk: HunkData;
  currentHunk?: HunkData;
  linesCount: number;
  onExpand: (start: number, end: number) => void;
}

const UnfoldCollapsed = ({
  previousHunk,
  currentHunk,
  linesCount,
  onExpand,
}: UnfoldCollapsedProps) => {
  if (!currentHunk) {
    const nextStart = previousHunk.oldStart + previousHunk.oldLines;
    const collapsedLines = linesCount - nextStart + 1;

    if (collapsedLines <= 0) {
      return null;
    }

    return <UnfoldButton start={nextStart} end={linesCount + 1} onExpand={onExpand} />;
  }

  const collapsedLines = getCollapsedLinesCountBetween(previousHunk, currentHunk);

  if (!previousHunk) {
    if (!collapsedLines) {
      return null;
    }

    return <UnfoldButton start={1} end={currentHunk.oldStart} onExpand={onExpand} />;
  }

  const collapsedStart = previousHunk.oldStart + previousHunk.oldLines;
  const collapsedEnd = currentHunk.oldStart;

  return <UnfoldButton start={collapsedStart} end={collapsedEnd} onExpand={onExpand} />;
};

interface HunksProps {
  hunks: HunkData[];
  oldSource: string;
  expandRange: (start: number, end: number) => void;
}

export const Hunks = ({ hunks, oldSource, expandRange }: HunksProps) => {
  const linesCount = oldSource.split('\n').length;

  const hunkElements = hunks.reduce((children: ReactElement[], hunk: HunkData, index: number) => {
    const previousElement = children[children.length - 1];

    // If old source doesn't exist, we don't render expandable sections
    if (!oldSource) {
      children.push(<Hunk key={`hunk-${hunk.content}`} hunk={hunk} />);
      return children;
    }

    children.push(
      <UnfoldCollapsed
        key={`decoration-${hunk.content}`}
        previousHunk={previousElement && previousElement.props.hunk}
        currentHunk={hunk}
        linesCount={linesCount}
        onExpand={expandRange}
      />
    );

    children.push(<Hunk key={`hunk-${hunk.content}`} hunk={hunk} />);

    const isLastHunk = index === hunks.length - 1;
    if (isLastHunk && oldSource) {
      children.push(
        <UnfoldCollapsed
          key="decoration-tail"
          previousHunk={hunk}
          linesCount={linesCount}
          onExpand={expandRange}
        />
      );
    }

    return children;
  }, []);

  return <>{hunkElements}</>;
};
