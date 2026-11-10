import { esc, money, initials, statuses, duration } from './ui.js';
import {
  deadlineState,
  dueTimestamp,
  elapsed,
  priceBreakdown,
  totals,
  workflowState,
} from './model.js';

export function statusControl(job) {
  return /* HTML */ `<select
    class="status-control ${job.status}"
    data-status="${esc(job.id)}"
    aria-label="Status de ${esc(job.title)}"
  >
    ${Object.entries(statuses)
      .map(
        ([key, label]) =>
          /* HTML */ `<option value="${key}" ${job.status === key ? 'selected' : ''}>
            ${label}
          </option>`,
      )
      .join('')}
  </select>`;
}

export function dueBadge(job) {
  const state = deadlineState(job);
  return /* HTML */ `<span
    class="due-pill"
    data-due="${esc(job.id)}"
    data-tone="${state.tone}"
    title="${esc(new Date(dueTimestamp(job)).toLocaleString('pt-BR'))}"
    >◷ ${state.label}</span
  >`;
}

export function renderHero(jobs) {
  const active = jobs.filter((j) => j.status !== 'delivered');
  const late = active.filter((j) => deadlineState(j).tone === 'late').length;
  const soon = active.filter((j) => deadlineState(j).tone === 'urgent').length;
  const complete = jobs.filter((j) => j.status === 'delivered').length;
  const percent = jobs.length ? Math.round((complete / jobs.length) * 100) : 0;
  return /* HTML */ `<section class="studio-hero">
    <div>
      <span class="eyebrow">SEU ESPAÇO PARA CRIAR</span>
      <h2>Menos gestão.<br />Mais criação<span>.</span></h2>
      <p>Seu estúdio em movimento, do briefing ao pagamento.</p>
      <div class="hero-actions">
        <button class="primary" data-action="new-job">＋ Criar thumbnail <kbd>N</kbd></button
        ><button class="hero-link" data-page="jobs">Abrir meu quadro ↗</button>
      </div>
    </div>
    <div class="hero-dashboard">
      <div class="hero-progress">
        <span>ENTREGAS CONCLUÍDAS</span><strong>${percent}<small>%</small></strong>
        <div class="progress-track"><i style="width:${percent}%"></i></div>
        <small>${complete} de ${jobs.length} trabalhos entregues</small>
      </div>
      <div class="hero-counters">
        <button data-focus="late"><strong>${late}</strong><span>atrasadas ↗</span></button
        ><button data-focus="soon"><strong>${soon}</strong><span>nas próximas 24h ↗</span></button
        ><button data-page="jobs">
          <strong>${active.length}</strong><span>em andamento ↗</span>
        </button>
      </div>
    </div>
  </section>`;
}

export function viewSwitcher(view) {
  return /* HTML */ `<div class="work-viewbar">
    <div>
      <span class="eyebrow">SEU FLUXO CRIATIVO</span>
      <p>Arraste um cartão ou use o seletor para mudar a etapa.</p>
    </div>
    <div class="view-switch" role="group" aria-label="Visualização de trabalhos">
      <button data-view="board" class="${view === 'board' ? 'active' : ''}">▥ Quadro</button
      ><button data-view="list" class="${view === 'list' ? 'active' : ''}">☷ Lista</button>
    </div>
  </div>`;
}
export function renderPaymentSummary(jobs) {
  const waiting = jobs.filter((job) => job.status === 'delivered' && !job.paid);
  const usd = totals(waiting, 'USD').pending,
    brl = totals(waiting, 'BRL').pending;
  return /* HTML */ `<button class="payment-summary" data-focus="awaiting">
    <span class="payment-summary-icon">↗</span
    ><span
      ><strong>Aguardando pagamento</strong
      ><small
        >${waiting.length} ${waiting.length === 1 ? 'thumb entregue' : 'thumbs entregues'} ·
        atualizado automaticamente ao entregar ou receber</small
      ></span
    ><span class="payment-summary-value"
      ><b>${money(usd, 'USD')}</b><small>+ ${money(brl, 'BRL')}</small></span
    ><span aria-hidden="true">→</span>
  </button>`;
}

export function renderBoard(jobs, clients, options) {
  const filters = [
    ['all', 'Todos'],
    ['late', 'Atrasadas'],
    ['soon', 'Próximas 24h'],
    ['high', 'Prioridade'],
    ['pending', 'A receber'],
    ['awaiting', 'Entregues a receber'],
  ];
  return /* HTML */ `<section class="board-space">
    <div class="board-tools">
      <div class="tabs">
        ${filters.map(([value, label]) => /* HTML */ `<button data-filter="${value}" class="${options.filter === value ? 'active' : ''}">${label}</button>`).join('')}
      </div>
      <div class="board-search">
        <label class="search"
          ><input
            id="search"
            type="search"
            aria-label="Buscar trabalho ou cliente"
            placeholder="Buscar trabalho ou cliente…"
            value="${esc(options.query)}" /></label
        ><select id="client-filter" aria-label="Filtrar por cliente">
          <option value="">Todos os clientes</option>
          ${clients.map((c) => /* HTML */ `<option value="${esc(c.id)}" ${options.clientFilter === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="kanban">
      ${Object.entries(statuses)
        .map(([status, label]) => {
          const items = jobs
            .filter((j) => j.status === status)
            .sort(
              (a, b) =>
                Number(b.priority === 'high') - Number(a.priority === 'high') ||
                dueTimestamp(a) - dueTimestamp(b),
            );
          return /* HTML */ `<section
            class="kanban-column"
            data-drop-status="${status}"
            aria-label="${label}"
          >
            <header>
              <span class="column-dot ${status}"></span>
              <h2>${label}</h2>
              <span class="column-count">${items.length}</span>
            </header>
            <div class="kanban-stack">
              ${
                items
                  .map((job) => {
                    const client = clients.find((c) => c.id === job.clientId);
                    const price = priceBreakdown(job);
                    const automatic = workflowState(job);
                    return /* HTML */ `<article
                      class="job-card"
                      draggable="true"
                      data-drag-job="${esc(job.id)}"
                    >
                      <div class="job-card-top">
                        <span class="card-client"
                          ><i style="background:${client.color}">${esc(initials(client.name))}</i
                          >${esc(client.name)}</span
                        ><button
                          class="priority-button ${job.priority === 'high' ? 'selected' : ''}"
                          data-priority="${esc(job.id)}"
                          aria-label="${job.priority === 'high' ? 'Remover' : 'Marcar'} prioridade de ${esc(job.title)}"
                          title="Alternar prioridade"
                        >
                          ⚑
                        </button>
                      </div>
                      <button class="job-card-title" data-edit="${esc(job.id)}">
                        ${esc(job.title)}
                      </button>
                      <span
                        class="auto-state"
                        data-auto-state="${esc(job.id)}"
                        data-tone="${automatic.tone}"
                        >${automatic.label}</span
                      >
                      <div class="card-price">
                        <strong>${money(job.value, job.currency || 'USD')}</strong
                        >${price.extras ? /* HTML */ `<small>Inclui ${money(price.extras, job.currency || 'USD')} em adicionais</small>` : /* HTML */ `<small>Valor do trabalho</small>`}
                      </div>
                      <div class="card-deadline">
                        ${dueBadge(job)}<button
                          class="iconbtn"
                          data-postpone="${esc(job.id)}"
                          title="Adiar prazo em 24 horas"
                          aria-label="Adiar ${esc(job.title)} em 24 horas"
                        >
                          +24h
                        </button>
                      </div>
                      ${statusControl(job)}
                      <div class="card-bottom">
                        <button
                          class="timerbutton ${job.timerStartedAt ? 'running' : ''}"
                          data-timer="${esc(job.id)}"
                          aria-label="${job.timerStartedAt ? 'Pausar' : 'Iniciar'} cronômetro de ${esc(job.title)}"
                        >
                          ${job.timerStartedAt ? 'Ⅱ' : '▷'}
                          <span data-clock="${esc(job.id)}">${duration(elapsed(job))}</span></button
                        ><button class="textbutton" data-assets="${esc(job.id)}">
                          ↗ ${(job.files || []).length + (job.links || []).length}</button
                        ><button
                          class="badge ${job.paid ? 'paid' : 'pending'}"
                          data-paid="${esc(job.id)}"
                        >
                          ${job.paid ? '✓ Pago' : 'A receber'}
                        </button>
                      </div>
                      <div class="card-more">
                        <button data-duplicate="${esc(job.id)}">Duplicar</button
                        ><button data-copy-brief="${esc(job.id)}">Copiar briefing</button>
                      </div>
                    </article>`;
                  })
                  .join('') ||
                '<div class="column-empty"><span>＋</span><p>Nenhum trabalho nesta etapa</p><small>Solte um cartão aqui</small></div>'
              }
            </div>
          </section>`;
        })
        .join('')}
    </div>
    ${!jobs.length ? '<p class="board-empty-hint">Crie uma thumbnail ou ajuste os filtros para começar.</p>' : ''}
  </section>`;
}

export function renderActivity(jobs, clients) {
  const activity = jobs
    .flatMap((j) =>
      (j.statusHistory || []).map((h) => ({
        ...h,
        title: j.title,
        id: j.id,
        client: clients.find((c) => c.id === j.clientId)?.name,
      })),
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 4);
  if (!activity.length) return '';
  return /* HTML */ `<section class="panel activity-panel">
    <div class="panelhead">
      <div>
        <h2>O estúdio está em movimento</h2>
        <p>Últimas atualizações dos seus trabalhos</p>
      </div>
      <span class="badge">Atividade recente</span>
    </div>
    <div class="activity-grid">
      ${activity
        .map(
          (a) =>
            /* HTML */ `<button class="activity-item" data-edit="${esc(a.id)}">
              <span class="column-dot ${a.status}"></span>
              <div>
                <strong>${esc(a.title)}</strong
                ><small>${esc(a.client)} · ${statuses[a.status]}</small
                ><time
                  >${esc(new Date(a.at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))}</time
                >
              </div>
            </button>`,
        )
        .join('')}
    </div>
  </section>`;
}
