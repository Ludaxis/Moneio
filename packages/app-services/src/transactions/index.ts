/**
 * Transaction module exports
 */

// DTOs and schemas
export {
  transactionListQuerySchema,
  deleteTransactionsSchema,
  type TransactionListQuery,
  type DeleteTransactionsInput,
  type TransactionDto,
  type TransactionListDto,
  type DeleteTransactionsDto,
  type SuggestionDto,
  type CategorySuggestionDto,
  type MatchSuggestionDto,
} from './dto';

// Service functions
export { getTransactions, deleteTransactions } from './service';

// Repository (for testing/extending)
export { TransactionRepository } from './repository';
