/** A page of results, in the shape the client already reads (`items` plus `meta`). */
export interface PaginationMeta {
  totalItems: number;
  itemCount: number;
  itemsPerPage: number;
  totalPages: number;
  currentPage: number;
}

export interface IPaginationOptions {
  page: number;
  limit: number;
}

export class Pagination<T> {
  constructor(
    readonly items: T[],
    readonly meta: PaginationMeta,
  ) {}
}

export function pageMeta(
  totalItems: number,
  itemCount: number,
  { page, limit }: IPaginationOptions,
): PaginationMeta {
  return {
    totalItems,
    itemCount,
    itemsPerPage: limit,
    totalPages: Math.ceil(totalItems / limit),
    currentPage: page,
  };
}
