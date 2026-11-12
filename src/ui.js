// Presentation helpers are independent of workspace state and persistence.
const labels = {
  dashboard: 'Visão geral',
  jobs: 'Thumbnails',
  clients: 'Clientes',
  finance: 'Financeiro',
  deadlines: 'Prazos',
  tools: 'Ferramentas',
  notes: 'Notas',
  settings: 'Configurações',
};
const statuses = {
  briefing: 'Briefing',
  production: 'Em produção',
  review: 'Em revisão',
  delivered: 'Entregue',
};
const paths = {
  tools: 'M4 4h16v16H4z M8 8h8 M12 8v8',
  notes: 'M4 3h16v18H4z M8 8h8 M8 12h8 M8 16h4',
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  jobs: 'M3 4h18v16H3z M3 15l5-5 5 5 3-3 5 5 M15 8h.01',
  clients:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87',
  finance: 'M3 6h18v15H3z M3 6V3h15v3 M16 12h5 M16 15h.01',
  deadlines: 'M3 5h18v16H3z M16 3v4 M8 3v4 M3 11h18 M8 15h2 M14 15h2',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',
  plus: 'M12 5v14 M5 12h14',
  search: 'M21 21l-5-5 M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14',
  edit: 'M15 5l4 4 M3 21l5-1L21 7l-4-4L4 16z',
  check: 'M5 12l4 4L19 6',
  trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  arrow: 'M7 17L17 7 M7 7h10v10',
};
const icon = (name) =>
  /* HTML */ `<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="${paths[name] || paths.jobs}" />
  </svg>`;
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const money = (v, c = 'USD') =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: c }).format(v);
const date = (v) =>
  new Date(v + 'T12:00:00')
    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    .replace('.', '');
const initials = (name) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
function duration(ms) {
  const seconds = Math.floor(ms / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}
export { labels, statuses, icon, esc, money, date, initials, duration };
