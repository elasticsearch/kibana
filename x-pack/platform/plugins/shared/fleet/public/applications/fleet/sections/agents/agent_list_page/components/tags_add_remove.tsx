/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { difference, uniq } from 'lodash';
import styled from 'styled-components';
import type { EuiSelectableOption } from '@elastic/eui';
import {
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHighlight,
  EuiPopoverFooter,
  EuiPopoverTitle,
  EuiSelectable,
  EuiWrappingPopover,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';

import { useUpdateTags } from '../hooks';

import { sanitizeTag } from '../utils';

import { TagOptions } from './tag_options';

const TruncatedEuiHighlight = styled(EuiHighlight)`
  width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

interface Props {
  agentId?: string;
  agents?: string[] | string;
  allTags: string[];
  selectedTags: string[];
  button: HTMLElement;
  onTagsUpdated: (tagsToAdd: string[]) => void;
  onClosePopover: () => void;
}

export const TagsAddRemove: React.FC<Props> = ({
  agentId,
  agents,
  allTags,
  selectedTags,
  button,
  onTagsUpdated,
  onClosePopover,
}: Props) => {
  const labelsFromTags = useCallback(
    (tags: string[], selected: string[]) =>
      tags.map((tag: string) => ({
        label: tag,
        checked: selected.includes(tag) ? 'on' : undefined,
        onFocusBadge: false,
      })),
    []
  );

  const [labels, setLabels] = useState<Array<EuiSelectableOption<any>>>(
    labelsFromTags(allTags, selectedTags)
  );
  const [searchValue, setSearchValue] = useState<string | undefined>(undefined);
  const [isPopoverOpen, setIsPopoverOpen] = useState(true);
  const [isTagHovered, setIsTagHovered] = useState<{ [tagName: string]: boolean }>({});
  const closePopover = () => {
    setIsPopoverOpen(false);
    onClosePopover();
  };

  const updateTagsHook = useUpdateTags();

  // update labels after tags changing
  useEffect(() => {
    setLabels(labelsFromTags(allTags, selectedTags));
  }, [allTags, labelsFromTags, selectedTags]);

  const isExactMatch = useMemo(
    () => labels.some((label) => label.label === searchValue),
    [labels, searchValue]
  );

  const handleTagsUpdated = (
    tagsToAdd: string[],
    tagsToRemove: string[],
    hasCompleted: boolean = true,
    isRenameOrDelete = false
  ) => {
    if (hasCompleted) {
      return onTagsUpdated(tagsToAdd);
    }
    const selected = labels.filter((tag) => tag.checked === 'on').map((tag) => tag.label);
    const newSelectedTags = difference(selected, tagsToRemove).concat(tagsToAdd);
    const allTagsWithNew = uniq(allTags.concat(newSelectedTags));
    const allTagsWithRemove = isRenameOrDelete
      ? difference(allTagsWithNew, tagsToRemove)
      : allTagsWithNew;
    setLabels(labelsFromTags(allTagsWithRemove, newSelectedTags));
  };

  const updateTags = async (
    tagsToAdd: string[],
    tagsToRemove: string[],
    successMessage?: string,
    errorMessage?: string
  ) => {
    if (agentId) {
      const newSelectedTags = difference(selectedTags, tagsToRemove).concat(tagsToAdd);
      updateTagsHook.updateTags(
        agentId,
        newSelectedTags,
        () => onTagsUpdated(tagsToAdd),
        successMessage,
        errorMessage
      );
    } else {
      updateTagsHook.bulkUpdateTags(
        agents!,
        tagsToAdd,
        tagsToRemove,
        (hasCompleted) => handleTagsUpdated(tagsToAdd, tagsToRemove, hasCompleted),
        successMessage,
        errorMessage
      );
    }
  };

  const renderOption = (option: EuiSelectableOption<any>, search: string) => {
    return (
      <EuiFlexGroup
        alignItems="center"
        gutterSize="s"
        onMouseEnter={() => setIsTagHovered({ ...isTagHovered, [option.label]: true })}
        onMouseLeave={() => setIsTagHovered({ ...isTagHovered, [option.label]: false })}
      >
        <EuiFlexItem>
          <TruncatedEuiHighlight
            search={search}
            onClick={() => {
              const tagsToAdd = option.checked === 'on' ? [] : [option.label];
              const tagsToRemove = option.checked === 'on' ? [option.label] : [];
              updateTags(tagsToAdd, tagsToRemove);
            }}
          >
            {option.label}
          </TruncatedEuiHighlight>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <TagOptions
            tagName={option.label}
            isTagHovered={isTagHovered[option.label]}
            onTagsUpdated={(tagsToAdd, tagsToRemove, hasCompleted) =>
              handleTagsUpdated(tagsToAdd, tagsToRemove, hasCompleted, true)
            }
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  const createTagButton = (
    <EuiButton
      size="s"
      fullWidth
      iconType="plus"
      data-test-subj="createTagBtn"
      onClick={() => {
        if (!searchValue) {
          return;
        }
        updateTags(
          [searchValue],
          [],
          i18n.translate('xpack.fleet.createAgentTags.successNotificationTitle', {
            defaultMessage: 'Tag created',
          }),
          i18n.translate('xpack.fleet.createAgentTags.errorNotificationTitle', {
            defaultMessage: 'Tag creation failed',
          })
        );
      }}
    >
      <FormattedMessage
        id="xpack.fleet.tagsAddRemove.createText"
        defaultMessage='Create a new tag "{name}"'
        values={{
          name: searchValue,
        }}
      />
    </EuiButton>
  );

  return (
    <>
      <EuiWrappingPopover
        aria-label={i18n.translate('xpack.fleet.tagsAddRemove.popoverAriaLabel', {
          defaultMessage: 'Add / remove tags',
        })}
        isOpen={isPopoverOpen}
        button={button!}
        closePopover={closePopover}
        anchorPosition="leftUp"
        hasArrow={true}
        panelPaddingSize="s"
      >
        <EuiSelectable
          // workaround for auto-scroll to first element after clearing search
          onFocus={() => {}}
          aria-label={i18n.translate('xpack.fleet.tagsAddRemove.selectableTagsLabel', {
            defaultMessage: 'Add / remove tags',
          })}
          searchable
          searchProps={{
            'data-test-subj': 'addRemoveTags',
            placeholder: i18n.translate('xpack.fleet.tagsAddRemove.findOrCreatePlaceholder', {
              defaultMessage: 'Find or create tag...',
            }),
            onChange: (value: string) => {
              setSearchValue(sanitizeTag(value));
            },
            value: searchValue ?? '',
          }}
          options={labels}
          renderOption={renderOption}
        >
          {(list, search) => (
            <>
              <EuiPopoverTitle>{search}</EuiPopoverTitle>
              {list}
              {(!isExactMatch || labels.length === 0) && searchValue !== '' ? (
                <EuiPopoverFooter>{createTagButton}</EuiPopoverFooter>
              ) : null}
            </>
          )}
        </EuiSelectable>
      </EuiWrappingPopover>
    </>
  );
};
