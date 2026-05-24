/**
 * Shared domain types. These mirror the OpenAPI v0.1 schemas (Step B) so the
 *
 * Naming:
 *   - snake_case fields exactly as wire format (matches OpenAPI YAML)
 *   - enums as string literal unions
 */

// ===== Enums =====
export type DeviceStatus =
  | 'online'
  | 'offline'
  | 'maintenance'
  | 'never_connected';
export type AssetType = 'image' | 'video' | 'audio' | 'gif' | 'html';
export type PlayMode = 'plan' | 'manual' | 'idle';
export type TaskStatus =
  | 'draft'
  | 'scheduled'
  | 'distributing'
  | 'completed'
  | 'partial_success'
  | 'failed'
  | 'cancelled';
export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'expired';
export type ApkDistributionType = 'staged' | 'all' | 'group' | 'rollback';
export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'distribute'
  | 'refund'
  | 'command';
export type UserRole =
  | 'lv1_super'
  | 'lv2_admin'
  | 'lv3_operator'
  | 'lv4_viewer';

// ===== Common =====
export interface Pagination {
  next_cursor: string | null;
  prev_cursor: string | null;
  has_more: boolean;
}

export interface Paginated<T> {
  items: T[];
  pagination: Pagination;
}

// ===== Auth / Users =====
export interface User {
  id: string;
  customer_id: string;
  email: string;
  name: string;
  role: UserRole;
  two_factor_enabled: boolean;
  last_login_at: string | null;
  created_at: string;
}

// ===== Stores =====
export interface Store {
  id: string;
  customer_id: string;
  name: string;
  address: string;
  prefecture: string;
  postal_code: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  device_count: number;
  active_device_count: number;
  created_at: string;
}

// ===== Devices =====
export interface Device {
  id: string;
  customer_id: string;
  store_id: string;
  store_name: string;
  /** Friendly name set by operators */
  name: string;
  /** Hardware identifier (Android serial / IMEI). Immutable. */
  serial: string;
  /** Plan/manual/idle */
  play_mode: PlayMode;
  status: DeviceStatus;
  /** Last seen timestamp */
  last_heartbeat_at: string | null;
  /** Currently playing program, if any */
  current_program_id: string | null;
  current_program_name: string | null;
  /** Real-time playback state (updated via SSE every 2s) */
  playback?: {
    state: 'playing' | 'paused' | 'idle';
    position_ms: number;
    duration_ms: number;
    memory_mb: number;
    asset_url?: string;
    updated_at_ms: number;
  } | null;
  /** % of disk used by cached assets */
  storage_used_percent: number | null;
  /** App version on device */
  app_version: string | null;
  android_version: string | null;
  ip_address: string | null;
  group_ids: string[];
  /** Volume 0-100 */
  volume: number;
  /** Brightness 0-100 */
  brightness: number;
  created_at: string;
}

export interface DeviceDetail extends Device {
  /** Recent screenshots (URLs to stored images) */
  recent_screenshots: { url: string; captured_at: string }[];
  /** Power schedule entries */
  power_schedules: PowerSchedule[];
  /** Recent task distributions for this device */
  recent_task_runs: { task_id: string; task_name: string; status: TaskStatus; started_at: string }[];
}

export interface PowerSchedule {
  id: string;
  device_id: string;
  weekday: number; // 0=Sun .. 6=Sat
  power_on_time: string; // "HH:mm"
  power_off_time: string; // "HH:mm"
  enabled: boolean;
}

// ===== Device groups =====
export interface DeviceGroup {
  id: string;
  customer_id: string;
  name: string;
  parent_id: string | null;
  /** True if this group acts as a "linked group" — devices play in sync */
  linked: boolean;
  device_count: number;
  child_group_count: number;
  created_at: string;
}

// ===== Programs / Scenes / Widgets =====
export interface Program {
  id: string;
  customer_id: string;
  name: string;
  description: string | null;
  /** Total duration of all scenes */
  total_duration_sec: number;
  /** Whether this program is published (locked) */
  published: boolean;
  scene_count: number;
  widget_count: number;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Scene {
  id: string;
  program_id: string;
  name: string;
  duration_sec: number;
  order_index: number;
  background_color: string | null;
  widget_count: number;
}

export interface Widget {
  id: string;
  scene_id: string;
  type: 'image' | 'video' | 'text' | 'clock' | 'weather';
  asset_id: string | null;
  /** Bounding box in % of scene canvas */
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  config: Record<string, unknown>;
}

// ===== Assets =====
export interface Asset {
  id: string;
  customer_id: string;
  name: string;
  type: AssetType;
  url: string;
  /** Bytes */
  size: number;
  /** ms for video/audio */
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  thumbnail_url: string | null;
  tags: string[];
  used_in_program_count: number;
  created_at: string;
}

// ===== Tasks (distribution) =====
export interface Task {
  id: string;
  customer_id: string;
  name: string;
  /** What's being distributed */
  payload_type: 'program' | 'apk' | 'plan_schedule' | 'asset_bundle';
  payload_ref_id: string;
  payload_ref_name: string;
  /** When was/will be distribution */
  scheduled_at: string | null;
  status: TaskStatus;
  /** Total/done/failed device count */
  total: number;
  succeeded: number;
  failed: number;
  in_progress: number;
  pending: number;
  created_by: string;
  created_at: string;
}

export interface TaskDeviceRun {
  task_id: string;
  device_id: string;
  device_name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

// ===== Plan schedules =====
export interface PlanSchedule {
  id: string;
  customer_id: string;
  name: string;
  /** Devices/groups this applies to */
  target_device_group_id: string | null;
  /** [{weekday, time_from, time_to, program_id}] */
  slots: PlanScheduleSlot[];
  active: boolean;
  created_at: string;
}

export interface PlanScheduleSlot {
  weekday: number;
  time_from: string; // HH:mm
  time_to: string;
  program_id: string;
  program_name: string;
}

// ===== Products & Inventory =====
export interface Product {
  id: string;
  customer_id: string;
  name: string;
  category: string;
  default_price_yen: number;
  thumbnail_url: string | null;
  active: boolean;
}

export interface Inventory {
  id: string;
  device_id: string;
  device_name: string;
  store_name: string;
  product_id: string;
  product_name: string;
  /** Slot index within the device */
  slot_index: number;
  current_count: number;
  capacity: number;
  /** Threshold for low-stock alert */
  low_threshold: number;
  last_replenished_at: string | null;
}

// ===== Orders =====
export interface Order {
  id: string;
  customer_id: string;
  device_id: string;
  device_name: string;
  store_name: string;
  product_id: string;
  product_name: string;
  amount_yen: number;
  status: OrderStatus;
  payment_provider: 'paypay' | 'cash';
  paypay_payment_id: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  created_at: string;
}

// ===== APK =====
export interface ApkRelease {
  id: string;
  customer_id: string;
  version_name: string;
  version_code: number;
  /** "Production" / "Beta" / "Dev" */
  channel: string;
  size: number;
  uploaded_by: string;
  uploaded_at: string;
  notes: string | null;
  signed: boolean;
  /** Number of devices currently running this version */
  active_install_count: number;
}

// ===== Audit logs =====
export interface AuditLog {
  id: string;
  customer_id: string;
  user_id: string | null;
  user_email: string | null;
  action: AuditAction;
  resource_type: string;
  resource_id: string | null;
  ip_address: string;
  user_agent: string;
  before: unknown;
  after: unknown;
  created_at: string;
}

// ===== Dashboard =====
export interface DashboardOverview {
  device_total: number;
  device_online: number;
  device_offline: number;
  device_maintenance: number;
  store_total: number;
  /** Today */
  orders_today: number;
  revenue_today_yen: number;
  /** Last 7 days */
  revenue_7d_yen: number;
  active_tasks: number;
  low_stock_inventories: number;
}

export interface SalesStat {
  date: string; // YYYY-MM-DD
  orders: number;
  revenue_yen: number;
  refunded_count: number;
  refunded_yen: number;
}

export interface DeviceStat {
  date: string;
  device_id: string;
  device_name: string;
  uptime_hours: number;
  play_count: number;
}

// ===== Gacha (Phase G-3+5-E, Session 39) =====
// 排出順 → 演出マッピング + L1 デフォルト演出設定の UI 型定義
// 既存スタイル踏襲: interface XxxOut/XxxIn, snake_case 列名 (DB 一致)

/**
 * 演出パック (gacha_effect_packs)
 * HTML5 演出 5 種 (normal/bronze/silver/gold/rainbow) を表現。
 * Session 40+ で CRUD UI 対応予定。Session 39 は読み取りのみ。
 */
export interface GachaEffectPack {
  id: string;
  customer_id: string | null;
  code: string;
  name: string;
  description: string | null;
  /** 'html5' | 'mp4' */
  effect_type: string;
  html_template: string | null;
  asset_id: string | null;
  /** 演出表示時間 (ミリ秒) */
  duration_ms: number;
  /** 1=normal, 2=bronze, 3=silver, 4=gold, 5=rainbow */
  tier: number;
  bgm_url: string | null;
  is_builtin: boolean;
  is_active: boolean;
}

/**
 * 抽選プール (gacha_pools)
 * 1 プール = 複数マシンで共有可能。Session 39 ではプール単位で演出設定。
 */
export interface GachaPool {
  id: string;
  customer_id: string;
  program_id: string | null;
  name: string;
  description: string | null;
  /** L1 デフォルト演出: マッピング未設定時のフォールバック */
  default_effect_pack_id: string | null;
  max_ball_number: number;
  price_per_draw: number;
  accepted_payment_methods: string[];
  is_active: boolean;
}

/**
 * ガチャ什器の状態 (gacha_machines)
 * 1 device = 1 machine。pool_id でどのプールに属すかを表す (Session 51)。
 */
export interface GachaMachine {
  device_id: string;
  pool_id: string | null;
  total_balls: number;
  remaining_balls: number;
  low_stock_threshold: number;
  draw_count: number;
  status: string;
}

/**
 * 排出順 → 演出マッピング (gacha_draw_order_effects)
 * 1〜100 の各排出順に演出パックを割り当て。
 * UNIQUE (pool_id, draw_order)。
 */
export interface GachaDrawOrderEffect {
  id: number;
  pool_id: string;
  draw_order: number;
  effect_pack_id: string;
  prize_name: string | null;
  prize_value: number | null;
  notes: string | null;
}

/**
 * bulk upsert リクエスト 1 項目
 */
export interface GachaDrawOrderEffectBulkItem {
  draw_order: number;
  effect_pack_id: string;
  prize_name?: string | null;
  prize_value?: number | null;
  notes?: string | null;
}

/**
 * bulk upsert レスポンス
 */
export interface GachaDrawOrderEffectBulkResult {
  pool_id: string;
  inserted: number;
  updated: number;
  deleted: number;
  total_after: number;
}
