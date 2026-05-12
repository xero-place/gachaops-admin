/**
 * Mock fixtures - emptied for production.
 * Originally hand-curated seed data; replaced with empty arrays
 * so all pages fall back to real API data only.
 */

import type {
  Device,
  Store,
  DeviceGroup,
  Program,
  Asset,
  Task,
  Order,
  Product,
  Inventory,
  ApkRelease,
  User,
  AuditLog,
  DashboardOverview,
  SalesStat,
  PlanSchedule,
  TaskDeviceRun,
  DeviceDetail,
} from '@/types/domain';

// All empty - real API data is fetched in each page via useEffect.
export const users: User[] = [];
export const stores: Store[] = [];
export const devices: Device[] = [];
export const deviceGroups: DeviceGroup[] = [];
export const programs: Program[] = [];
export const assets: Asset[] = [];
export const tasks: Task[] = [];
export const planSchedules: PlanSchedule[] = [];
export const products: Product[] = [];
export const inventories: Inventory[] = [];
export const orders: Order[] = [];
export const apkReleases: ApkRelease[] = [];
export const auditLogs: AuditLog[] = [];
export const salesStats: SalesStat[] = [];

// Helpers returning null/empty for callers expecting a function
export function deviceDetail(_id: string): DeviceDetail | null {
  return null;
}
export const taskDeviceRuns = (_taskId: string): TaskDeviceRun[] => [];

// Dashboard overview placeholder (real data fetched separately)
export const dashboardOverview: DashboardOverview = {
  device_total: 0,
  device_online: 0,
  device_offline: 0,
  device_maintenance: 0,
  store_total: 0,
  orders_today: 0,
  revenue_today_yen: 0,
  revenue_7d_yen: 0,
  active_tasks: 0,
  low_stock_inventories: 0,
};
