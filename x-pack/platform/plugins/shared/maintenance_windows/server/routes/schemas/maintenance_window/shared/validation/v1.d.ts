export declare const validatePagination: (params: {
    page?: number;
    per_page?: number;
}) => "The number of documents is too high. Paginating through more than 10000 documents is not possible." | undefined;
