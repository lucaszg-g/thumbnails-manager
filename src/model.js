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
  if (job) return { value: job.value, currency: job.currency || 'USD' };
  return { value: client?.defaultValue ?? '', currency: client?.defaultCurrency || 'USD' };
}
export function migrate(data) {
  return {
    ...data,
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
    })),
  };
}
export function validate(data) {
  if (
    !data ||
    !Array.isArray(data.clients) ||
    !Array.isArray(data.jobs) ||
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
