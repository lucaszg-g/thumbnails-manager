export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export function totals(jobs, currency = 'USD') {
  return jobs
    .filter((j) => (j.currency || 'USD') === currency)
    .reduce(
      (s, j) => {
        s.total += j.value;
        if (j.paid) s.received += j.value;
        else s.pending += j.value;
        return s;
      },
      { total: 0, received: 0, pending: 0 },
    );
}
export function elapsed(job, now = Date.now()) {
  return (job.elapsedMs || 0) + (job.timerStartedAt ? Math.max(0, now - job.timerStartedAt) : 0);
}
export function toggleTimer(jobs, id, now = Date.now()) {
  const target = jobs.find((j) => j.id === id);
  if (!target) return;
  const running = Boolean(target.timerStartedAt);
  for (const job of jobs)
    if (job.timerStartedAt) {
      job.elapsedMs = elapsed(job, now);
      job.timerStartedAt = null;
    }
  if (!running) target.timerStartedAt = now;
}
export function safeURL(value) {
  try {
    const u = new URL(value);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
// Existing work keeps its negotiated price; defaults only seed a new job.
export function clientPrice(client, job) {
  if (job) return { value: job.baseValue ?? job.value, currency: job.currency || 'USD' };
  return { value: client?.defaultValue ?? '', currency: client?.defaultCurrency || 'USD' };
}
export function localDateTime(value) {
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const defaultDeadline = (now = Date.now()) =>
  localDateTime(Math.ceil((now + 24 * 60 * 60 * 1000) / 60000) * 60000);
export const dueTimestamp = (job) => new Date(job.dueAt || `${job.deadline}T23:59:59`).getTime();
export function deadlineState(job, now = Date.now()) {
  if (job.status === 'delivered') return { label: 'Entregue', tone: 'done' };
  const minutes = Math.ceil((dueTimestamp(job) - now) / 60000);
  if (minutes <= 0) return { label: 'Prazo vencido', tone: 'late' };
  if (minutes < 60) return { label: `Faltam ${minutes} min`, tone: 'urgent' };
  const hours = Math.floor(minutes / 60),
    rest = minutes % 60;
  if (minutes <= 24 * 60)
    return { label: `Faltam ${hours}h${rest ? ` ${rest}min` : ''}`, tone: 'urgent' };
  if (minutes < 48 * 60)
    return { label: `Faltam ${hours}h${rest ? ` ${rest}min` : ''}`, tone: 'normal' };
  return { label: `${Math.ceil(minutes / 1440)} dias restantes`, tone: 'normal' };
}
export function workflowState(job, now = Date.now()) {
  if (job.status === 'delivered')
    return job.paid
      ? { label: 'Concluída', tone: 'done' }
      : { label: 'Aguardando pagamento', tone: 'pending' };
  if (dueTimestamp(job) <= now) return { label: 'Atrasada', tone: 'late' };
  return { label: 'Dentro do prazo', tone: 'normal' };
}
export function priceBreakdown(job) {
  const base = job.baseValue ?? job.value ?? 0;
  const extrasCents = (job.extras || []).reduce(
    (sum, e) => sum + Math.round(e.unitValue * 100) * e.quantity,
    0,
  );
  return { base, extras: extrasCents / 100, total: (Math.round(base * 100) + extrasCents) / 100 };
}
export function setJobStatus(job, status, now = Date.now()) {
  if (!['briefing', 'production', 'review', 'delivered'].includes(status) || job.status === status)
    return false;
  job.status = status;
  job.statusHistory = [
    ...(job.statusHistory || []),
    { status, at: new Date(now).toISOString() },
  ].slice(-20);
  if (status === 'delivered' && job.timerStartedAt) {
    job.elapsedMs = elapsed(job, now);
    job.timerStartedAt = null;
  }
  return true;
}
export function migrate(data) {
  return {
    ...data,
    notes: data.notes || [],
    clients: data.clients.map((c) => ({
      ...c,
      contact: c.contact || '',
      defaultValue: c.defaultValue ?? null,
      defaultCurrency: c.defaultCurrency || 'USD',
    })),
    jobs: data.jobs.map((j) => ({
      ...j,
      currency: j.currency || 'USD',
      elapsedMs: j.elapsedMs || 0,
      timerStartedAt: j.timerStartedAt || null,
      links: j.links || [],
      files: j.files || [],
      extras: j.extras || [],
      priority: j.priority || 'normal',
      statusHistory: j.statusHistory || [],
    })),
  };
}
export function validate(data) {
  if (
    !data ||
    !Array.isArray(data.clients) ||
    !Array.isArray(data.jobs) ||
    (data.notes !== undefined &&
      (!Array.isArray(data.notes) ||
        data.notes.length > 2000 ||
        data.notes.some(
          (n) =>
            !n ||
            typeof n.id !== 'string' ||
            typeof n.title !== 'string' ||
            typeof n.body !== 'string' ||
            n.title.length > 200 ||
            n.body.length > 50000 ||
            typeof n.clientId !== 'string',
        ))) ||
    !Number.isFinite(data.rate) ||
    data.rate <= 0
  )
    return false;
  const date = (v) =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
  const ids = new Set(data.clients.map((c) => c.id));
  return (
    ids.size === data.clients.length &&
    new Set(data.jobs.map((j) => j.id)).size === data.jobs.length &&
    data.clients.every(
      (c) =>
        typeof c.id === 'string' &&
        typeof c.name === 'string' &&
        c.name.trim() &&
        typeof c.email === 'string' &&
        (c.contact === undefined || typeof c.contact === 'string') &&
        (c.defaultValue == null ||
          (Number.isFinite(c.defaultValue) && c.defaultValue >= 0 && c.defaultValue <= 10000000)) &&
        (c.defaultCurrency === undefined || ['USD', 'BRL'].includes(c.defaultCurrency)) &&
        typeof c.color === 'string' &&
        /^#[0-9a-f]{6}$/i.test(c.color),
    ) &&
    data.jobs.every(
      (j) =>
        typeof j.id === 'string' &&
        typeof j.title === 'string' &&
        j.title.trim() &&
        ids.has(j.clientId) &&
        Number.isFinite(j.value) &&
        j.value >= 0 &&
        ['briefing', 'production', 'review', 'delivered'].includes(j.status) &&
        typeof j.paid === 'boolean' &&
        date(j.deadline) &&
        date(j.created) &&
        (!j.paid || date(j.paidAt)) &&
        typeof j.notes === 'string' &&
        (j.dueAt === undefined ||
          (typeof j.dueAt === 'string' &&
            Number.isFinite(Date.parse(j.dueAt)) &&
            /T/.test(j.dueAt))) &&
        (j.priority === undefined || ['normal', 'high'].includes(j.priority)) &&
        (j.baseValue === undefined ||
          (Number.isFinite(j.baseValue) && j.baseValue >= 0 && j.baseValue <= 10000000)) &&
        (j.extras === undefined ||
          (Array.isArray(j.extras) &&
            j.extras.length <= 30 &&
            j.extras.every(
              (e) =>
                e &&
                typeof e.id === 'string' &&
                typeof e.name === 'string' &&
                e.name.trim() &&
                e.name.length <= 120 &&
                Number.isInteger(e.quantity) &&
                e.quantity >= 1 &&
                e.quantity <= 100 &&
                Number.isFinite(e.unitValue) &&
                e.unitValue >= 0 &&
                e.unitValue <= 10000000,
            ))) &&
        (j.baseValue === undefined || Math.abs(priceBreakdown(j).total - j.value) < 0.000001) &&
        (!j.extras?.length || j.baseValue !== undefined) &&
        (j.statusHistory === undefined ||
          (Array.isArray(j.statusHistory) &&
            j.statusHistory.length <= 20 &&
            j.statusHistory.every(
              (h) =>
                h &&
                ['briefing', 'production', 'review', 'delivered'].includes(h.status) &&
                typeof h.at === 'string' &&
                Number.isFinite(Date.parse(h.at)),
            ))) &&
        (j.currency === undefined || ['USD', 'BRL'].includes(j.currency)) &&
        (j.elapsedMs === undefined || (Number.isFinite(j.elapsedMs) && j.elapsedMs >= 0)) &&
        (j.timerStartedAt == null || (Number.isFinite(j.timerStartedAt) && j.timerStartedAt > 0)) &&
        (j.links === undefined ||
          (Array.isArray(j.links) && j.links.every((v) => typeof v === 'string' && safeURL(v)))) &&
        (j.files === undefined ||
          (Array.isArray(j.files) &&
            j.files.every(
              (f) =>
                f &&
                typeof f.id === 'string' &&
                typeof f.name === 'string' &&
                Number.isFinite(f.size) &&
                f.size >= 0 &&
                typeof f.type === 'string',
            ))),
    )
  );
}
