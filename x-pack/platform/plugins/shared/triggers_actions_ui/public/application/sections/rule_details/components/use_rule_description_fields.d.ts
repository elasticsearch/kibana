import React from 'react';
import type { PrebuildFieldsMap, RuleDefinitionProps } from '../../../../types';
export declare const AsyncField: <T>({ queryKey, queryFn, children, }: {
    queryKey: string[];
    queryFn: () => Promise<T>;
    children: (data: T) => React.ReactNode;
}) => React.JSX.Element;
export declare const createPrebuildFields: ({ border }: {
    border: string;
}) => PrebuildFieldsMap;
export declare const useRuleDescriptionFields: ({ rule, ruleTypeRegistry, }: {
    rule: RuleDefinitionProps["rule"];
    ruleTypeRegistry: RuleDefinitionProps["ruleTypeRegistry"];
}) => {
    descriptionFields: {
        title: string;
        description: NonNullable<React.ReactNode>;
    }[];
};
