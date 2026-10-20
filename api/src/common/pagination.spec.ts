import { pageMeta } from './pagination';

describe('pageMeta', () => {
  it('counts pages from the total and page size', () => {
    expect(pageMeta(23, 3, { page: 3, limit: 10 })).toEqual({
      totalItems: 23,
      itemCount: 3,
      itemsPerPage: 10,
      totalPages: 3,
      currentPage: 3,
    });
  });

  it('reports zero pages when there is nothing', () => {
    expect(pageMeta(0, 0, { page: 1, limit: 10 }).totalPages).toBe(0);
  });
});
