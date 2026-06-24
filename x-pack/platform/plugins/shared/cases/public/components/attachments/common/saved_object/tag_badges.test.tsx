/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen } from '@testing-library/react';
import type { SavedObjectsTaggingApi } from '@kbn/saved-objects-tagging-oss-plugin/public';
import { renderWithTestingProviders } from '../../../../common/mock';
import { TagBadges } from './tag_badges';

const buildTaggingApi = (tagsById: Record<string, { id: string; name: string } | undefined>) => {
  const tags = Object.values(tagsById).filter((tag): tag is { id: string; name: string } =>
    Boolean(tag)
  );
  return {
    ui: {
      getTagIdsFromReferences: (refs: Array<{ id: string; type: string }>) =>
        refs.filter((r) => r.type === 'tag').map((r) => r.id),
      getTag: (id: string) => tagsById[id],
    },
    cache: {
      getState: () => tags,
    },
  } as unknown as SavedObjectsTaggingApi;
};

const tagRef = (id: string) => ({ id, type: 'tag', name: `tag-${id}` });

describe('TagBadges', () => {
  it('returns null when taggingApi is undefined', () => {
    const { container } = renderWithTestingProviders(
      <TagBadges id="o" references={[tagRef('1')]} taggingApi={undefined} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('returns null when there are no references', () => {
    const { container } = renderWithTestingProviders(
      <TagBadges
        id="o"
        references={undefined}
        taggingApi={buildTaggingApi({ '1': { id: '1', name: 'one' } })}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('returns null when none of the references resolve to tags', () => {
    const { container } = renderWithTestingProviders(
      <TagBadges id="o" references={[tagRef('missing')]} taggingApi={buildTaggingApi({})} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders all tags inline when count is at or below the limit', () => {
    renderWithTestingProviders(
      <TagBadges
        id="o"
        references={[tagRef('1'), tagRef('2'), tagRef('3')]}
        taggingApi={buildTaggingApi({
          '1': { id: '1', name: 'one' },
          '2': { id: '2', name: 'two' },
          '3': { id: '3', name: 'three' },
        })}
      />
    );
    expect(screen.getByTestId('cases-attach-so-card-tag-o-1')).toHaveTextContent('one');
    expect(screen.getByTestId('cases-attach-so-card-tag-o-2')).toHaveTextContent('two');
    expect(screen.getByTestId('cases-attach-so-card-tag-o-3')).toHaveTextContent('three');
    expect(screen.queryByTestId('cases-attach-so-card-tags-more-o')).not.toBeInTheDocument();
  });

  it('collapses anything past the inline limit into a "+N" overflow badge', () => {
    renderWithTestingProviders(
      <TagBadges
        id="o"
        references={[tagRef('1'), tagRef('2'), tagRef('3'), tagRef('4'), tagRef('5')]}
        taggingApi={buildTaggingApi({
          '1': { id: '1', name: 'one' },
          '2': { id: '2', name: 'two' },
          '3': { id: '3', name: 'three' },
          '4': { id: '4', name: 'four' },
          '5': { id: '5', name: 'five' },
        })}
      />
    );
    expect(screen.getByTestId('cases-attach-so-card-tag-o-1')).toBeInTheDocument();
    expect(screen.getByTestId('cases-attach-so-card-tag-o-2')).toBeInTheDocument();
    expect(screen.getByTestId('cases-attach-so-card-tag-o-3')).toBeInTheDocument();
    expect(screen.getByTestId('cases-attach-so-card-tag-o-4')).toBeInTheDocument();
    expect(screen.queryByTestId('cases-attach-so-card-tag-o-5')).not.toBeInTheDocument();

    const overflow = screen.getByTestId('cases-attach-so-card-tags-more-o');
    expect(overflow).toHaveTextContent('+1');
    expect(overflow).toHaveAttribute('aria-label', expect.stringContaining('1'));
  });
});
