import type { PropsWithChildren } from 'react';
import React from 'react';
import type { TagsActionState } from '../components/tags/use_tags_action';
export declare const IndividualTagsActionContextProvider: ({ children, value, }: PropsWithChildren<{
    value: TagsActionState;
}>) => React.JSX.Element;
export declare const useIndividualTagsActionContext: () => TagsActionState;
