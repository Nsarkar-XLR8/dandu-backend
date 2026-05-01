/**
 * Unit of Work Interface (Port)
 *
 * Abstracts transactional boundaries so the application/domain layer
 * doesn't depend on Prisma's $transaction API.
 *
 * Why?
 * → Business logic shouldn't know about database transactions.
 * → Enables testing with in-memory implementations.
 * → Allows swapping Prisma for another ORM without changing services.
 *
 * Edge Case (MongoDB):
 * MongoDB transactions require a replica set. In development, ensure
 * your local MongoDB is configured with --replSet.
 * Atlas provides replica sets by default.
 *
 * Usage:
 * ```typescript
 * await this.unitOfWork.execute(async (ctx) => {
 *   const job = await this.jobRepo.save(jobEntity, ctx);
 *   await this.timelineRepo.save(timelineEvent, ctx);
 *   return job;
 * });
 * ```
 */
export interface IUnitOfWork {
  /**
   * Execute a function within a transactional boundary.
   * If the function throws, the transaction is rolled back.
   * If it succeeds, the transaction is committed.
   *
   * @param work - The function to execute within the transaction.
   *               Receives a transaction context that adapters use internally.
   * @returns The result of the work function.
   */
  execute<T>(work: (ctx: ITransactionContext) => Promise<T>): Promise<T>;
}

/**
 * Transaction Context — opaque handle passed to repository methods.
 *
 * The domain layer never inspects or uses this directly.
 * Repository adapters cast it to their specific transaction type
 * (e.g., Prisma.TransactionClient).
 *
 * Design: We use a marker interface (empty) to maintain type safety
 * without leaking infrastructure details into the domain.
 */

export interface ITransactionContext {
  /**
   * Opaque marker — do not access directly.
   * Infrastructure adapters store their transaction client here.
   */
  readonly __brand: 'TransactionContext';
}

/**
 * Injection tokens for NestJS DI
 */
export const UNIT_OF_WORK_TOKEN = Symbol('IUnitOfWork');
