/**
 * src/frontend/infrastructure/IStorageRepository.js
 *
 * Abstract contract every storage implementation must satisfy.
 * Services depend ONLY on this interface — never on a concrete implementation.
 * Throw NotImplementedError from every method so missing overrides fail loudly.
 */

export class IStorageRepository {
  /**
   * @param {string} table
   * @param {object} options
   * @param {object}   options.filters   - Exact-match field filters
   * @param {number}   options.limit     - Page size (default 50)
   * @param {number}   options.offset    - Pagination offset (default 0)
   * @param {string}   options.orderBy   - Field to sort by (default 'created_at')
   * @param {string}   options.direction - 'asc' | 'desc' (default 'desc')
   * @param {string}   options.search    - Full-text search string
   * @returns {Promise<{ data: object[], total: number }>}
   */
  async getAll(table, options = {}) {
    throw new Error(`IStorageRepository.getAll() not implemented for table: ${table}`);
  }

  /**
   * @param {string} table
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async getById(table, id) {
    throw new Error(`IStorageRepository.getById() not implemented for table: ${table}`);
  }

  /**
   * @param {string} table
   * @param {object} data
   * @returns {Promise<object>} The created record including generated id and timestamps
   */
  async create(table, data) {
    throw new Error(`IStorageRepository.create() not implemented for table: ${table}`);
  }

  /**
   * @param {string} table
   * @param {string} id
   * @param {object} data
   * @returns {Promise<object>} The updated record
   */
  async update(table, id, data) {
    throw new Error(`IStorageRepository.update() not implemented for table: ${table}`);
  }

  /**
   * @param {string} table
   * @param {string} id
   * @returns {Promise<void>}
   */
  async delete(table, id) {
    throw new Error(`IStorageRepository.delete() not implemented for table: ${table}`);
  }

  /**
   * Batch insert — used only by the migration tool.
   * Default implementation: sequential creates. Override for optimised bulk insert.
   * @param {string}   table
   * @param {object[]} dataArray
   * @returns {Promise<object[]>} The created records
   */
  async createMany(table, dataArray) {
    return Promise.all(dataArray.map(d => this.create(table, d)));
  }

  /**
   * Custom query for operations that don't fit the generic CRUD pattern.
   * @param {string} queryName - Identifier for the custom query
   * @param {object} params
   * @returns {Promise<any>}
   */
  async query(queryName, params = {}) {
    throw new Error(`IStorageRepository.query() — unknown query: ${queryName}`);
  }
}
