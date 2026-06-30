import React from 'react';
interface Props {
    isSearching: boolean;
    onSearchInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    searchInput: string;
}
export declare const Search: React.NamedExoticComponent<Props>;
export {};
