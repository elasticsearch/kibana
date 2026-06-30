/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo } from 'react';
import type { InternalFieldErrors } from 'react-hook-form';
import { useFieldArray, useForm, useFormContext } from 'react-hook-form';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import { EuiFlexItem } from '@elastic/eui';
import { EuiSpacer } from '@elastic/eui';
import deepEqual from 'fast-deep-equal';
import { isEmpty, last, reject } from 'lodash';
import { convertShardsToArray, convertShardsToObject } from '../../../../common/utils/converters';
import type { ShardsArray } from '../../../../common/utils/converters';
import { useAgentPolicies } from '../../../agent_policies';
import { ShardsForm } from './shards_form';

export const defaultShardData = {
  policy: {
    label: '',
    key: '',
  },
  percentage: 100,
};

interface PackShardsFieldProps {
  options: Array<EuiComboBoxOptionOption<string>>;
  isDisabled?: boolean;
}

const PackShardsFieldComponent = ({ options, isDisabled = false }: PackShardsFieldProps) => {
  const {
    watch: watchRoot,
    register: registerRoot,
    setValue: setValueRoot,
    formState: { errors: errorsRoot },
  } = useFormContext();
  const { data: { agentPoliciesById } = {} } = useAgentPolicies();

  const rootShards = watchRoot('shards');

  const initialShardsArray = useMemo(() => {
    const initialConvertedShards = convertShardsToArray(rootShards, agentPoliciesById);
    if (!isEmpty(initialConvertedShards)) {
      if (initialConvertedShards[initialConvertedShards.length - 1].policy.key) {
        return [...initialConvertedShards, defaultShardData];
      }

      return initialConvertedShards;
    }

    return [defaultShardData];
  }, [agentPoliciesById, rootShards]);

  const { control, watch, getFieldState, formState, resetField, setValue } = useForm<{
    shardsArray: ShardsArray;
  }>({
    mode: 'all',
    shouldUnregister: true,
    defaultValues: {
      shardsArray: initialShardsArray,
    },
  });
  const { fields, remove, append } = useFieldArray({
    control,
    name: 'shardsArray',
  });

  const formValue = watch();

  const shardsArrayState = getFieldState('shardsArray', formState);

  useEffect(() => {
    registerRoot('shards', {
      validate: () => {
        const errors = shardsArrayState.error as InternalFieldErrors[] | undefined;
        if (!errors || !Array.isArray(errors)) {
          return true;
        }

        const shardsData = formValue.shardsArray ?? [];
        const errorsForFilledRows = errors.filter((_, index) => {
          const shard = shardsData[index];

          return shard?.policy?.key;
        });
        const nonEmptyErrors = reject(errorsForFilledRows, isEmpty) as InternalFieldErrors[];

        return !nonEmptyErrors.length;
      },
    });
  }, [shardsArrayState.error, errorsRoot, registerRoot, formValue.shardsArray]);

  useEffect(() => {
    const subscription = watch((data, payload) => {
      if (data?.shardsArray) {
        const lastShardIndex = data?.shardsArray?.length - 1;
        if (payload.name?.startsWith(`shardsArray.${lastShardIndex}.`)) {
          const lastShard = last(data.shardsArray);
          if (lastShard?.policy?.key) {
            append(defaultShardData);
          }
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [formValue, append, watch]);

  useEffect(() => {
    const parsedShards = convertShardsToObject(formValue.shardsArray);
    if (shardsArrayState.isDirty && !deepEqual(parsedShards, rootShards)) {
      setValueRoot('shards', parsedShards, {
        shouldTouch: true,
        shouldDirty: true,
      });
    }
  }, [setValueRoot, formValue, shardsArrayState.isDirty, rootShards, resetField, setValue]);

  return (
    <>
      <EuiSpacer size="s" />

      {fields.map((item, index, array) => (
        <EuiFlexItem key={item.id}>
          <ShardsForm
            index={index}
            onDelete={remove}
            isLastItem={index === array.length - 1}
            control={control}
            options={options}
            isDisabled={isDisabled}
          />
          <EuiSpacer size="xs" />
        </EuiFlexItem>
      ))}
    </>
  );
};

export const PackShardsField = React.memo(PackShardsFieldComponent);
