// Read-only adapters. Requests never use an arbitrary user-supplied host.
const WORK = 'https://work-view-thumbnails.lovable.app';
const HERO = 'https://oheropoggers.lovable.app';
async function remote(url, options = {}, fetcher = fetch, inspect = () => {}) {
  const response = await fetcher(url, {
    ...options,
    // Workers supports manual/follow; reject 3xx below without forwarding credentials.
    redirect: 'manual',
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw Error('O portal recusou a consulta. Verifique o link de acesso.');
  inspect(response);
  const text = await response.text();
  if (text.length > 8 * 1024 * 1024) throw Error('Resposta do portal acima do limite.');
  return text;
}
async function bundle(origin, fetcher) {
  const html = await remote(origin, {}, fetcher);
  const asset = html.match(/src="(\/assets\/index-[\w-]+\.js)"/)?.[1];
  if (!asset) throw Error('O portal mudou de formato. O conector precisa ser atualizado.');
  return remote(origin + asset, {}, fetcher);
}
export function parsePortal(link) {
  let u;
  try {
    u = new URL(link);
  } catch {
    throw Error('Informe um link válido do portal.');
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port)
    throw Error('Link de portal inválido.');
  if (u.origin === WORK && /^\/team-portal\/[a-zA-Z0-9-]{8,100}\/?$/.test(u.pathname))
    return { id: 'workview', token: u.pathname.split('/')[2] };
  if (
    u.origin === HERO &&
    u.pathname === '/funcionario' &&
    /^[a-zA-Z0-9-]{8,100}$/.test(u.searchParams.get('token') || '')
  )
    return { id: 'ohero', token: u.searchParams.get('token') };
  throw Error('Use o link de equipe do Work View ou de funcionário do oHero.');
}
const amount = (v) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) throw Error('Valor inválido recebido do portal.');
  return Math.round(n * 100) / 100;
};
const sum = (xs, field) => Math.round(xs.reduce((s, x) => s + amount(x[field]), 0) * 100) / 100;
const image = (s) => {
  try {
    return new URL(s).protocol === 'https:' ? s : null;
  } catch {
    return null;
  }
};
const monthFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
});
export function financialMonth(value) {
  if (!value || value.length <= 10) return (value || '').slice(0, 7);
  const parts = monthFormatter.formatToParts(new Date(value));
  return (
    parts.find((p) => p.type === 'year').value + '-' + parts.find((p) => p.type === 'month').value
  );
}
export function normalizeWorkView({ tasks, clients, payouts, additionals, reconciliations = [] }) {
  const byClient = new Map(clients.map((c) => [c.id, c]));
  const ledger = new Map();
  for (const p of payouts) {
    if (!p.assignment_id || !p.task_id) throw Error('Formato de repasses alterado.');
    const rows = ledger.get(p.task_id) || new Map();
    rows.set(p.assignment_id, p);
    ledger.set(p.task_id, rows);
  }
  const jobs = tasks.map((t) => {
    if (
      !t.id ||
      !t.title ||
      !['pending', 'in_progress', 'working', 'review', 'approved', 'rejected'].includes(t.status)
    )
      throw Error('Formato de tarefas alterado.');
    const c = byClient.get(t.client_id);
    const rows = [...(ledger.get('team-' + t.id)?.values() || [])];
    ledger.delete('team-' + t.id);
    const base = amount(c?.value ?? t.value ?? 0);
    const value = Math.max(
      0,
      amount(
        base +
          amount(t.additional_value) +
          sum(
            additionals.filter((a) => a.task_id === 'team-' + t.id),
            'value',
          ),
      ),
    );
    const received = t.is_paid
      ? value
      : Math.min(
          value,
          sum(
            rows.filter((p) => p.transfer_status === 'paid'),
            'transfer_value',
          ),
        );
    return {
      id: 'workview:' + t.id,
      source: 'workview',
      title: t.title,
      client: c?.name || 'Cliente',
      value,
      received,
      paymentStatus:
        t.is_paid || (value > 0 && received >= value)
          ? 'paid'
          : received > 0
            ? 'partial'
            : 'pending',
      currency: 'BRL',
      status:
        t.status === 'approved'
          ? 'delivered'
          : t.status === 'pending'
            ? 'briefing'
            : ['in_progress', 'working'].includes(t.status)
              ? 'production'
              : 'review',
      sourceStatus: t.status,
      created: t.created_at,
      completedAt: t.completed_at || t.reviewed_at,
      paidAt:
        t.paid_at ||
        rows
          .filter((p) => p.transfer_status === 'paid')
          .map((p) => p.paid_at)
          .filter(Boolean)
          .sort()
          .at(-1) ||
        null,
      deadline: t.deadline,
      thumbnail: image(t.thumbnail_url),
    };
  });
  // Historical payouts without a current team task remain a single financial record per task.
  for (const [id, map] of ledger) {
    const rows = [...map.values()],
      p = rows[0];
    jobs.push({
      id: 'workview:' + id.replace(/^team-/, ''),
      source: 'workview',
      title: p.task_description || 'Repasse anterior',
      client: p.client_name || 'Cliente',
      value: sum(rows, 'transfer_value'),
      received: sum(
        rows.filter((p) => p.transfer_status === 'paid'),
        'transfer_value',
      ),
      paymentStatus: rows.every((p) => p.transfer_status === 'paid')
        ? 'paid'
        : rows.some((p) => p.transfer_status === 'paid')
          ? 'partial'
          : 'pending',
      currency: 'BRL',
      status: 'delivered',
      sourceStatus: 'repasse',
      created: p.reference_date || p.created_at,
      paidAt:
        rows
          .filter((p) => p.transfer_status === 'paid')
          .map((p) => p.paid_at)
          .filter(Boolean)
          .sort()
          .at(-1) || null,
      deadline: null,
      thumbnail: image(p.task_thumbnail_url),
    });
  }
  for (const r of reconciliations) {
    const month = String(r.month).slice(0, 7);
    const rows = jobs.filter(
      (j) => j.status === 'delivered' && financialMonth(j.completedAt || j.created) === month,
    );
    const official = amount(r.official_total);
    for (const j of rows) {
      j.received = r.status === 'paid' ? j.value : 0;
      j.paymentStatus = r.status === 'paid' ? 'paid' : 'pending';
      j.paidAt = r.status === 'paid' ? r.paid_at || null : null;
    }
    const difference = amount(official - sum(rows, 'value'));
    if (difference)
      jobs.push({
        id: 'workview:reconciliation:' + r.id,
        source: 'workview',
        kind: 'adjustment',
        title: 'Acerto oficial · ' + month,
        client: 'Fechamento da empresa',
        value: difference,
        received: r.status === 'paid' ? difference : 0,
        paymentStatus: r.status === 'paid' ? 'paid' : 'pending',
        paidAt: r.status === 'paid' ? r.paid_at || null : null,
        currency: 'BRL',
        status: 'delivered',
        sourceStatus: 'acerto',
        created: month + '-01T12:00:00Z',
        completedAt: month + '-01T12:00:00Z',
        deadline: null,
        thumbnail: null,
      });
  }
  return jobs.map((j) => ({ ...j, referenceMonth: financialMonth(j.completedAt || j.created) }));
}
// Minimal data-only decoder for the portal's Seroval transport. Never evaluates code.
export function decodePortal(node, refs = new Map(), depth = 0) {
  if (!node || depth > 100) throw Error('Resposta inválida do portal.');
  if (node.t === 0) return Number(node.s);
  if (node.t === 1) return String(node.s);
  if (node.t === 2) {
    if (![0, 1, 2, 3].includes(node.s)) throw Error('Constante não suportada.');
    return [null, undefined, true, false][node.s];
  }
  if (node.t === 4) {
    if (!refs.has(node.i)) throw Error('Referência inválida.');
    return refs.get(node.i);
  }
  if (node.t === 25)
    throw Error('O portal recusou o acesso. Verifique se o link ainda está ativo.');
  const out = node.t === 9 ? [] : node.t === 10 || node.t === 11 ? Object.create(null) : null;
  if (!out) throw Error('O formato do portal mudou.');
  refs.set(node.i, out);
  if (node.t === 9) for (const v of node.a) out.push(decodePortal(v, refs, depth + 1));
  else
    node.p.k.forEach((k, i) => {
      if (typeof k !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(k))
        throw Error('Campo inválido.');
      out[k] = decodePortal(node.p.v[i], refs, depth + 1);
    });
  return out;
}
export function normalizeHero(data) {
  if (
    !data?.profile ||
    !Array.isArray(data.tasks) ||
    !Array.isArray(data.clients) ||
    !Array.isArray(data.paymentStatuses)
  )
    throw Error('Formato de dados do oHero alterado.');
  const clients = new Map(data.clients.map((c) => [c.id, c]));
  return data.tasks.map((t) => {
    if (!t.id || !t.title || !['todo', 'in-progress', 'done', 'review'].includes(t.status))
      throw Error('Formato de tarefa do oHero alterado.');
    const value = amount(t.price_brl);
    const month = financialMonth(t.completed_at || t.created_at);
    const paid =
      t.status === 'done' &&
      data.paymentStatuses.some(
        (p) => p.client_id === t.client_id && p.month_start?.slice(0, 7) === month && p.paid_at,
      );
    const attachments = t.attachments || {};
    const thumb = attachments.images?.find((i) => i.id === attachments.thumbnailImageId);
    return {
      id: 'ohero:' + t.id,
      source: 'ohero',
      title: t.title,
      client: clients.get(t.client_id)?.name || 'Cliente',
      value,
      received: paid ? value : 0,
      paymentStatus: paid ? 'paid' : 'pending',
      currency: 'BRL',
      status: {
        todo: 'briefing',
        'in-progress': 'production',
        done: 'delivered',
        review: 'review',
      }[t.status],
      sourceStatus: t.status,
      created: t.created_at,
      completedAt: t.completed_at,
      referenceMonth: month,
      paidAt: paid
        ? data.paymentStatuses.find(
            (p) => p.client_id === t.client_id && p.month_start?.slice(0, 7) === month && p.paid_at,
          )?.paid_at
        : null,
      deadline: t.due_date,
      thumbnail: image(thumb?.url),
    };
  });
}
export async function readProvider(id, token, fetcher = fetch) {
  if (id === 'workview') {
    const js = await bundle(WORK, fetcher);
    const host = js.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[0];
    const key = js.match(/eyJhbGciOiJIUzI1NiI[^"\s]+/)?.[0];
    if (host !== 'https://fgwedmzzwzedoousfnby.supabase.co' || !key)
      throw Error('O conector Work View precisa ser atualizado.');
    const rpc = async (name) => {
      const rows = [];
      for (let offset = 0; offset < 10000; offset += 1000) {
        let range;
        const result = JSON.parse(
          await remote(
            host + '/rest/v1/rpc/' + name,
            {
              method: 'POST',
              headers: {
                apikey: key,
                Authorization: 'Bearer ' + key,
                'Content-Type': 'application/json',
                Prefer: 'count=exact',
                Range: `${offset}-${offset + 999}`,
                'Range-Unit': 'items',
              },
              body: JSON.stringify({ p_token: token }),
            },
            fetcher,
            (response) => {
              range = response.headers.get('Content-Range');
            },
          ),
        );
        if (!Array.isArray(result)) throw Error('Acesso expirado no Work View.');
        rows.push(...result);
        const match = range?.match(/^(\d+)-(\d+)\/(\d+)$/);
        if (match && Number(match[1]) !== offset) throw Error('Paginação incompleta no Work View.');
        if (match && rows.length >= Number(match[3])) return rows;
        if (result.length < 1000) {
          if (match && rows.length < Number(match[3]))
            throw Error('Consulta incompleta no Work View.');
          return rows;
        }
        if (!match) throw Error('Não foi possível verificar a paginação do Work View.');
      }
      throw Error('Limite de dez mil registros por consulta atingido.');
    };
    const member = await rpc('get_team_member_by_portal_token');
    if (member.length !== 1) throw Error('Link Work View inválido ou expirado.');
    const [tasks, clients, payouts, additionals, reconciliations] = await Promise.all(
      [
        'get_team_tasks_by_portal_token',
        'get_team_clients_by_portal_token',
        'get_all_payouts_by_portal_token',
        'get_task_additionals_by_portal_token',
        'get_team_reconciliations_by_portal_token',
      ].map(rpc),
    );
    return normalizeWorkView({ tasks, clients, payouts, additionals, reconciliations });
  }
  if (id !== 'ohero') throw Error('Empresa não suportada.');
  const js = await bundle(HERO, fetcher);
  const file = js.match(/assets\/employeePortalClient-[\w-]+\.js/)?.[0];
  if (!file) throw Error('O conector oHero precisa ser atualizado.');
  const module = await remote(HERO + '/' + file, {}, fetcher);
  const hash = module.match(
    /const \w+=\w+\(\{method:"POST"\}\)\.handler\(\w+\("([a-f0-9]{64})"\)\)/,
  )?.[1];
  if (!hash) throw Error('O conector oHero precisa ser atualizado.');
  const payload = {
    t: {
      t: 10,
      i: 0,
      p: { k: ['data'], v: [{ t: 10, i: 1, p: { k: ['token'], v: [{ t: 1, s: token }] } }] },
    },
    f: 0,
    m: [],
  };
  const response = JSON.parse(
    await remote(
      HERO + '/_serverFn/' + hash,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tsr-serverFn': 'true',
          Accept: 'application/json',
          Origin: HERO,
        },
        body: JSON.stringify(payload),
      },
      fetcher,
    ),
  );
  const decoded = decodePortal(response);
  if (decoded.error) throw Error('O portal recusou o acesso. Confira seu link.');
  return normalizeHero(decoded.result);
}
