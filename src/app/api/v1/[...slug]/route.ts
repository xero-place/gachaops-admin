import { NextRequest } from 'next/server';
import {
  devices,
  deviceDetail,
  deviceGroups,
  stores,
  programs,
  assets,
  tasks,
  taskDeviceRuns,
  planSchedules,
  products,
  inventories,
  orders,
  apkReleases,
  users,
  auditLogs,
  dashboardOverview,
  salesStats,
} from '@/mocks/fixtures';
import { json, paginate, problem, delay } from '@/lib/api-mock-helpers';

/**
 * Single catch-all dispatcher for the mock API surface.
 *
 * This is *not* meant to be a perfect implementation of every OpenAPI path —
 * it covers what the UI consumes. Anything not here returns 404 with a
 * problem+json body. Adding a new endpoint is one route entry below.
 *
 * Why a single handler? Defining 80+ route.ts files for a mock would mean
 * 80+ files of boilerplate. A single dispatcher with a route table keeps
 * the mock honest about what's actually implemented and easy to audit.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await ctx.params;
  return dispatch('GET', slug, req);
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await ctx.params;
  return dispatch('POST', slug, req);
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await ctx.params;
  return dispatch('PATCH', slug, req);
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await ctx.params;
  return dispatch('PUT', slug, req);
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await ctx.params;
  return dispatch('DELETE', slug, req);
}

async function dispatch(method: string, slug: string[], req: NextRequest) {
  // Tiny artificial latency so the loading states are observable
  await delay(120 + Math.floor(Math.random() * 180));

  const path = '/' + (slug?.join('/') ?? '');
  const url = new URL(req.url);
  const q = url.searchParams;

  // ===== /dashboard/overview =====
  if (method === 'GET' && path === '/dashboard/overview') {
    return json(dashboardOverview);
  }
  if (method === 'GET' && path === '/stats/sales') return json(salesStats);
  if (method === 'GET' && path === '/stats/devices') {
    return json(
      devices.slice(0, 10).map((d) => ({
        date: new Date().toISOString().slice(0, 10),
        device_id: d.id,
        device_name: d.name,
        uptime_hours: 12 + Math.floor(Math.random() * 12),
        play_count: 100 + Math.floor(Math.random() * 400),
      })),
    );
  }

  // ===== Auth =====
  if (method === 'GET' && path === '/auth/me') {
    return json(users[0]);
  }
  if (method === 'POST' && path === '/auth/login') {
    return json({
      access_token: 'mock_at_' + Date.now(),
      refresh_token: 'mock_rt_' + Date.now(),
      expires_in: 1800,
      token_type: 'Bearer',
      user: users[0],
    });
  }
  if (method === 'POST' && path === '/auth/logout') return json({}, { status: 204 });

  // ===== Stores =====
  if (method === 'GET' && path === '/stores') {
    return json(paginate(stores, q.get('cursor'), parseInt(q.get('limit') ?? '50')));
  }
  if (method === 'GET' && path.match(/^\/stores\/[^/]+$/)) {
    const id = path.split('/')[2];
    const s = stores.find((x) => x.id === id);
    return s ? json(s) : problem(404, 'Store not found');
  }

  // ===== Devices =====
  if (method === 'GET' && path === '/devices') {
    let list = devices;
    const status = q.get('status');
    const storeId = q.get('store_id');
    const search = q.get('q');
    if (status) list = list.filter((d) => d.status === status);
    if (storeId) list = list.filter((d) => d.store_id === storeId);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (d) => d.name.toLowerCase().includes(s) || d.serial.toLowerCase().includes(s),
      );
    }
    return json(paginate(list, q.get('cursor'), parseInt(q.get('limit') ?? '50')));
  }
  if (method === 'GET' && path.match(/^\/devices\/[^/]+$/)) {
    const id = path.split('/')[2];
    const d = deviceDetail(id);
    return d ? json(d) : problem(404, 'Device not found');
  }
  if (method === 'POST' && path.match(/^\/devices\/[^/]+\/commands$/)) {
    return json(
      {
        command_id: 'cmd_' + Date.now().toString(36),
        accepted_at: new Date().toISOString(),
        status: 'queued',
      },
      { status: 202 },
    );
  }
  if (method === 'POST' && path.match(/^\/devices\/[^/]+\/screenshot$/)) {
    return json(
      {
        screenshot_url: '/api/_mock/screenshot.svg?t=' + Date.now(),
        captured_at: new Date().toISOString(),
      },
      { status: 202 },
    );
  }
  if (method === 'POST' && path === '/devices/bulk') {
    return json({ accepted_count: 5, command_id: 'cmd_bulk_' + Date.now().toString(36) }, { status: 202 });
  }

  // ===== Device groups =====
  if (method === 'GET' && path === '/device-groups')
    return json({ items: deviceGroups, pagination: { next_cursor: null, prev_cursor: null, has_more: false } });
  if (method === 'GET' && path.match(/^\/device-groups\/[^/]+$/)) {
    const id = path.split('/')[2];
    const g = deviceGroups.find((x) => x.id === id);
    return g
      ? json({
          ...g,
          devices: devices.filter((d) => d.group_ids.includes(id) || g.id === 'grp_kanto').slice(0, 8),
          children: deviceGroups.filter((x) => x.parent_id === id),
        })
      : problem(404, 'Device group not found');
  }

  // ===== Programs =====
  if (method === 'GET' && path === '/programs')
    return json(paginate(programs, q.get('cursor'), parseInt(q.get('limit') ?? '50')));
  if (method === 'GET' && path.match(/^\/programs\/[^/]+$/)) {
    const id = path.split('/')[2];
    const p = programs.find((x) => x.id === id);
    return p ? json(p) : problem(404, 'Program not found');
  }
  if (method === 'POST' && path.match(/^\/programs\/[^/]+\/(publish|duplicate)$/)) {
    return json({ ok: true });
  }

  // ===== Assets =====
  if (method === 'GET' && path === '/assets') {
    let list = assets;
    const type = q.get('type');
    const search = q.get('q');
    if (type) list = list.filter((a) => a.type === type);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (a) => a.name.toLowerCase().includes(s) || a.tags.some((t) => t.includes(s)),
      );
    }
    return json(paginate(list, q.get('cursor'), parseInt(q.get('limit') ?? '50')));
  }
  if (method === 'POST' && path === '/assets/upload-url') {
    return json({
      upload_url: 'https://s3-mock.example.com/upload/' + Date.now(),
      asset_id: 'ast_pending_' + Date.now().toString(36),
      expires_in: 600,
    });
  }

  // ===== Tasks =====
  if (method === 'GET' && path === '/tasks')
    return json(paginate(tasks, q.get('cursor'), parseInt(q.get('limit') ?? '50')));
  if (method === 'GET' && path.match(/^\/tasks\/[^/]+$/)) {
    const id = path.split('/')[2];
    const t = tasks.find((x) => x.id === id);
    return t ? json(t) : problem(404, 'Task not found');
  }
  if (method === 'GET' && path.match(/^\/tasks\/[^/]+\/devices$/)) {
    const id = path.split('/')[2];
    return json({ items: taskDeviceRuns(id), pagination: { next_cursor: null, prev_cursor: null, has_more: false } });
  }
  if (method === 'POST' && path.match(/^\/tasks\/[^/]+\/(distribute|cancel)$/)) {
    return json({ ok: true });
  }

  // ===== Plan schedules =====
  if (method === 'GET' && path === '/plan-schedules')
    return json({ items: planSchedules, pagination: { next_cursor: null, prev_cursor: null, has_more: false } });
  if (method === 'GET' && path.match(/^\/plan-schedules\/[^/]+$/)) {
    const id = path.split('/')[2];
    const s = planSchedules.find((x) => x.id === id);
    return s ? json(s) : problem(404, 'Plan schedule not found');
  }

  // ===== Products =====
  if (method === 'GET' && path === '/products')
    return json({ items: products, pagination: { next_cursor: null, prev_cursor: null, has_more: false } });

  // ===== Inventories =====
  if (method === 'GET' && path === '/inventories') {
    let list = inventories;
    const lowOnly = q.get('low_only');
    if (lowOnly === 'true') list = list.filter((i) => i.current_count <= i.low_threshold);
    return json(paginate(list, q.get('cursor'), parseInt(q.get('limit') ?? '100')));
  }
  if (method === 'POST' && path.match(/^\/inventories\/[^/]+\/replenish$/)) {
    return json({ ok: true });
  }

  // ===== Orders =====
  if (method === 'GET' && path === '/orders') {
    let list = orders;
    const status = q.get('status');
    const provider = q.get('payment_provider');
    if (status) list = list.filter((o) => o.status === status);
    if (provider) list = list.filter((o) => o.payment_provider === provider);
    return json(paginate(list, q.get('cursor'), parseInt(q.get('limit') ?? '50')));
  }
  if (method === 'GET' && path.match(/^\/orders\/[^/]+$/)) {
    const id = path.split('/')[2];
    const o = orders.find((x) => x.id === id);
    return o ? json(o) : problem(404, 'Order not found');
  }
  if (method === 'POST' && path.match(/^\/orders\/[^/]+\/refund$/)) {
    return json({ ok: true, refund_id: 'rf_' + Date.now().toString(36) });
  }

  // ===== APK =====
  if (method === 'GET' && path === '/apk/releases')
    return json({ items: apkReleases, pagination: { next_cursor: null, prev_cursor: null, has_more: false } });
  if (method === 'POST' && path.match(/^\/apk\/releases\/[^/]+\/(distribute|rollback)$/)) {
    return json({ ok: true, task_id: 'tsk_apk_' + Date.now().toString(36) });
  }

  // ===== Users =====
  if (method === 'GET' && path === '/users')
    return json({ items: users, pagination: { next_cursor: null, prev_cursor: null, has_more: false } });

  // ===== Audit logs =====
  if (method === 'GET' && path === '/audit-logs') {
    let list = auditLogs;
    const action = q.get('action');
    const userId = q.get('user_id');
    if (action) list = list.filter((a) => a.action === action);
    if (userId) list = list.filter((a) => a.user_id === userId);
    return json(paginate(list, q.get('cursor'), parseInt(q.get('limit') ?? '100')));
  }

  return problem(404, 'Endpoint not implemented in mock', `${method} ${path}`);
}
