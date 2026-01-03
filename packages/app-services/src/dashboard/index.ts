/**
 * Dashboard module exports
 */

// DTOs and schemas
export {
  dashboardQuerySchema,
  type DashboardQuery,
  type DashboardMetricsDto,
  type MoneyDto,
  type TrendDto,
  type CategoryBreakdownDto,
  type MonthlyDataDto,
  type RunwayDto,
  type TransactionSummaryDto,
} from './dto';

// Service functions
export { getDashboardMetrics, getRecentTransactions } from './service';
