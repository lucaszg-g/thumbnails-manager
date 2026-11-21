import { esc, money, statuses, icon } from './ui.js';
import { today } from './model.js';
let state = { companies: [], ready: false },
  loaded = false,
  busy = false,
  error = '',
  lastLoad = 0;
let source = 'all',
  period = today().slice(0, 7),
  payment = 'all',
  status = 'all',
  dateFrom = '',
  dateTo = '',
  search = '',
  visibleCount = 60;
let apiRef, renderRef;
const editing = () =>
  document.querySelector('#modal')?.open ||
  document.activeElement?.closest('input, textarea, select') ||
  [...document.querySelectorAll('#company-connect input')].some((el) => el.value);
const companyName = (c) =>
  c.id === 'workview' && ['Work View', 'workview'].includes(c.name) ? 'Sharps' : c.name;
export function combinedJobs(data, companies = state.companies) {
  return [
    ...data.jobs.map((j) => ({
      ...j,
      source: 'own',
      client: data.clients.find((c) => c.id === j.clientId)?.name || 'Cliente',
      received: j.paid ? j.value : 0,
      paymentStatus: j.paid ? 'paid' : 'pending',
    })),
    ...companies.flatMap((c) =>
      c.jobs.map((j) => ({
        ...j,
        source: c.id,
        company: companyName(c),
        dueAt: j.dueAt || (j.deadline?.includes('T') ? j.deadline : undefined),
        deadline: j.deadline?.slice(0, 10),
      })),
    ),
  ];
}
export const outsideFinance = (job) =>
  !!job.source && job.source !== 'own' && job.status !== 'delivered';
const workflowLabels = {
  briefing: 'A iniciar',
  production: 'Trabalhando',
  review: 'Aguardando aprovação',
  rejected: 'Solicitada revisão',
  delivered: 'Aprovada',
  adjustment: 'Acerto financeiro',
};
const workflowKey = (j) =>
  j.kind === 'adjustment' ? 'adjustment' : j.sourceStatus === 'rejected' ? 'rejected' : j.status;
export const companyStatus = (j) =>
  j.source === 'own' ? statuses[j.status] || j.status : workflowLabels[workflowKey(j)] || j.status;

export function monthlyForecast(jobs, rate, now = today()) {
  const month = now.slice(0, 7);
  const [year, index] = month.split('-').map(Number);
  const days = new Date(year, index, 0).getDate();
  let elapsed = 0;
  let remaining = 0;
  for (let day = 1; day <= days; day++) {
    const weekday = new Date(year, index - 1, day).getDay();
    if (weekday === 0 || weekday === 6) continue;
    if (day <= Number(now.slice(8))) elapsed++;
    else remaining++;
  }
  const produced = jobs.filter((job) => {
    const deliveredAt = job.statusHistory?.findLast((entry) => entry.status === 'delivered')?.at;
    const day = (job.completedAt || deliveredAt || job.created || '').slice(0, 10);
    return (
      job.kind !== 'adjustment' && job.status === 'delivered' && day.startsWith(month) && day <= now
    );
  });
  const accrued = integrationTotals(produced, rate).total;
  const daily = elapsed ? accrued / elapsed : 0;
  return {
    accrued,
    daily,
    remaining,
    projected: accrued + daily * remaining,
    count: produced.length,
  };
}

export function renderForecast(data) {
  const f = monthlyForecast(combinedJobs(data), data.rate);
  return `<section class="panel forecast"><div><h2>Previsão até o fim do mês</h2><p>${f.count ? 'A estimativa soma o valor das entregas e aprovações do mês à média diária multiplicada pelos dias úteis restantes.' : 'A estimativa começa quando houver uma entrega ou aprovação neste mês.'}</p></div><div class="forecast-metrics"><span>Estimativa<strong>${f.count ? brl(f.projected) : '—'}</strong></span><span>Gerado no mês<strong>${brl(f.accrued)}</strong></span><span>Média por dia útil<strong>${f.count ? brl(f.daily) : '—'}</strong></span><span>Dias úteis restantes<strong>${f.remaining}</strong></span></div></section>`;
}
export function integrationTotals(jobs, rate) {
  const result = { total: 0, received: 0, pending: 0, projected: 0, count: 0 };
  for (const j of jobs) {
    if (outsideFinance(j)) continue;
    const factor = (j.currency || 'USD') === 'USD' ? rate : 1;
    result.total += Math.round(j.value * factor * 100);
    result.received += Math.round(j.received * factor * 100);
    if (j.status !== 'delivered') result.projected += Math.round(j.value * factor * 100);
    if (j.kind !== 'adjustment') result.count++;
  }
  result.pending = result.total - result.received;
  for (const k of ['total', 'received', 'pending', 'projected']) result[k] /= 100;
  return result;
}
export function paymentState(job) {
  if (outsideFinance(job)) return 'in_progress';
  if (['paid', 'pending', 'partial'].includes(job.paymentStatus)) return job.paymentStatus;
  return job.paid || (job.value > 0 && job.received >= job.value)
    ? 'paid'
    : job.received > 0
      ? 'partial'
      : 'pending';
}
const sourceName = (j) =>
  j.source === 'own'
    ? 'Meus trabalhos'
    : j.company || (j.source === 'workview' ? 'Sharps' : 'oHero');
export const referenceMonth = (j) =>
  j.referenceMonth || (j.completedAt || j.created || '').slice(0, 7);
const jobDate = (j) => (j.completedAt || j.created || '').slice(0, 10);
export function jobsInPeriod(jobs, selected = today().slice(0, 7)) {
  return selected === 'all' ? jobs : jobs.filter((j) => referenceMonth(j) === selected);
}
const brl = (n) => money(n, 'BRL');
const option = (v, label, selected) =>
  `<option value="${esc(v)}" ${selected === v ? 'selected' : ''}>${esc(label)}</option>`;
const monthLabel = (month) =>
  new Date(month + '-01T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
function periodOptions(jobs, selected) {
  const current = today().slice(0, 7);
  const months = [
    ...new Set([
      current,
      ...(selected === 'all' ? [] : [selected]),
      ...jobs.map(referenceMonth).filter(Boolean),
    ]),
  ]
    .sort()
    .reverse();
  return (
    months
      .map((m) => option(m, (m === current ? 'Este mês · ' : '') + monthLabel(m), selected))
      .join('') + option('all', 'Todo o período · acumulado', selected)
  );
}
function paymentBadge(j) {
  if (outsideFinance(j))
    return `<span class="integration-payment is-workflow">${esc(companyStatus(j))}</span>`;
  const paid = paymentState(j) === 'paid';
  return `<span class="integration-payment ${paid ? 'is-paid' : 'is-pending'}">${icon(paid ? 'check' : 'finance')}${paid ? 'Recebido' : 'A receber'}</span>`;
}
function financeCards(t, selected) {
  return `<div class="earnings-metrics"><div class="earnings-primary"><span class="earnings-label">${selected === 'all' ? 'Total acumulado' : 'Ganho total do mês'}</span><strong class="statvalue">${brl(t.total)}</strong><span class="earnings-caption">Recebido + a receber · ${t.count} thumbnails</span></div><div class="earnings-secondary"><span class="earnings-label"><i class="payment-dot paid-dot"></i>Recebido</span><strong class="statvalue">${brl(t.received)}</strong><span class="earnings-caption">Pagamentos confirmados</span></div><div class="earnings-secondary"><span class="earnings-label"><i class="payment-dot pending-dot"></i>A receber</span><strong class="statvalue">${brl(t.pending)}</strong><span class="earnings-caption">Pagamentos pendentes</span></div></div>`;
}
export function renderIntegrationSummary(data, selected = today().slice(0, 7)) {
  if (!state.companies.length) return '';
  const all = combinedJobs(data),
    jobs = jobsInPeriod(all, selected),
    t = integrationTotals(jobs, data.rate);
  return `<section class="panel earnings-overview" aria-label="Resumo dos ganhos"><div class="earnings-header"><div><span class="eyebrow">MEUS TRABALHOS + EMPRESAS</span><h2>${selected === 'all' ? 'Seus ganhos, desde o início' : 'Seus ganhos em ' + esc(monthLabel(selected))}</h2></div><label class="earnings-period">Período<select data-month aria-label="Período dos ganhos">${periodOptions(all, selected)}</select></label></div>${financeCards(t, selected)}<div class="earnings-footer"><div class="earnings-sources">${[
    { id: 'own', name: 'Meus trabalhos' },
    ...state.companies,
  ]
    .map(
      (c) =>
        `<span>${esc(companyName(c))}<b>${brl(
          integrationTotals(
            jobs.filter((j) => j.source === c.id),
            data.rate,
          ).total,
        )}</b></span>`,
    )
    .join(
      '',
    )}</div><button class="textbutton" data-page="companies">Ver detalhes ${icon('arrow')}</button></div><p class="earnings-note">${t.projected ? `Inclui ${brl(t.projected)} de trabalhos em andamento. ` : ''}Valores em reais; trabalhos em USD usam a cotação atual.${state.companies.some((c) => c.error) ? ' Há uma empresa com dados desatualizados.' : ''}</p></section>`;
}
function renderJob(j) {
  const partial = paymentState(j) === 'partial';
  return `<article class="integration-job">${j.thumbnail ? `<img src="${esc(j.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="integration-thumb-placeholder">${icon('jobs')}</span>`}<div class="integration-job-info"><strong>${esc(j.title)}</strong><small>${esc(sourceName(j))} <span>·</span> ${esc(j.client)}</small><small>${esc(companyStatus(j))} <span>·</span> ${esc(monthLabel(referenceMonth(j)))}</small></div><div class="integration-job-amount"><strong>${money(j.value, j.currency || 'USD')}</strong>${partial ? `<small>${money(j.received, j.currency || 'USD')} já recebido</small>` : ''}</div><div class="integration-job-payment">${paymentBadge(j)}${partial ? `<small>Falta ${money(j.value - j.received, j.currency || 'USD')}</small>` : ''}</div></article>`;
}
export function renderIntegrations(data) {
  const all = combinedJobs(data);
  const jobs = jobsInPeriod(all, period).filter(
    (j) =>
      (source === 'all' || j.source === source) &&
      (status === 'all' || workflowKey(j) === status) &&
      (!dateFrom || jobDate(j) >= dateFrom) &&
      (!dateTo || jobDate(j) <= dateTo) &&
      (payment === 'all' ||
        (payment === 'paid'
          ? paymentState(j) === 'paid'
          : ['pending', 'partial'].includes(paymentState(j)))) &&
      (!search ||
        `${j.title} ${j.client}`
          .toLocaleLowerCase('pt-BR')
          .includes(search.toLocaleLowerCase('pt-BR'))),
  );
  const t = integrationTotals(jobs, data.rate);
  const sorted = jobs
    .slice()
    .sort(
      (a, b) =>
        Number(outsideFinance(b)) - Number(outsideFinance(a)) ||
        jobDate(b).localeCompare(jobDate(a)),
    );
  return `<div class="companies-page"><div class="heading"><div><span class="eyebrow">SEU ESTÚDIO, CONECTADO</span><h1>Trabalhos e empresas</h1><p class="subtitle">Seus ganhos do mês, com cada origem no lugar certo.</p></div><button class="secondary" id="companies-sync" ${busy ? 'disabled' : ''}>${busy ? 'Atualizando…' : 'Atualizar portais'}</button></div>${error ? `<div class="notice" role="status">${esc(error)}</div>` : ''}${!loaded ? '<p role="status">Carregando conexões…</p>' : ''}
  <section class="panel integration-panel integration-filter-panel"><div class="integration-filters"><label>Empresa<select id="companies-source">${option('all', 'Todas as origens', source)}${option('own', 'Só meus trabalhos', source)}${state.companies.map((c) => option(c.id, companyName(c), source)).join('')}</select></label><label>Período<select id="companies-period">${periodOptions(all, period)}</select></label><label>Status<select id="companies-status">${option('all', 'Todos', status)}${Object.entries(
    workflowLabels,
  )
    .map(([key, label]) =>
      option(key, key === 'delivered' ? 'Aprovada ou entregue' : label, status),
    )
    .join(
      '',
    )}</select></label><label>De<input id="companies-from" type="date" value="${esc(dateFrom)}" max="${esc(dateTo)}"></label><label>Até<input id="companies-to" type="date" value="${esc(dateTo)}" min="${esc(dateFrom)}"></label><label>Pagamento<select id="companies-payment">${option('all', 'Todos', payment)}${option('paid', 'Recebido', payment)}${option('pending', 'A receber', payment)}</select></label><label>Buscar<input id="companies-search" type="search" placeholder="Thumb ou cliente" value="${esc(search)}"></label></div><p class="earnings-note">O intervalo usa a data de conclusão ou, quando ainda pendente, a data de criação.</p></section>
  <section class="panel earnings-overview">${financeCards(t, period)}<p class="earnings-note">${period === 'all' ? 'Histórico completo.' : 'Valores do mês selecionado.'} Total inclui recebido e a receber${t.projected ? `, com ${brl(t.projected)} em andamento` : ''}. USD convertido pela cotação atual.</p></section>
  <section class="integration-origins" aria-label="Ganhos por origem">${[
    { id: 'own', name: 'Meus trabalhos' },
    ...state.companies,
  ]
    .filter((c) => source === 'all' || c.id === source)
    .map((c) => {
      const s = integrationTotals(
        jobs.filter((j) => j.source === c.id),
        data.rate,
      );
      return `<article class="panel integration-origin"><div class="origin-heading"><span class="origin-icon">${icon(c.id === 'own' ? 'jobs' : 'clients')}</span><h2>${esc(companyName(c))}</h2><span>${s.count} thumbs</span></div><strong class="origin-total">${brl(s.total)}</strong><div class="origin-split"><span>Recebido<b>${brl(s.received)}</b></span><span>A receber<b>${brl(s.pending)}</b></span></div>${c.id !== 'own' ? `<small class="origin-sync">${c.error ? 'Atualização pendente' : 'Atualizado'}${c.lastSync ? ' · ' + esc(new Date(c.lastSync).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) : ''}</small>${c.error ? `<p class="notice" role="status">${esc(c.error)}</p>` : ''}` : '<small class="origin-sync">Seus registros no estúdio</small>'}</article>`;
    })
    .join('')}</section>
  <section class="panel integration-jobs-panel"><div class="integration-section-heading"><div><h2>Thumbnails</h2><p>${jobs.filter((j) => j.kind !== 'adjustment').length} trabalhos no período selecionado</p></div><span class="badge">${payment === 'paid' ? 'Recebido' : payment === 'pending' ? 'A receber' : 'Todos os pagamentos'}</span></div><div class="integration-list">${sorted.slice(0, visibleCount).map(renderJob).join('') || '<div class="empty"><strong>Nenhuma thumb neste filtro</strong>Escolha outra origem ou outro mês.</div>'}</div>${sorted.length > visibleCount ? `<div class="integration-list-footer"><span>${visibleCount} de ${sorted.length} registros</span><button class="secondary" id="companies-more">Mostrar mais</button></div>` : ''}<p class="integration-list-note">O pagamento acompanha o portal de cada empresa. Altere os dados da empresa no site de origem.</p></section>
  <details class="panel integration-connections"><summary>Conexões das empresas <span>${state.companies.length} conectadas</span></summary><div class="integration-panel"><p>Conecte seu link da Sharps ou do oHero. Os links ficam protegidos no servidor local. A cópia é atualizada enquanto o app estiver aberto.</p>${!state.ready && loaded ? '<div class="notice">Configure a chave de criptografia do servidor antes de conectar.</div>' : ''}<form id="company-connect"><label>Nome da empresa<input name="name" maxlength="80" placeholder="Nome para exibir"></label><label>Link privado do portal<input name="link" type="password" autocomplete="off" required placeholder="Cole o link recebido da empresa"></label><button class="primary" ${busy || !state.ready ? 'disabled' : ''}>Conectar e importar</button></form>${state.companies.map((c) => `<div class="connection-row"><span>${esc(companyName(c))}</span><button class="textbutton danger" data-company-disconnect="${c.id}" ${busy ? 'disabled' : ''}>Desconectar</button></div>`).join('')}<p class="earnings-note">Se você cadastrou uma thumb manualmente e também no portal, confira o lançamento para não contar em dobro. Falhas de atualização preservam a última cópia.</p></div></details></div>`;
}

async function refresh(force = false) {
  if (busy || !apiRef) return;
  busy = true;
  error = '';
  lastLoad = Date.now();
  if (force) renderRef();
  try {
    state = await (
      await apiRef(
        force ? 'integrations/sync' : 'integrations',
        force ? { method: 'POST', timeoutMs: 90000 } : { timeoutMs: 90000 },
      )
    ).json();
    loaded = true;
  } catch (e) {
    error = e.message;
    loaded = true;
  } finally {
    busy = false;
    if (!editing()) renderRef();
  }
}
export function bindIntegrations(api, render, toast) {
  apiRef = api;
  renderRef = render;
  if (Date.now() - lastLoad > 60000 && !busy && !editing()) void refresh();
  const bindSelect = (id, setter) => {
    const el = document.getElementById(id);
    if (el)
      el.onchange = () => {
        setter(el.value);
        visibleCount = 60;
        render();
      };
  };
  bindSelect('companies-source', (v) => (source = v));
  bindSelect('companies-period', (v) => {
    period = v;
    dateFrom = dateTo = '';
  });
  bindSelect('companies-payment', (v) => (payment = v));
  bindSelect('companies-status', (v) => (status = v));
  bindSelect('companies-from', (v) => {
    dateFrom = v;
    period = 'all';
  });
  bindSelect('companies-to', (v) => {
    dateTo = v;
    period = 'all';
  });
  const more = document.getElementById('companies-more');
  if (more)
    more.onclick = () => {
      visibleCount += 60;
      render();
    };
  const searchInput = document.getElementById('companies-search');
  if (searchInput)
    searchInput.onchange = () => {
      search = searchInput.value;
      visibleCount = 60;
      render();
    };
  const sync = document.getElementById('companies-sync');
  if (sync) sync.onclick = () => void refresh(true);
  const form = document.getElementById('company-connect');
  if (form)
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (busy) return;
      const body = JSON.stringify(Object.fromEntries(new FormData(form)));
      form.reset();
      busy = true;
      render();
      try {
        state = await (
          await api('integrations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            timeoutMs: 90000,
          })
        ).json();
        loaded = true;
        error = '';
        toast('Empresa conectada. Thumbnails importadas.');
      } catch (e) {
        error = e.message;
      } finally {
        busy = false;
        render();
      }
    };
  document.querySelectorAll('[data-company-disconnect]').forEach(
    (el) =>
      (el.onclick = async () => {
        if (
          busy ||
          !confirm(
            'Desconectar esta empresa e remover a cópia importada? Os dados do portal continuam salvos lá.',
          )
        )
          return;
        busy = true;
        try {
          state = await (
            await api('integrations/' + el.dataset.companyDisconnect, { method: 'DELETE' })
          ).json();
          source = 'all';
          error = '';
        } catch (e) {
          error = e.message;
        } finally {
          busy = false;
          render();
        }
      }),
  );
}
// Refresh authenticated data only; the existing workspace and its revision stay independent.
export function pollIntegrations() {
  if (Date.now() - lastLoad > 60000) void refresh();
}
