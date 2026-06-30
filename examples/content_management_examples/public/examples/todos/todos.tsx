/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import {
  EuiButtonGroup,
  EuiButtonIcon,
  EuiCheckbox,
  EuiFieldText,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiToolTip,
} from '@elastic/eui';
import {
  useCreateContentMutation,
  useDeleteContentMutation,
  useSearchContentQuery,
  useUpdateContentMutation,
} from '@kbn/content-management-plugin/public';

import type {
  Todo,
  TodoCreateIn,
  TodoDeleteIn,
  TodoSearchIn,
  TodoUpdateIn,
  TodoUpdateOut,
  TodoCreateOut,
  TodoSearchOut,
  TodoDeleteOut,
} from '../../../common/examples/todos';
import { TODO_CONTENT_ID } from '../../../common/examples/todos';

const useCreateTodoMutation = () => useCreateContentMutation<TodoCreateIn, TodoCreateOut>();
const useDeleteTodoMutation = () => useDeleteContentMutation<TodoDeleteIn, TodoDeleteOut>();
const useUpdateTodoMutation = () => useUpdateContentMutation<TodoUpdateIn, TodoUpdateOut>();
const useSearchTodosQuery = ({ options: { filter } = {} }: { options: TodoSearchIn['options'] }) =>
  useSearchContentQuery<TodoSearchIn, TodoSearchOut>({
    contentTypeId: TODO_CONTENT_ID,
    query: {},
    options: { filter },
  });

type TodoFilter = 'all' | 'completed' | 'todo';
const filters = [
  {
    id: `all`,
    label: 'All',
  },
  {
    id: `completed`,
    label: 'Completed',
  },
  {
    id: `todo`,
    label: 'Todo',
  },
];

export const Todos = () => {
  const [filterIdSelected, setFilterIdSelected] = React.useState<TodoFilter>('all');

  const { data, isError, error, isFetching, isLoading } = useSearchTodosQuery({
    options: { filter: filterIdSelected === 'all' ? undefined : filterIdSelected },
  });

  const createTodoMutation = useCreateTodoMutation();
  const deleteTodoMutation = useDeleteTodoMutation();
  const updateTodoMutation = useUpdateTodoMutation();

  const isPending =
    isFetching ||
    isLoading ||
    createTodoMutation.isLoading ||
    deleteTodoMutation.isLoading ||
    updateTodoMutation.isLoading;

  if (isError) return <p>Error: {error as string}</p>;

  return (
    <>
      <EuiButtonGroup
        legend="Todo filters"
        options={filters}
        idSelected={filterIdSelected}
        onChange={(id) => {
          setFilterIdSelected(id as TodoFilter);
        }}
      />
      <EuiSpacer />
      {!isLoading && (
        <ul>
          {data.hits.map((todo: Todo) => (
            <React.Fragment key={todo.id}>
              <li
                style={{ display: 'flex', alignItems: 'center' }}
                data-test-subj={`todoItem todoItem-${todo.id}`}
              >
                <EuiCheckbox
                  id={todo.id + ''}
                  key={todo.id}
                  checked={todo.completed}
                  onChange={(e) => {
                    updateTodoMutation.mutate({
                      contentTypeId: TODO_CONTENT_ID,
                      id: todo.id,
                      data: {
                        completed: e.target.checked,
                      },
                    });
                  }}
                  label={todo.title}
                  data-test-subj={`todoCheckbox todoCheckbox-${todo.id}`}
                />

                <EuiToolTip content="Delete" disableScreenReaderOutput>
                  <EuiButtonIcon
                    style={{ marginLeft: '8px' }}
                    display="base"
                    iconType="trash"
                    aria-label="Delete"
                    color="danger"
                    onClick={() => {
                      deleteTodoMutation.mutate({ contentTypeId: TODO_CONTENT_ID, id: todo.id });
                    }}
                  />
                </EuiToolTip>
              </li>
              <EuiSpacer size={'xs'} />
            </React.Fragment>
          ))}
        </ul>
      )}
      <div style={{ minHeight: 24 }}>
        {isPending && <EuiLoadingSpinner data-test-subj={'todoPending'} />}
      </div>
      <form
        onSubmit={(e) => {
          const inputRef = (e.target as HTMLFormElement).elements.namedItem(
            'newTodo'
          ) as HTMLInputElement;
          if (!inputRef || !inputRef.value) return;

          createTodoMutation.mutate({
            contentTypeId: TODO_CONTENT_ID,
            data: {
              title: inputRef.value,
            },
          });

          inputRef.value = '';
          e.preventDefault();
        }}
      >
        <EuiFieldText
          placeholder="Type your todo and press enter to submit"
          name={'newTodo'}
          data-test-subj={'newTodo'}
        />
      </form>
    </>
  );
};
