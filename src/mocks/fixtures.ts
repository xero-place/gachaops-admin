/**
 * Hand-curated seed data — about 8 stores, ~40 devices, ~200 orders,
 * a handful of programs/tasks/products. Sized to make every page look
 * "real" without becoming impossible to scan.
 *
 * Data is generated deterministically from a simple LCG so re-rendering
 * yields the same fixtures (matters for snapshot tests if we add them later).
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
  PowerSchedule,
  DeviceStatus,
  PlayMode,
  TaskStatus,
  OrderStatus,
} from '@/types/domain';

// ==================== Deterministic randomness ====================
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
const rand = lcg(20260510);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const pickN = <T,>(arr: T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  }
  return out;
};

const NOW = new Date('2026-05-10T10:30:00+09:00').getTime();
const daysAgo = (d: number) => new Date(NOW - d * 24 * 3600 * 1000).toISOString();
const minutesAgo = (m: number) =>
  new Date(NOW - m * 60 * 1000).toISOString();
const hoursAgo = (h: number) =>
  new Date(NOW - h * 3600 * 1000).toISOString();

// ==================== Fixtures ====================
const CUSTOMER = 'cust_demo_001';

export const users: User[] = [
  {
    id: 'usr_super_001',
    customer_id: CUSTOMER,
    email: 'admin@gachaops.example',
    name: '運営 太郎',
    role: 'lv1_super',
    two_factor_enabled: true,
    last_login_at: minutesAgo(12),
    created_at: daysAgo(180),
  },
  {
    id: 'usr_admin_002',
    customer_id: CUSTOMER,
    email: 'manager@gachaops.example',
    name: '管理 花子',
    role: 'lv2_admin',
    two_factor_enabled: true,
    last_login_at: hoursAgo(3),
    created_at: daysAgo(120),
  },
  {
    id: 'usr_op_003',
    customer_id: CUSTOMER,
    email: 'ops1@gachaops.example',
    name: '現場 次郎',
    role: 'lv3_operator',
    two_factor_enabled: false,
    last_login_at: hoursAgo(28),
    created_at: daysAgo(90),
  },
  {
    id: 'usr_op_004',
    customer_id: CUSTOMER,
    email: 'ops2@gachaops.example',
    name: '現場 三郎',
    role: 'lv3_operator',
    two_factor_enabled: false,
    last_login_at: daysAgo(2),
    created_at: daysAgo(45),
  },
  {
    id: 'usr_view_005',
    customer_id: CUSTOMER,
    email: 'viewer@gachaops.example',
    name: '閲覧 四郎',
    role: 'lv4_viewer',
    two_factor_enabled: false,
    last_login_at: daysAgo(10),
    created_at: daysAgo(30),
  },
];

export const stores: Store[] = [
  {
    id: 'str_shibuya_001',
    customer_id: CUSTOMER,
    name: '渋谷スクランブル店',
    address: '東京都渋谷区道玄坂2-X-X',
    prefecture: '東京都',
    postal_code: '150-0043',
    phone: '03-XXXX-XXXX',
    latitude: 35.6595,
    longitude: 139.7004,
    device_count: 8,
    active_device_count: 7,
    created_at: daysAgo(200),
  },
  {
    id: 'str_akihabara_002',
    customer_id: CUSTOMER,
    name: '秋葉原電気街店',
    address: '東京都千代田区外神田1-X-X',
    prefecture: '東京都',
    postal_code: '101-0021',
    phone: '03-XXXX-YYYY',
    latitude: 35.7022,
    longitude: 139.7745,
    device_count: 6,
    active_device_count: 6,
    created_at: daysAgo(190),
  },
  {
    id: 'str_shinjuku_003',
    customer_id: CUSTOMER,
    name: '新宿東口店',
    address: '東京都新宿区新宿3-X-X',
    prefecture: '東京都',
    postal_code: '160-0022',
    phone: '03-XXXX-ZZZZ',
    latitude: 35.6909,
    longitude: 139.7036,
    device_count: 5,
    active_device_count: 4,
    created_at: daysAgo(150),
  },
  {
    id: 'str_ikebukuro_004',
    customer_id: CUSTOMER,
    name: '池袋サンシャイン店',
    address: '東京都豊島区東池袋3-X-X',
    prefecture: '東京都',
    postal_code: '170-0013',
    phone: '03-XXXX-WWWW',
    latitude: 35.7295,
    longitude: 139.7196,
    device_count: 4,
    active_device_count: 4,
    created_at: daysAgo(120),
  },
  {
    id: 'str_yokohama_005',
    customer_id: CUSTOMER,
    name: '横浜駅西口店',
    address: '神奈川県横浜市西区南幸1-X-X',
    prefecture: '神奈川県',
    postal_code: '220-0005',
    phone: '045-XXX-XXXX',
    latitude: 35.4659,
    longitude: 139.6225,
    device_count: 6,
    active_device_count: 5,
    created_at: daysAgo(100),
  },
  {
    id: 'str_osaka_006',
    customer_id: CUSTOMER,
    name: '大阪なんば店',
    address: '大阪府大阪市中央区難波5-X-X',
    prefecture: '大阪府',
    postal_code: '542-0076',
    phone: '06-XXXX-XXXX',
    latitude: 34.6664,
    longitude: 135.5006,
    device_count: 7,
    active_device_count: 6,
    created_at: daysAgo(80),
  },
  {
    id: 'str_nagoya_007',
    customer_id: CUSTOMER,
    name: '名古屋栄店',
    address: '愛知県名古屋市中区栄3-X-X',
    prefecture: '愛知県',
    postal_code: '460-0008',
    phone: '052-XXX-XXXX',
    latitude: 35.1709,
    longitude: 136.9081,
    device_count: 5,
    active_device_count: 5,
    created_at: daysAgo(60),
  },
  {
    id: 'str_fukuoka_008',
    customer_id: CUSTOMER,
    name: '福岡天神店',
    address: '福岡県福岡市中央区天神2-X-X',
    prefecture: '福岡県',
    postal_code: '810-0001',
    phone: '092-XXX-XXXX',
    latitude: 33.5908,
    longitude: 130.4017,
    device_count: 3,
    active_device_count: 3,
    created_at: daysAgo(45),
  },
];

// Generate a realistic device per store
const STATUSES: DeviceStatus[] = ['online', 'online', 'online', 'online', 'offline', 'maintenance'];
const PLAY_MODES: PlayMode[] = ['plan', 'plan', 'plan', 'manual', 'idle'];
const APP_VERSIONS = ['3.2.1', '3.2.0', '3.1.8', '3.2.2-beta'];
const ANDROID_VERS = ['Android 11', 'Android 12', 'Android 13'];
const PROGRAM_NAMES = [
  'デイリーキャンペーン2026春',
  '新作ガチャ告知 v3',
  '夜間モード (静音)',
  'コラボ企画: アニメX',
  'ロゴループ',
  'ホリデーセール',
];

export const devices: Device[] = [];
let deviceCounter = 0;
for (const store of stores) {
  for (let i = 0; i < store.device_count; i++) {
    deviceCounter++;
    const status = i === 0 && rand() < 0.2 ? 'offline' : pick(STATUSES);
    const isMaintenance = status === 'maintenance';
    const playMode = isMaintenance || status === 'offline' ? 'idle' : pick(PLAY_MODES);
    devices.push({
      id: `dev_${String(deviceCounter).padStart(4, '0')}`,
      customer_id: CUSTOMER,
      store_id: store.id,
      store_name: store.name,
      name: `${store.name.replace(/店$/, '')}-${i + 1}号機`,
      serial: `GACHA-${(0x10000 + deviceCounter).toString(16).toUpperCase()}-${(deviceCounter * 17 + 31).toString(16).toUpperCase().padStart(4, '0')}`,
      play_mode: playMode,
      status,
      last_heartbeat_at:
        status === 'offline'
          ? hoursAgo(2 + Math.floor(rand() * 18))
          : minutesAgo(Math.floor(rand() * 3)),
      current_program_id:
        playMode === 'idle' ? null : `prg_${(deviceCounter % 6) + 1}`,
      current_program_name:
        playMode === 'idle' ? null : PROGRAM_NAMES[deviceCounter % PROGRAM_NAMES.length],
      storage_used_percent:
        status === 'never_connected' ? null : Math.floor(rand() * 70 + 20),
      app_version: pick(APP_VERSIONS),
      android_version: pick(ANDROID_VERS),
      ip_address: `10.0.${Math.floor(rand() * 254)}.${Math.floor(rand() * 254)}`,
      group_ids: [],
      volume: Math.floor(rand() * 50 + 30),
      brightness: Math.floor(rand() * 30 + 70),
      created_at: daysAgo(Math.floor(rand() * 180 + 30)),
    });
  }
}

// Power schedules — apply to all devices
function buildPowerSchedules(deviceId: string): PowerSchedule[] {
  return [0, 1, 2, 3, 4, 5, 6].map((wd) => ({
    id: `psch_${deviceId}_${wd}`,
    device_id: deviceId,
    weekday: wd,
    power_on_time: wd === 0 || wd === 6 ? '10:00' : '09:30',
    power_off_time: wd === 5 || wd === 6 ? '23:00' : '22:00',
    enabled: true,
  }));
}

export function deviceDetail(id: string): DeviceDetail | null {
  const d = devices.find((x) => x.id === id);
  if (!d) return null;
  return {
    ...d,
    recent_screenshots: [
      {
        url: `/api/_mock/screenshot.svg?d=${encodeURIComponent(d.id)}&t=1`,
        captured_at: minutesAgo(5),
      },
      {
        url: `/api/_mock/screenshot.svg?d=${encodeURIComponent(d.id)}&t=2`,
        captured_at: hoursAgo(2),
      },
      {
        url: `/api/_mock/screenshot.svg?d=${encodeURIComponent(d.id)}&t=3`,
        captured_at: hoursAgo(8),
      },
    ],
    power_schedules: buildPowerSchedules(d.id),
    recent_task_runs: tasks
      .slice(0, 3)
      .map((t) => ({
        task_id: t.id,
        task_name: t.name,
        status: t.status,
        started_at: t.scheduled_at ?? t.created_at,
      })),
  };
}

// Device groups — by area + a synced "shop window" group
export const deviceGroups: DeviceGroup[] = [
  {
    id: 'grp_kanto',
    customer_id: CUSTOMER,
    name: '関東エリア',
    parent_id: null,
    linked: false,
    device_count: stores
      .filter((s) => ['東京都', '神奈川県'].includes(s.prefecture))
      .reduce((a, s) => a + s.device_count, 0),
    child_group_count: 4,
    created_at: daysAgo(150),
  },
  {
    id: 'grp_kansai',
    customer_id: CUSTOMER,
    name: '関西エリア',
    parent_id: null,
    linked: false,
    device_count: stores
      .filter((s) => s.prefecture === '大阪府')
      .reduce((a, s) => a + s.device_count, 0),
    child_group_count: 1,
    created_at: daysAgo(150),
  },
  {
    id: 'grp_chubu',
    customer_id: CUSTOMER,
    name: '中部エリア',
    parent_id: null,
    linked: false,
    device_count: stores
      .filter((s) => s.prefecture === '愛知県')
      .reduce((a, s) => a + s.device_count, 0),
    child_group_count: 1,
    created_at: daysAgo(120),
  },
  {
    id: 'grp_kyushu',
    customer_id: CUSTOMER,
    name: '九州エリア',
    parent_id: null,
    linked: false,
    device_count: stores
      .filter((s) => s.prefecture === '福岡県')
      .reduce((a, s) => a + s.device_count, 0),
    child_group_count: 1,
    created_at: daysAgo(80),
  },
  {
    id: 'grp_shibuya_window',
    customer_id: CUSTOMER,
    name: '渋谷店ウィンドウ (連動再生)',
    parent_id: 'grp_kanto',
    linked: true,
    device_count: 4,
    child_group_count: 0,
    created_at: daysAgo(30),
  },
];

export const programs: Program[] = PROGRAM_NAMES.map((name, i) => ({
  id: `prg_${i + 1}`,
  customer_id: CUSTOMER,
  name,
  description:
    i === 0
      ? '春のキャンペーン用プログラム。各店舗で昼夜入替'
      : i === 2
        ? '20時〜閉店まで自動切替'
        : null,
  total_duration_sec: 30 + i * 15,
  published: i < 4,
  scene_count: 3 + (i % 4),
  widget_count: 8 + i * 2,
  thumbnail_url: `/api/_mock/program-thumb.svg?id=${i + 1}`,
  created_at: daysAgo(60 - i * 8),
  updated_at: daysAgo(i * 2),
}));

export const assets: Asset[] = [
  {
    id: 'ast_001',
    customer_id: CUSTOMER,
    name: 'spring-bg-2026.mp4',
    type: 'video',
    url: '/api/_mock/asset.mp4',
    size: 12_400_000,
    duration_ms: 15000,
    width: 1920,
    height: 1080,
    thumbnail_url: '/api/_mock/asset-thumb.svg?type=video',
    tags: ['campaign', 'spring', 'background'],
    used_in_program_count: 3,
    created_at: daysAgo(45),
  },
  {
    id: 'ast_002',
    customer_id: CUSTOMER,
    name: 'logo-loop.gif',
    type: 'gif',
    url: '/api/_mock/asset.gif',
    size: 480_000,
    duration_ms: 2000,
    width: 480,
    height: 480,
    thumbnail_url: '/api/_mock/asset-thumb.svg?type=gif',
    tags: ['logo', 'brand'],
    used_in_program_count: 6,
    created_at: daysAgo(120),
  },
  {
    id: 'ast_003',
    customer_id: CUSTOMER,
    name: 'gacha-newproduct-jp.png',
    type: 'image',
    url: '/api/_mock/asset.png',
    size: 1_200_000,
    duration_ms: null,
    width: 1080,
    height: 1920,
    thumbnail_url: '/api/_mock/asset-thumb.svg?type=image',
    tags: ['announcement', 'product'],
    used_in_program_count: 2,
    created_at: daysAgo(20),
  },
  {
    id: 'ast_004',
    customer_id: CUSTOMER,
    name: 'bgm-jingle.mp3',
    type: 'audio',
    url: '/api/_mock/asset.mp3',
    size: 350_000,
    duration_ms: 8000,
    width: null,
    height: null,
    thumbnail_url: null,
    tags: ['audio', 'jingle'],
    used_in_program_count: 4,
    created_at: daysAgo(90),
  },
  {
    id: 'ast_005',
    customer_id: CUSTOMER,
    name: 'overlay-promo-01.html',
    type: 'html',
    url: '/api/_mock/asset.html',
    size: 24_000,
    duration_ms: null,
    width: 1080,
    height: 1080,
    thumbnail_url: '/api/_mock/asset-thumb.svg?type=html',
    tags: ['overlay', 'interactive'],
    used_in_program_count: 1,
    created_at: daysAgo(7),
  },
];

const TASK_STATUSES: TaskStatus[] = [
  'completed',
  'completed',
  'distributing',
  'partial_success',
  'scheduled',
  'failed',
  'draft',
];

export const tasks: Task[] = Array.from({ length: 12 }, (_, i) => {
  const total = 5 + Math.floor(rand() * 30);
  const status = TASK_STATUSES[i % TASK_STATUSES.length];
  let succeeded = 0;
  let failed = 0;
  let inProg = 0;
  let pending = 0;
  if (status === 'completed') succeeded = total;
  else if (status === 'partial_success') {
    succeeded = Math.floor(total * 0.7);
    failed = total - succeeded;
  } else if (status === 'distributing') {
    succeeded = Math.floor(total * 0.4);
    inProg = Math.floor(total * 0.3);
    pending = total - succeeded - inProg;
  } else if (status === 'failed') failed = total;
  else if (status === 'scheduled' || status === 'draft') pending = total;

  return {
    id: `tsk_${String(i + 1).padStart(3, '0')}`,
    customer_id: CUSTOMER,
    name: i === 0 ? `${PROGRAM_NAMES[0]}を全店配信` : `配信タスク #${i + 1}`,
    payload_type: i % 4 === 3 ? 'apk' : 'program',
    payload_ref_id: i % 4 === 3 ? 'apk_006' : `prg_${(i % 6) + 1}`,
    payload_ref_name:
      i % 4 === 3 ? 'GachaOps Player v3.2.2-beta' : PROGRAM_NAMES[i % PROGRAM_NAMES.length],
    scheduled_at:
      status === 'scheduled'
        ? hoursAgo(-(2 + i))
        : status === 'draft'
          ? null
          : daysAgo(i * 0.5),
    status,
    total,
    succeeded,
    failed,
    in_progress: inProg,
    pending,
    created_by: pick(users).email,
    created_at: daysAgo(i * 0.3 + 0.5),
  };
});

export const taskDeviceRuns = (taskId: string): TaskDeviceRun[] => {
  const t = tasks.find((x) => x.id === taskId);
  if (!t) return [];
  return devices.slice(0, t.total).map((d, i) => {
    let status: TaskDeviceRun['status'] = 'pending';
    if (i < t.succeeded) status = 'completed';
    else if (i < t.succeeded + t.failed) status = 'failed';
    else if (i < t.succeeded + t.failed + t.in_progress) status = 'in_progress';
    return {
      task_id: t.id,
      device_id: d.id,
      device_name: d.name,
      status,
      started_at: status === 'pending' ? null : minutesAgo(20 + i * 2),
      completed_at:
        status === 'completed' || status === 'failed'
          ? minutesAgo(15 + i * 2)
          : null,
      error_message:
        status === 'failed' ? 'Connection timeout while transferring asset bundle' : null,
    };
  });
};

export const planSchedules: PlanSchedule[] = [
  {
    id: 'psch_001',
    customer_id: CUSTOMER,
    name: '平日 標準スケジュール',
    target_device_group_id: 'grp_kanto',
    slots: [
      ...[1, 2, 3, 4, 5].flatMap((wd) => [
        { weekday: wd, time_from: '09:30', time_to: '12:00', program_id: 'prg_1', program_name: PROGRAM_NAMES[0] },
        { weekday: wd, time_from: '12:00', time_to: '14:00', program_id: 'prg_2', program_name: PROGRAM_NAMES[1] },
        { weekday: wd, time_from: '14:00', time_to: '18:00', program_id: 'prg_4', program_name: PROGRAM_NAMES[3] },
        { weekday: wd, time_from: '18:00', time_to: '20:00', program_id: 'prg_2', program_name: PROGRAM_NAMES[1] },
        { weekday: wd, time_from: '20:00', time_to: '22:00', program_id: 'prg_3', program_name: PROGRAM_NAMES[2] },
      ]),
    ],
    active: true,
    created_at: daysAgo(60),
  },
  {
    id: 'psch_002',
    customer_id: CUSTOMER,
    name: '週末 イベントスケジュール',
    target_device_group_id: 'grp_kanto',
    slots: [
      ...[0, 6].flatMap((wd) => [
        { weekday: wd, time_from: '10:00', time_to: '14:00', program_id: 'prg_1', program_name: PROGRAM_NAMES[0] },
        { weekday: wd, time_from: '14:00', time_to: '20:00', program_id: 'prg_4', program_name: PROGRAM_NAMES[3] },
        { weekday: wd, time_from: '20:00', time_to: '23:00', program_id: 'prg_6', program_name: PROGRAM_NAMES[5] },
      ]),
    ],
    active: true,
    created_at: daysAgo(40),
  },
];

export const products: Product[] = [
  { id: 'prd_001', customer_id: CUSTOMER, name: 'プレミアムガチャ', category: 'premium', default_price_yen: 500, thumbnail_url: '/api/_mock/product.svg?id=1', active: true },
  { id: 'prd_002', customer_id: CUSTOMER, name: 'スタンダードガチャ', category: 'standard', default_price_yen: 300, thumbnail_url: '/api/_mock/product.svg?id=2', active: true },
  { id: 'prd_003', customer_id: CUSTOMER, name: 'ミニガチャ', category: 'mini', default_price_yen: 100, thumbnail_url: '/api/_mock/product.svg?id=3', active: true },
  { id: 'prd_004', customer_id: CUSTOMER, name: 'コラボ限定ガチャ', category: 'collab', default_price_yen: 800, thumbnail_url: '/api/_mock/product.svg?id=4', active: true },
  { id: 'prd_005', customer_id: CUSTOMER, name: 'おみくじガチャ', category: 'special', default_price_yen: 200, thumbnail_url: '/api/_mock/product.svg?id=5', active: false },
];

export const inventories: Inventory[] = [];
let invIdx = 0;
for (const dev of devices.filter((d) => d.status !== 'never_connected')) {
  // Each device has 4 slots
  for (let slot = 0; slot < 4; slot++) {
    const product = products[(invIdx + slot) % products.length];
    const capacity = 50;
    const current = Math.floor(rand() * (capacity + 5));
    const trueCurrent = Math.min(current, capacity);
    inventories.push({
      id: `inv_${dev.id}_${slot}`,
      device_id: dev.id,
      device_name: dev.name,
      store_name: dev.store_name,
      product_id: product.id,
      product_name: product.name,
      slot_index: slot,
      current_count: trueCurrent,
      capacity,
      low_threshold: 10,
      last_replenished_at:
        trueCurrent > 30 ? daysAgo(rand() * 3) : daysAgo(rand() * 7 + 3),
    });
  }
  invIdx++;
}

const ORDER_STATUSES: OrderStatus[] = ['paid', 'paid', 'paid', 'paid', 'failed', 'pending', 'refunded'];

export const orders: Order[] = Array.from({ length: 240 }, (_, i) => {
  const dev = devices[i % devices.length];
  const product = products[i % products.length];
  const status = i < 5 ? 'paid' : ORDER_STATUSES[i % ORDER_STATUSES.length];
  const provider: 'paypay' | 'cash' = i % 5 === 4 ? 'cash' : 'paypay';
  const minsAgo = i * 7 + Math.floor(rand() * 11);
  return {
    id: `ord_${String(i + 1).padStart(5, '0')}`,
    customer_id: CUSTOMER,
    device_id: dev.id,
    device_name: dev.name,
    store_name: dev.store_name,
    product_id: product.id,
    product_name: product.name,
    amount_yen: product.default_price_yen,
    status,
    payment_provider: provider,
    paypay_payment_id:
      provider === 'paypay' && (status === 'paid' || status === 'refunded')
        ? `${10000000000 + i * 19}`
        : null,
    paid_at: status === 'paid' || status === 'refunded' ? minutesAgo(minsAgo) : null,
    refunded_at: status === 'refunded' ? minutesAgo(minsAgo - 30) : null,
    created_at: minutesAgo(minsAgo + 1),
  };
});

export const apkReleases: ApkRelease[] = [
  {
    id: 'apk_001',
    customer_id: CUSTOMER,
    version_name: '3.2.2-beta',
    version_code: 322001,
    channel: 'Beta',
    size: 28_400_000,
    uploaded_by: 'admin@gachaops.example',
    uploaded_at: daysAgo(2),
    notes: '- 同期再生のドリフト改善\n- カメラパーミッション追加 (将来用)\n- メモリリーク修正',
    signed: true,
    active_install_count: 4,
  },
  {
    id: 'apk_002',
    customer_id: CUSTOMER,
    version_name: '3.2.1',
    version_code: 321000,
    channel: 'Production',
    size: 27_900_000,
    uploaded_by: 'admin@gachaops.example',
    uploaded_at: daysAgo(14),
    notes: '安定版',
    signed: true,
    active_install_count: 28,
  },
  {
    id: 'apk_003',
    customer_id: CUSTOMER,
    version_name: '3.2.0',
    version_code: 320000,
    channel: 'Production',
    size: 27_500_000,
    uploaded_by: 'admin@gachaops.example',
    uploaded_at: daysAgo(45),
    notes: 'WebSocketプロトコルv2対応',
    signed: true,
    active_install_count: 8,
  },
  {
    id: 'apk_004',
    customer_id: CUSTOMER,
    version_name: '3.1.8',
    version_code: 318000,
    channel: 'Production',
    size: 26_900_000,
    uploaded_by: 'admin@gachaops.example',
    uploaded_at: daysAgo(75),
    notes: '不具合修正',
    signed: true,
    active_install_count: 4,
  },
];

const AUDIT_ACTIONS: AuditLog['action'][] = [
  'create', 'update', 'login', 'distribute', 'command', 'refund', 'delete', 'logout',
];
export const auditLogs: AuditLog[] = Array.from({ length: 80 }, (_, i) => {
  const action = AUDIT_ACTIONS[i % AUDIT_ACTIONS.length];
  const u = users[i % users.length];
  const resourceType = pick(['device', 'program', 'task', 'order', 'user', 'asset']);
  return {
    id: `aud_${String(i + 1).padStart(5, '0')}`,
    customer_id: CUSTOMER,
    user_id: u.id,
    user_email: u.email,
    action,
    resource_type: resourceType,
    resource_id: action === 'login' || action === 'logout' ? null : `${resourceType}_${i + 1}`,
    ip_address: `203.0.113.${i % 254}`,
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/537.36',
    before: action === 'update' ? { volume: 50 } : null,
    after: action === 'update' ? { volume: 70 } : null,
    created_at: minutesAgo(i * 17),
  };
});

// Dashboard
export const dashboardOverview: DashboardOverview = {
  device_total: devices.length,
  device_online: devices.filter((d) => d.status === 'online').length,
  device_offline: devices.filter((d) => d.status === 'offline').length,
  device_maintenance: devices.filter((d) => d.status === 'maintenance').length,
  store_total: stores.length,
  orders_today: orders.filter(
    (o) => o.status === 'paid' && o.paid_at && Date.parse(o.paid_at) > NOW - 86400000,
  ).length,
  revenue_today_yen: orders
    .filter(
      (o) => o.status === 'paid' && o.paid_at && Date.parse(o.paid_at) > NOW - 86400000,
    )
    .reduce((a, o) => a + o.amount_yen, 0),
  revenue_7d_yen: orders
    .filter(
      (o) => o.status === 'paid' && o.paid_at && Date.parse(o.paid_at) > NOW - 7 * 86400000,
    )
    .reduce((a, o) => a + o.amount_yen, 0),
  active_tasks: tasks.filter(
    (t) => t.status === 'distributing' || t.status === 'scheduled',
  ).length,
  low_stock_inventories: inventories.filter((i) => i.current_count <= i.low_threshold).length,
};

export const salesStats: SalesStat[] = Array.from({ length: 14 }, (_, i) => {
  const day = 13 - i;
  // Slight upward trend with some noise
  const baseOrders = 40 + Math.floor(rand() * 30) + (13 - day) * 2;
  return {
    date: new Date(NOW - day * 86400000).toISOString().slice(0, 10),
    orders: baseOrders,
    revenue_yen: baseOrders * (300 + Math.floor(rand() * 200)),
    refunded_count: Math.floor(rand() * 4),
    refunded_yen: Math.floor(rand() * 1000),
  };
});

// Suppress unused-pickN warnings
void pickN;
