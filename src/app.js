import { labels, statuses, icon, esc, money, date, initials, duration } from './ui.js';
import { connect, queue, syncState, login, retry, reloadServer, api } from './sync.js';
import { getFile, putFiles, removeFiles, toDataURL } from './storage.js';
import {
  today,
  totals,
  validate,
  migrate,
  elapsed,
  toggleTimer,
  safeURL,
  clientPrice,
} from './model.js';
// Workspace state and local recovery
const KEY = 'thumbs-studio-v1';
const blank = () => ({ clients: [], jobs: [], rate: 5.2 });
let data = blank(),
  corrupt = false;
try {
  const saved = localStorage.getItem(KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    if (!validate(parsed)) throw Error();
    data = migrate(parsed);
  }
} catch {
  corrupt = true;
}
let theme = localStorage.getItem('thumbs-theme') || 'dark';
let rateBusy = false,
  rateError = false;
let installPrompt = null;
const locked = () => ['loading', 'locked', 'conflict'].includes(syncState.status);
let page = 'dashboard',
  filter = 'all',
  query = '',
  clientFilter = '',
  month = 'all';
const client = (id) => data.clients.find((c) => c.id === id);
// Shared workspace components
function avatar(c) {
  return /* HTML */ `<span class="avatar" style="background:${c.color}20;color:${c.color}"
    >${esc(initials(c.name))}</span
  >`;
}
function toast(message) {
  const el = document.querySelector('#toast');
  el.textContent = message;
  el.style.display = 'block';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.style.display = 'none'), 3500);
}
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    corrupt = false;
    queue(data);
    return true;
  } catch {
    toast('Não foi possível salvar. Exporte um backup antes de fechar.');
    return false;
  }
}
function navigate(next) {
  page = next;
  filter = 'all';
  query = '';
  clientFilter = '';
  month = 'all';
  render();
}
function selectedJobs() {
  return data.jobs.filter(
    (j) =>
      (!clientFilter || j.clientId === clientFilter) &&
      (month === 'all' || j.created.slice(0, 7) === month),
  );
}
// Page rendering
function render() {
  document.documentElement.dataset.theme = theme;
  const pending = data.jobs.filter((j) => !j.paid).length;
  document.querySelector('#app').innerHTML = /* HTML */ `<div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brandmark">▧</span>
        <div>thumbs<span style="color:#a7d394">.</span><small>STUDIO MANAGER</small></div>
      </div>
      <div class="navlabel">SEU WORKSPACE</div>
      <nav class="nav" aria-label="Navegação principal">
        ${Object.entries(labels)
          .map(
            ([key, label]) =>
              /* HTML */ `<button
                data-page="${key}"
                class="${page === key ? 'active' : ''}"
                ${page === key ? 'aria-current="page"' : ''}
              >
                ${icon(key)}${label}${key === 'jobs' && data.jobs.length ? /* HTML */ `<span class="count">${data.jobs.length}</span>` : ''}${key === 'finance' && pending ? /* HTML */ `<span class="count">${pending}</span>` : ''}
              </button>`,
          )
          .join('')}
      </nav>
      <div class="sidebottom">
        <div class="localbadge">
          <strong>● Seu estúdio, organizado.</strong>Mais tempo criando.<br />Menos tempo em
          planilhas.
        </div>
        <div class="profile">
          <span class="avatar">EU</span>
          <div><strong>Meu workspace</strong><small>Thumbnail designer</small></div>
        </div>
      </div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="breadcrumb">
          Workspace <span style="margin-left:14px">/</span><strong>${labels[page]}</strong>
        </div>
        <div class="topright">
          <span class="date"
            >${new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}</span
          ><button class="theme-toggle" data-action="theme" aria-label="Alternar tema">
            ${theme === 'dark' ? '☀ Claro' : '☾ Escuro'}</button
          ><span class="online" title="${esc(syncState.message)}"
            >●
            ${syncState.status === 'saved' ? 'No banco' : syncState.status === 'saving' ? 'Salvando…' : 'Local'}</span
          >
        </div>
      </header>
      <div class="content">
        ${corrupt ? '<div class="notice">O backup salvo não pôde ser lido. Ele foi preservado no navegador. Importe um backup válido em Configurações antes de cadastrar novos dados.</div>' : ''}${syncBanner()}
        <div ${locked() ? 'inert' : ''}>${rateStrip()}${activeTimer()}${content()}</div>
        <footer class="pagefooter">
          <span>Feito para quem transforma ideias em cliques.</span
          ><span>Thumbs Studio · Seu espaço criativo</span>
        </footer>
      </div>
    </main>
  </div>`;
  bind();
  bindExtras();
  bindCloud();
  updateClocks();
}
// Page sections and views
function heading(title, subtitle, action = true) {
  return /* HTML */ `<div class="heading">
    <div>
      <h1>${title}</h1>
      <p class="subtitle">${subtitle}</p>
    </div>
    ${
      action
        ? /* HTML */ `<button
            class="primary"
            data-action="${action === 'client' ? 'new-client' : 'new-job'}"
          >
            ${icon('plus')} ${action === 'client' ? 'Novo cliente' : 'Nova thumbnail'}
          </button>`
        : ''
    }
  </div>`;
}
function stats(jobs = data.jobs) {
  const t = totals(jobs),
    brl = totals(jobs, 'BRL');
  return /* HTML */ `<div class="stats">
    <div class="stat">
      <div class="statlabel">Ganhos recebidos ${icon('finance')}</div>
      <div class="statvalue">${money(t.received)}</div>
      <div class="native-brl">+ ${money(brl.received, 'BRL')}</div>
      <div class="statfoot">
        ≈ ${money(t.received * data.rate + brl.received, 'BRL')} <b>em reais</b>
      </div>
    </div>
    <div class="stat">
      <div class="statlabel">A receber ${icon('arrow')}</div>
      <div class="statvalue">${money(t.pending)}</div>
      <div class="native-brl">+ ${money(brl.pending, 'BRL')}</div>
      <div class="statfoot">
        ${jobs.filter((j) => !j.paid).length} trabalhos aguardando pagamento
      </div>
    </div>
    <div class="stat">
      <div class="statlabel">Thumbnails entregues ${icon('jobs')}</div>
      <div class="statvalue">
        ${String(jobs.filter((j) => j.status === 'delivered').length).padStart(2, '0')}
      </div>
      <div class="statfoot">
        ${jobs.filter((j) => j.status !== 'delivered').length} em andamento
      </div>
    </div>
    <div class="stat">
      <div class="statlabel">Clientes cadastrados ${icon('clients')}</div>
      <div class="statvalue">${String(data.clients.length).padStart(2, '0')}</div>
      <div class="statfoot">Relacionamentos que geram resultados</div>
    </div>
  </div>`;
}
function chart() {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return {
      label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
      value: data.jobs
        .filter((j) => j.paid && j.paidAt?.startsWith(key))
        .reduce((sum, j) => sum + j.value * ((j.currency || 'USD') === 'USD' ? data.rate : 1), 0),
    };
  });
  const max = Math.max(100, ...months.map((m) => m.value));
  return /* HTML */ `<section class="panel">
    <div class="panelhead">
      <div>
        <h2>Evolução dos ganhos</h2>
        <p>Pagamentos recebidos nos últimos 6 meses</p>
      </div>
      <span class="badge">BRL estimado</span>
    </div>
    <div
      class="chart"
      role="img"
      aria-label="${months.map((m) => `${m.label}: ${money(m.value, 'BRL')}`).join('; ')}"
    >
      <div class="chartaxis">
        <span>${Math.ceil(max)}</span><span>${Math.ceil(max / 2)}</span><span>0</span>
      </div>
      ${months
        .map(
          (m) =>
            /* HTML */ `<div class="barwrap" title="${m.label}: ${money(m.value, 'BRL')}">
              <div class="bar" style="height:${(m.value / max) * 100}%"></div>
              <span>${m.label}</span>
            </div>`,
        )
        .join('')}
    </div>
    <div class="chartlegend">
      <span><i class="dot"></i>Recebido · equivalente em reais</span
      ><span>Referência: US$ 1 = ${money(data.rate, 'BRL')}</span>
    </div>
  </section>`;
}
function dueList(full = false) {
  const list = data.jobs
    .filter((j) => j.status !== 'delivered')
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  return /* HTML */ `<section class="panel">
    <div class="panelhead">
      <div>
        <h2>${full ? 'Agenda de entregas' : 'Próximas entregas'}</h2>
        <p>${list.length} thumbnails em andamento</p>
      </div>
      ${!full ? '<button class="textbutton" data-page="deadlines">Ver todas ↗</button>' : ''}
    </div>
    ${
      list
        .slice(0, full ? undefined : 3)
        .map(
          (j) =>
            /* HTML */ `<div class="deadlineitem">
              <div class="datebox">
                <b>${j.deadline.slice(8)}</b>${date(j.deadline).split(' ').slice(1).join(' ')}
              </div>
              <div class="deadlinecopy">
                <strong>${esc(j.title)}</strong><small>${esc(client(j.clientId).name)}</small>
              </div>
              <span class="badge ${j.deadline < today() ? 'late' : j.status}"
                >${j.deadline < today() ? 'Atrasada' : j.deadline === today() ? 'Hoje' : statuses[j.status]}</span
              ><button class="iconbtn" data-edit="${esc(j.id)}" aria-label="Editar ${esc(j.title)}">
                ${icon('edit')}
              </button>
            </div>`,
        )
        .join('') ||
      '<div class="empty"><strong>Sua agenda está livre</strong>Cadastre uma thumbnail com prazo de entrega.</div>'
    }
  </section>`;
}
function table() {
  let jobs = selectedJobs()
    .filter(
      (j) =>
        (filter === 'all' || (filter === 'pending' && !j.paid) || filter === j.status) &&
        `${j.title} ${client(j.clientId).name}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => b.created.localeCompare(a.created));
  if (page === 'finance') jobs = jobs.sort((a, b) => Number(a.paid) - Number(b.paid));
  return /* HTML */ `<section class="panel">
    <div class="panelhead">
      <div>
        <h2>
          ${page === 'finance' ? 'Controle de pagamentos' : page === 'dashboard' ? 'Seus trabalhos' : 'Histórico de thumbnails'}
        </h2>
        <p>Cada criação, cada entrega, tudo em um lugar.</p>
      </div>
      <button class="textbutton" data-action="export-csv">Exportar CSV ↗</button>
    </div>
    <div class="tabletools">
      <div class="tabs">
        ${[
          ['all', 'Todos'],
          ['production', 'Em produção'],
          ['delivered', 'Entregues'],
          ['pending', 'A receber'],
        ]
          .map(
            ([key, label]) =>
              /* HTML */ `<button data-filter="${key}" class="${filter === key ? 'active' : ''}">
                ${label}
              </button>`,
          )
          .join('')}
      </div>
      <label class="search"
        >${icon('search')}<input
          id="search"
          type="search"
          placeholder="Buscar trabalho ou cliente"
          aria-label="Buscar trabalho ou cliente"
          value="${esc(query)}"
      /></label>
    </div>
    ${
      page !== 'dashboard'
        ? /* HTML */ `<div class="tabletools">
            <label class="field" style="margin:0"
              ><select id="client-filter" aria-label="Filtrar por cliente">
                <option value="">Todos os clientes</option>
                ${data.clients.map((c) => /* HTML */ `<option value="${esc(c.id)}" ${clientFilter === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
              </select></label
            ><label class="field" style="margin:0"
              ><select id="month-filter" aria-label="Filtrar por mês de criação">
                <option value="all">Todos os meses</option>
                ${[...new Set(data.jobs.map((j) => j.created.slice(0, 7)))]
                  .sort()
                  .reverse()
                  .map(
                    (m) =>
                      /* HTML */ `<option ${month === m ? 'selected' : ''} value="${m}">
                        ${m.slice(5)}/${m.slice(0, 4)}
                      </option>`,
                  )
                  .join('')}
              </select></label
            >
          </div>`
        : ''
    }
    <div class="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Thumbnail</th>
            <th>Cliente</th>
            <th>Prazo</th>
            <th>Valor</th>
            <th>Status</th>
            <th>Pagamento</th>
            <th>Tempo / anexos</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${jobs
            .map(
              (j) =>
                /* HTML */ `<tr>
                  <td>
                    <div class="workcell">
                      <span
                        class="thumb"
                        style="background:linear-gradient(135deg,${client(j.clientId).color},#192c2c)"
                        >${esc(initials(j.title))}</span
                      >
                      <div>
                        <strong>${esc(j.title)}</strong><small>Criada em ${date(j.created)}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div class="clientcell">
                      ${avatar(client(j.clientId))}${esc(client(j.clientId).name)}
                    </div>
                  </td>
                  <td>
                    <span
                      style="${j.deadline < today() && j.status !== 'delivered' ? 'color:#b56e68' : ''}"
                      >${date(j.deadline)}</span
                    >
                  </td>
                  <td><strong>${money(j.value, j.currency || 'USD')}</strong></td>
                  <td><span class="badge ${j.status}">● ${statuses[j.status]}</span></td>
                  <td>
                    <button
                      class="badge ${j.paid ? 'paid' : 'pending'}"
                      data-paid="${esc(j.id)}"
                      title="${j.paid ? 'Marcar como pendente' : 'Registrar recebimento hoje'}"
                    >
                      ${j.paid ? '✓ Recebido' : '◷ A receber'}
                    </button>
                  </td>
                  <td>
                    <div class="jobtools">
                      <button
                        class="timerbutton ${j.timerStartedAt ? 'running' : ''}"
                        data-timer="${esc(j.id)}"
                        aria-label="${j.timerStartedAt ? 'Pausar' : 'Iniciar'} cronômetro de ${esc(j.title)}"
                      >
                        ${j.timerStartedAt ? 'Ⅱ' : '▷'}
                        <span data-clock="${esc(j.id)}">${duration(elapsed(j))}</span></button
                      ><button class="textbutton" data-assets="${esc(j.id)}">
                        ↗ ${(j.files || []).length + (j.links || []).length} anexos
                      </button>
                    </div>
                  </td>
                  <td>
                    <div class="rowactions">
                      <button
                        class="iconbtn"
                        data-edit="${esc(j.id)}"
                        aria-label="Editar ${esc(j.title)}"
                      >
                        ${icon('edit')}</button
                      ><button
                        class="iconbtn"
                        data-delete="${esc(j.id)}"
                        aria-label="Excluir ${esc(j.title)}"
                      >
                        ${icon('trash')}
                      </button>
                    </div>
                  </td>
                </tr>`,
            )
            .join('')}
        </tbody>
      </table>
      ${!jobs.length ? /* HTML */ `<div class="empty"><strong>${data.jobs.length ? 'Nenhum trabalho encontrado' : 'Seu próximo grande trabalho começa aqui'}</strong>${data.jobs.length ? 'Ajuste a busca ou os filtros.' : 'Adicione seus clientes e cadastre sua primeira thumbnail.'}</div>` : ''}
    </div>
    <div class="tablefooter">
      <span>${jobs.length} trabalhos ${filter !== 'all' ? 'neste filtro' : 'no histórico'}</span
      ><span>Total: ${money(totals(jobs).total)} + ${money(totals(jobs, 'BRL').total, 'BRL')}</span>
    </div>
  </section>`;
}
function content() {
  if (page === 'dashboard')
    return (
      heading('Seu estúdio em um olhar', 'Acompanhe suas criações. Cuide dos seus resultados.') +
      stats() +
      /* HTML */ `<div class="middle">${chart()}${dueList()}</div>` +
      table()
    );
  if (page === 'jobs')
    return heading('Suas thumbnails', 'Do primeiro briefing ao último pagamento.') + table();
  if (page === 'deadlines')
    return (
      heading('Cada entrega no seu tempo', 'Organize as prioridades e mantenha os prazos em dia.') +
      dueList(true)
    );
  if (page === 'finance')
    return (
      heading(
        'Seu trabalho tem valor',
        'Acompanhe recebimentos e saiba exatamente o que falta receber.',
      ) +
      stats(selectedJobs()) +
      table()
    );
  if (page === 'clients')
    return /* HTML */ `${heading('Boas parcerias, grandes criações', 'Todos os seus clientes e trabalhos conectados.', 'client')}
      <div class="clientgrid">
        ${data.clients
          .map((c) => {
            const jobs = data.jobs.filter((j) => j.clientId === c.id),
              t = totals(jobs);
            return /* HTML */ `<article class="panel clientcard">
              ${avatar(c)}
              <h2>${esc(c.name)}</h2>
              <p style="margin:8px 0;color:var(--accent)">
                ${
                  c.defaultValue == null
                    ? 'Valor padrão não definido'
                    : `Valor padrão: ${money(c.defaultValue, c.defaultCurrency || 'USD')}`
                }
              </p>
              <p>
                ${esc(c.email) || 'Sem e-mail'}<br /><span class="contactline"
                  >${esc(c.contact || 'Sem outro contato')}</span
                >
              </p>
              <div class="clientmetrics">
                <span>Trabalhos<b>${jobs.length}</b></span
                ><span
                  >A receber<b>${money(t.pending)}</b
                  ><small>+ ${money(totals(jobs, 'BRL').pending, 'BRL')}</small></span
                >
              </div>
              <div class="cardactions">
                <button class="secondary" data-client-jobs="${esc(c.id)}">Ver trabalhos</button
                ><button class="textbutton" data-client-edit="${esc(c.id)}">Editar</button
                ><button
                  class="textbutton danger"
                  data-client-delete="${esc(c.id)}"
                  aria-label="Excluir cliente ${esc(c.name)}"
                >
                  Excluir
                </button>
              </div>
            </article>`;
          })
          .join('')}
      </div>
      ${!data.clients.length ? '<div class="panel empty"><strong>Vamos conhecer seus clientes?</strong>Cadastre o primeiro cliente para começar a organizar seus trabalhos.</div>' : ''}`;
  return (
    heading('Do seu jeito', 'Ajustes do workspace e segurança dos seus dados.', false) +
    /* HTML */ `<section class="panel settings">
      <h2>Conversão automática USD → BRL</h2>
      <p>
        <a href="https://frankfurter.dev" target="_blank" rel="noopener noreferrer"
          >Fonte: Frankfurter</a
        >
        · Cotação de referência, sem tarifas de recebimento.
      </p>
      <button class="secondary" data-action="refresh-rate" ${rateBusy ? 'disabled' : ''}>
        ${rateBusy ? 'Atualizando…' : 'Atualizar agora'}
      </button>
      <p>
        A cotação de referência é buscada ao abrir o app e a cada 30 minutos enquanto ele estiver
        aberto. Em caso de falha, mantemos a última cotação salva. Você também pode informar uma
        cotação manual. Trabalhos em reais e dólares mantêm seus valores originais.
      </p>
      <form id="rate-form" style="padding:0">
        <div class="field">
          <label for="rate">Quanto vale US$ 1 em reais?</label
          ><input
            id="rate"
            name="rate"
            type="number"
            min="0.01"
            max="10000"
            step="0.0001"
            value="${data.rate}"
            required
          />
        </div>
        <button class="primary">Salvar cotação</button>
      </form>
      <hr style="border:0;border-top:1px solid #edf0eb;margin:28px 0" />
      <h2>Seu app, em qualquer lugar</h2>
      <p>
        Instale pelo menu do navegador: “Instalar aplicativo” no Chrome/Edge ou “Adicionar à Tela de
        Início” no Safari. No computador e no celular, use o mesmo endereço e a mesma senha para
        acessar seus dados.
      </p>
      <button class="secondary" data-action="install">Instalar aplicativo</button>
      <hr style="border:0;border-top:1px solid var(--line);margin:28px 0" />
      <h2>Armazenamento do banco</h2>
      <p>Até 200 MB de arquivos neste app. Use links para materiais maiores.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="secondary" data-action="storage-info">Ver espaço usado</button
        ><button class="secondary" data-action="storage-cleanup">Limpar envios abandonados</button>
      </div>
      <hr style="border:0;border-top:1px solid var(--line);margin:28px 0" />
      <h2>Backup do seu estúdio</h2>
      <p>
        Os dados e arquivos são sincronizados com o banco. Uma cópia local permite continuar
        trabalhando sem conexão; aguarde “Salvo no banco” antes de trocar de dispositivo. Exporte
        backups regularmente. O backup inclui os arquivos anexados. Importar um backup substitui os
        dados atuais.
      </p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="secondary" data-action="backup">Exportar backup</button
        ><button class="secondary" data-action="import">Importar backup</button
        ><button class="secondary" data-action="demo">Carregar exemplo</button>
      </div>
      <input type="file" id="import-file" accept=".json,application/json" hidden />
      <p>O exemplo está disponível apenas quando não há clientes ou trabalhos cadastrados.</p>
    </section>`
  );
}
// Client and thumbnail forms
function openForm(type, id) {
  if (locked()) return;
  if (corrupt) {
    toast('Importe um backup válido antes de alterar dados.');
    return;
  }
  if (type === 'job' && !data.clients.length) {
    toast('Cadastre primeiro um cliente.');
    openForm('client');
    return;
  }
  const item = (type === 'job' ? data.jobs : data.clients).find((x) => x.id === id);
  const selectedClientId = item?.clientId || clientFilter || data.clients[0]?.id;
  const initialPrice = clientPrice(client(selectedClientId), type === 'job' ? item : undefined);
  const modal = document.querySelector('#modal');
  modal.innerHTML = /* HTML */ `<div class="modalhead">
      <h2>
        ${item ? 'Editar' : type === 'job' ? 'Nova' : 'Novo'}
        ${type === 'job' ? 'thumbnail' : 'cliente'}
      </h2>
      <button data-close aria-label="Fechar">✕</button>
    </div>
    <form id="edit-form">
      ${
        type === 'job'
          ? /* HTML */ `<div class="field">
                <label for="title">Nome do trabalho</label
                ><input
                  id="title"
                  name="title"
                  maxlength="160"
                  value="${esc(item?.title || '')}"
                  placeholder="Ex.: O futuro da inteligência artificial"
                  required
                />
              </div>
              <div class="field">
                <label for="clientId">Cliente</label
                ><select id="clientId" name="clientId">
                  ${data.clients.map((c) => /* HTML */ `<option value="${esc(c.id)}" ${selectedClientId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label for="currency">Moeda definida para o cliente</label
                ><select id="currency" name="currency" disabled>
                  <option value="USD" ${initialPrice.currency === 'USD' ? 'selected' : ''}>
                    USD · Dólar americano
                  </option>
                  <option value="BRL" ${initialPrice.currency === 'BRL' ? 'selected' : ''}>
                    BRL · Real brasileiro
                  </option>
                </select>
              </div>
              <div class="formrow">
                <div class="field">
                  <label for="value">Preço aplicado automaticamente</label
                  ><input
                    id="value"
                    name="value"
                    type="number"
                    min="0"
                    max="10000000"
                    step="0.01"
                    value="${initialPrice.value}"
                    readonly
                    required
                  />
                </div>
                <div class="field">
                  <label for="deadline">Prazo de entrega</label
                  ><input
                    id="deadline"
                    name="deadline"
                    type="date"
                    value="${item?.deadline || today()}"
                    required
                  />
                </div>
              </div>
              <p id="client-price-note" class="subtitle" style="margin-bottom:12px">
                ${
                  initialPrice.value === ''
                    ? 'Este cliente ainda precisa de um preço padrão. Defina-o em Clientes → Editar uma única vez.'
                    : 'Preço do cliente aplicado. Não é necessário preencher novamente.'
                }
              </p>
              <button
                class="textbutton"
                id="edit-job-price"
                type="button"
                style="margin-bottom:16px;margin-right:12px"
              >
                Alterar só este trabalho
              </button>
              <button
                class="textbutton"
                id="use-client-price"
                type="button"
                style="margin-bottom:16px"
              >
                Restaurar preço do cliente
              </button>
              <div class="formrow">
                <div class="field">
                  <label for="status">Etapa do trabalho</label
                  ><select name="status" id="status">
                    ${Object.entries(statuses)
                      .map(
                        ([key, v]) =>
                          /* HTML */ `<option
                            value="${key}"
                            ${item?.status === key ? 'selected' : ''}
                          >
                            ${v}
                          </option>`,
                      )
                      .join('')}
                  </select>
                </div>
                <div class="field">
                  <label for="created">Data do trabalho</label
                  ><input
                    id="created"
                    name="created"
                    type="date"
                    value="${item?.created || today()}"
                    required
                  />
                </div>
              </div>
              <div class="field">
                <label for="notes">Observações / briefing</label
                ><textarea id="notes" name="notes" rows="3" maxlength="5000">
${esc(item?.notes || '')}</textarea>
              </div>
              <label class="check"
                ><input name="paid" id="paid" type="checkbox" ${item?.paid ? 'checked' : ''} />
                Pagamento recebido</label
              >
              <div class="field" style="margin-top:14px">
                <label for="paidAt">Data do recebimento (se pago)</label
                ><input id="paidAt" name="paidAt" type="date" value="${item?.paidAt || today()}" />
              </div>`
          : /* HTML */ `<div class="field">
                <label for="name">Nome do cliente ou canal</label
                ><input
                  id="name"
                  name="name"
                  maxlength="100"
                  value="${esc(item?.name || '')}"
                  required
                />
              </div>
              <div class="field">
                <label for="email">E-mail de contato (opcional)</label
                ><input
                  id="email"
                  name="email"
                  type="email"
                  maxlength="200"
                  value="${esc(item?.email || '')}"
                />
              </div>
              <div class="field">
                <label for="contact">WhatsApp, Discord ou outro contato</label
                ><input
                  id="contact"
                  name="contact"
                  maxlength="250"
                  value="${esc(item?.contact || '')}"
                  placeholder="Ex.: +55 11 99999-9999 ou @usuario"
                />
              </div>
              <div class="field">
                <label for="defaultValue">Preço deste cliente por thumbnail</label>
                <input
                  id="defaultValue"
                  name="defaultValue"
                  type="number"
                  min="0"
                  max="10000000"
                  step="0.01"
                  value="${item?.defaultValue ?? ''}"
                  placeholder="Ex.: 50,00"
                  required
                />
                <small class="subtitle"
                  >Defina uma vez. Todas as novas thumbnails deste cliente usarão este preço.</small
                >
              </div>
              <div class="field">
                <label for="defaultCurrency">Moeda do valor padrão</label>
                <select id="defaultCurrency" name="defaultCurrency">
                  <option
                    value="USD"
                    ${(item?.defaultCurrency || 'USD') === 'USD' ? 'selected' : ''}
                  >
                    USD · Dólar americano
                  </option>
                  <option value="BRL" ${item?.defaultCurrency === 'BRL' ? 'selected' : ''}>
                    BRL · Real brasileiro
                  </option>
                </select>
              </div>
              <div class="field">
                <label for="color">Cor do cliente</label
                ><input id="color" name="color" type="color" value="${item?.color || '#538579'}" />
              </div>`
      }
      <div class="formactions">
        <button class="secondary" type="button" data-close>Cancelar</button
        ><button class="primary">Salvar ${type === 'job' ? 'thumbnail' : 'cliente'}</button>
      </div>
    </form>`;
  modal.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => modal.close()));
  if (type === 'job') {
    const applyClientPrice = () => {
      const price = clientPrice(client(modal.querySelector('#clientId').value));
      modal.querySelector('#value').value = price.value;
      modal.querySelector('#currency').value = price.currency;
      modal.querySelector('#value').readOnly = true;
      modal.querySelector('#currency').disabled = true;
      modal.querySelector('#client-price-note').textContent =
        price.value === ''
          ? 'Defina o preço deste cliente em Clientes → Editar uma única vez.'
          : 'Preço do cliente aplicado. Não é necessário preencher novamente.';
    };
    // Opening an existing job keeps its price; choosing another client uses that client's price.
    modal.querySelector('#clientId').onchange = applyClientPrice;
    modal.querySelector('#use-client-price').onclick = applyClientPrice;
    modal.querySelector('#edit-job-price').onclick = () => {
      modal.querySelector('#value').readOnly = false;
      modal.querySelector('#currency').disabled = false;
      modal.querySelector('#value').focus();
      modal.querySelector('#client-price-note').textContent =
        'Exceção apenas para este trabalho. O preço padrão do cliente será mantido.';
    };
  }
  modal.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const value = Object.fromEntries(f);
    Object.keys(value).forEach((k) => (value[k] = value[k].trim()));
    if (type === 'job') {
      if (value.value === '') {
        toast('Defina primeiro o preço padrão deste cliente em Clientes → Editar.');
        return;
      }
      value.currency = modal.querySelector('#currency').value;
      value.elapsedMs = item?.elapsedMs || 0;
      value.timerStartedAt = item?.timerStartedAt || null;
      value.links = item?.links || [];
      value.files = item?.files || [];
      value.value = Number(value.value);
      value.paid = f.has('paid');
      if (value.paid && !value.paidAt) {
        toast('Informe a data do recebimento.');
        return;
      }
      if (!value.paid) value.paidAt = null;
    } else {
      if (!value.name) return;
      if (value.defaultValue === '') {
        toast('Informe o preço padrão deste cliente. Ele será usado nas novas thumbnails.');
        return;
      }
      value.defaultValue = Number(value.defaultValue);
    }
    value.id = item?.id || crypto.randomUUID();
    const collection = type === 'job' ? data.jobs : data.clients;
    const previous = structuredClone(data);
    if (item) collection[collection.indexOf(item)] = value;
    else collection.push(value);
    if (!validate(data)) {
      data = previous;
      toast('Revise os campos antes de salvar.');
      return;
    }
    if (!persist()) {
      data = previous;
      return;
    }
    modal.close();
    render();
    toast('Salvo no seu workspace.');
  };
  modal.showModal();
}
// Downloads and browser integration
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// Cloud status, authentication and installation
function syncBanner() {
  const state = syncState.status;
  if (state === 'saved')
    return /* HTML */ `<div class="sync-banner saved">
      <span>✓ Salvo no banco · disponível ao reabrir o app</span
      ><button data-action="install">Instalar app ↗</button>
    </div>`;
  if (state === 'locked')
    return /* HTML */ `<section class="cloud-login">
      <span class="eyebrow">SEU ESTÚDIO PRIVADO</span>
      <h2>Acesse seu workspace</h2>
      <p>Use sua senha para acessar o estúdio. Ela fica somente nesta sessão do navegador.</p>
      <form id="cloud-login">
        <label for="access-key">Senha</label>
        <div>
          <input
            id="access-key"
            type="password"
            minlength="6"
            required
            autocomplete="current-password"
            placeholder="Digite sua senha"
          /><button class="primary">Entrar</button>
        </div>
      </form>
      <small>Seus registros permanecem salvos no banco mesmo quando você fecha o aplicativo.</small>
    </section>`;
  if (state === 'conflict')
    return /* HTML */ `<div class="sync-banner warning">
      <span>${esc(syncState.message)}</span>
      <div>
        <button data-action="backup">Exportar cópia local</button
        ><button id="reload-cloud">Carregar banco</button>
      </div>
    </div>`;
  return /* HTML */ `<div class="sync-banner ${state === 'offline' ? 'warning' : ''}">
    <span
      >${esc(syncState.message)}${state === 'offline' ? ' · alterações aguardam envio' : ''}</span
    >${state === 'offline' ? '<button id="retry-cloud">Tentar novamente</button>' : ''}
  </div>`;
}
function bindCloud() {
  const form = document.querySelector('#cloud-login');
  if (form)
    form.onsubmit = async (event) => {
      event.preventDefault();
      const button = form.querySelector('button');
      button.disabled = true;
      try {
        await login(form.querySelector('input').value);
        if (syncState.status === 'saved') refreshRate();
      } catch (error) {
        toast(error.message);
        button.disabled = false;
      }
    };
  const retryButton = document.querySelector('#retry-cloud');
  if (retryButton) retryButton.onclick = () => retry().catch((error) => toast(error.message));
  const reload = document.querySelector('#reload-cloud');
  if (reload)
    reload.onclick = () => {
      if (
        confirm(
          'As alterações locais não enviadas serão substituídas. Exporte uma cópia antes de continuar. Carregar os dados do banco?',
        )
      )
        reloadServer().catch((error) => toast(error.message));
    };
}
async function installApp() {
  if (installPrompt) {
    await installPrompt.prompt();
    installPrompt = null;
  } else
    toast('No menu do navegador, escolha “Instalar aplicativo” ou “Adicionar à Tela de Início”.');
}
// Exchange rate and active work session
function rateStrip() {
  return /* HTML */ `<div class="workspace-strip">
    <span
      ><i class="live-dot"></i> USD / BRL <strong>${money(data.rate, 'BRL')}</strong
      ><small
        >${rateBusy ? 'Atualizando…' : rateError ? 'Sem conexão · última cotação salva' : data.rateSource === 'manual' ? 'Cotação manual' : data.rateDate ? `Referência: ${date(data.rateDate)}` : 'Estimativa inicial · aguardando atualização'}</small
      ></span
    ><button
      data-action="refresh-rate"
      ${rateBusy ? 'disabled' : ''}
      aria-label="Atualizar cotação"
    >
      ↻ Atualizar
    </button>
  </div>`;
}
function activeTimer() {
  const job = data.jobs.find((j) => j.timerStartedAt);
  return job
    ? /* HTML */ `<section class="focus-banner">
        <div>
          <span class="eyebrow">EM FOCO AGORA</span><strong>${esc(job.title)}</strong
          ><small>${esc(client(job.clientId).name)}</small>
        </div>
        <span class="focus-clock" data-clock="${esc(job.id)}">${duration(elapsed(job))}</span
        ><button class="secondary" data-timer="${esc(job.id)}">Ⅱ Pausar</button>
      </section>`
    : '';
}
function updateClocks() {
  document.querySelectorAll('[data-clock]').forEach((el) => {
    const job = data.jobs.find((j) => j.id === el.dataset.clock);
    if (job) el.textContent = duration(elapsed(job));
  });
}
async function refreshRate(manual = false) {
  if (rateBusy || corrupt || locked()) return;
  rateBusy = true;
  render();
  try {
    const response = await fetch('https://api.frankfurter.dev/v2/rate/USD/BRL', {
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw Error();
    const quote = await response.json();
    if (
      quote.base !== 'USD' ||
      quote.quote !== 'BRL' ||
      !Number.isFinite(quote.rate) ||
      quote.rate <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(quote.date)
    )
      throw Error();
    const changed =
      data.rate !== quote.rate || data.rateDate !== quote.date || data.rateSource !== 'Frankfurter';
    data.rate = quote.rate;
    data.rateDate = quote.date;
    data.rateSource = 'Frankfurter';
    if (changed) {
      data.rateUpdatedAt = new Date().toISOString();
      persist();
    }
    rateError = false;
    if (manual) toast('Cotação de referência atualizada.');
  } catch {
    rateError = true;
    if (manual) toast('Não foi possível consultar a cotação. Mantivemos o último valor salvo.');
  } finally {
    rateBusy = false;
    render();
  }
}
function bindExtras() {
  document.querySelectorAll('[data-timer]').forEach(
    (b) =>
      (b.onclick = () => {
        if (corrupt) return;
        const previous = structuredClone(data);
        toggleTimer(data.jobs, b.dataset.timer);
        if (!persist()) data = previous;
        render();
      }),
  );
  document
    .querySelectorAll('[data-assets]')
    .forEach((b) => (b.onclick = () => openAssets(b.dataset.assets)));
}
// Thumbnail files and reference links
function openAssets(id) {
  const job = data.jobs.find((j) => j.id === id);
  if (!job || corrupt) return;
  const modal = document.querySelector('#modal');
  modal.innerHTML = /* HTML */ `<div class="modalhead">
      <div>
        <h2>Arquivos e links</h2>
        <p class="subtitle">${esc(job.title)}</p>
      </div>
      <button id="close-assets" aria-label="Fechar">✕</button>
    </div>
    <div class="assets-body">
      <div class="section-label">ARQUIVOS DO TRABALHO</div>
      <label class="upload-area" for="attachments"
        ><span>＋</span><strong>Adicionar arquivos</strong
        ><small>Imagens, PSD, ZIP e outros · até 20 MB por arquivo</small
        ><input type="file" id="attachments" multiple
      /></label>
      <div id="asset-files"></div>
      <div class="section-label" style="margin-top:24px">LINKS E REFERÊNCIAS</div>
      <form id="link-form" class="link-form">
        <input
          type="url"
          id="new-link"
          required
          placeholder="https://drive.google.com/…"
          aria-label="Link do trabalho"
        /><button class="primary">Adicionar</button>
      </form>
      <div id="asset-links"></div>
      <p class="asset-note">
        Os arquivos são enviados ao banco. Aguarde o indicador “Salvo no banco” antes de fechar.
        Limite total: 200 MB. Mantenha também um backup.
      </p>
    </div>`;
  modal.querySelector('#close-assets').onclick = () => modal.close();
  const draw = () => {
    modal.querySelector('#asset-files').innerHTML =
      (job.files || [])
        .map(
          (f) =>
            /* HTML */ `<div class="asset-row">
              <span class="file-symbol">▧</span>
              <div>
                <strong>${esc(f.name)}</strong
                ><small>${(f.size / 1024 / 1024).toFixed(2)} MB</small>
              </div>
              <button class="textbutton" data-download="${esc(f.id)}">Baixar</button
              ><button
                class="iconbtn"
                data-remove-file="${esc(f.id)}"
                aria-label="Remover ${esc(f.name)}"
              >
                ${icon('trash')}
              </button>
            </div>`,
        )
        .join('') || '<p class="asset-note">Nenhum arquivo anexado.</p>';
    modal.querySelector('#asset-links').innerHTML = (job.links || [])
      .map(
        (url, i) =>
          /* HTML */ `<div class="asset-row">
            <a href="${esc(safeURL(url))}" target="_blank" rel="noopener noreferrer"
              >↗ ${esc(url)}</a
            ><button class="iconbtn" data-remove-link="${i}" aria-label="Remover link">
              ${icon('trash')}
            </button>
          </div>`,
      )
      .join('');
    modal.querySelectorAll('[data-download]').forEach(
      (b) =>
        (b.onclick = async () => {
          try {
            const f = job.files.find((f) => f.id === b.dataset.download);
            const blob = await getFile(f.id);
            if (!blob) throw Error();
            download(f.name, blob, 'application/octet-stream');
          } catch {
            toast('Arquivo indisponível. Restaure um backup que inclua os anexos.');
          }
        }),
    );
    modal.querySelectorAll('[data-remove-file]').forEach(
      (b) =>
        (b.onclick = async () => {
          const previous = job.files;
          job.files = job.files.filter((f) => f.id !== b.dataset.removeFile);
          if (!persist()) {
            job.files = previous;
            return;
          }
          await removeFiles([b.dataset.removeFile]).catch(() => {});
          draw();
          render();
        }),
    );
    modal.querySelectorAll('[data-remove-link]').forEach(
      (b) =>
        (b.onclick = () => {
          const previous = [...job.links];
          job.links.splice(Number(b.dataset.removeLink), 1);
          if (!persist()) {
            job.links = previous;
            return;
          }
          draw();
          render();
        }),
    );
  };
  modal.querySelector('#attachments').onchange = async (e) => {
    const input = e.target;
    const files = [...input.files];
    if (!files.length) return;
    if (files.some((f) => f.size > 20 * 1024 * 1024)) {
      toast('Cada arquivo pode ter no máximo 20 MB.');
      input.value = '';
      return;
    }
    input.disabled = true;
    const metadata = files.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      size: f.size,
      type: f.type,
    }));
    try {
      await putFiles(files.map((f, i) => [metadata[i].id, f]));
      const previous = job.files || [];
      job.files = [...previous, ...metadata];
      if (!persist()) {
        job.files = previous;
        await removeFiles(metadata.map((f) => f.id));
        return;
      }
      draw();
      render();
      toast('Arquivos salvos.');
    } catch {
      toast('Não foi possível salvar os arquivos. Verifique o espaço disponível no navegador.');
    } finally {
      input.disabled = false;
      input.value = '';
    }
  };
  modal.querySelector('#link-form').onsubmit = (e) => {
    e.preventDefault();
    const input = modal.querySelector('#new-link');
    const url = safeURL(input.value.trim());
    if (!url) {
      toast('Use um link com http:// ou https://.');
      return;
    }
    if ((job.links || []).includes(url)) {
      toast('Este link já está anexado.');
      return;
    }
    const previous = job.links || [];
    job.links = [...previous, url];
    if (!persist()) {
      job.links = previous;
      return;
    }
    input.value = '';
    draw();
    render();
  };
  draw();
  modal.showModal();
}
// Backup export and restore
async function exportBackup() {
  try {
    toast('Preparando backup com os arquivos…');
    const snapshot = structuredClone(data);
    snapshot.exportedAt = Date.now();
    snapshot.jobs.forEach((j) => {
      j.elapsedMs = elapsed(j, snapshot.exportedAt);
      j.timerStartedAt = null;
    });
    const attachments = [];
    for (const job of snapshot.jobs) {
      for (const f of job.files || []) {
        const blob = await getFile(f.id);
        if (!blob) throw Error(`Arquivo ausente: ${f.name}`);
        attachments.push({ id: f.id, data: await toDataURL(blob) });
      }
    }
    download(
      `thumbs-backup-${today()}.json`,
      JSON.stringify({ ...snapshot, attachments }),
      'application/json',
    );
    toast('Backup exportado com todos os anexos.');
  } catch {
    toast('Não foi possível exportar todos os anexos. Verifique o armazenamento local.');
  }
}
async function importBackup(e) {
  const f = e.target.files[0];
  if (!f) return;
  try {
    if (f.size > 300 * 1024 * 1024) throw Error();
    const parsed = JSON.parse(await f.text());
    if (!validate(parsed)) throw Error();
    const entries = [];
    const files = parsed.jobs.flatMap((j) => j.files || []);
    const attachments = parsed.attachments || [];
    if (!Array.isArray(attachments)) throw Error();
    // Fresh IDs keep current files intact until the new metadata is successfully saved.
    for (const file of files) {
      const entry = attachments.find((a) => a.id === file.id);
      if (
        !entry ||
        typeof entry.data !== 'string' ||
        !/^data:[^,]*;base64,[A-Za-z0-9+/=]*$/.test(entry.data)
      )
        throw Error();
      const blob = await (await fetch(entry.data)).blob();
      if (blob.size !== file.size || blob.size > 20 * 1024 * 1024) throw Error();
      const id = crypto.randomUUID();
      file.id = id;
      entries.push([id, blob]);
    }
    if (!confirm('Substituir todos os dados atuais pelos dados e arquivos deste backup?')) return;
    await putFiles(entries);
    const previous = data;
    data = migrate(parsed);
    delete data.attachments;
    // Restore running timers paused: a backup must not count hours since its export.
    data.jobs.forEach((j) => {
      if (j.timerStartedAt) {
        j.elapsedMs = elapsed(j, parsed.exportedAt || j.timerStartedAt);
        j.timerStartedAt = null;
      }
    });
    if (!persist()) {
      data = previous;
      await removeFiles(entries.map(([id]) => id));
      return;
    }
    await removeFiles(previous.jobs.flatMap((j) => (j.files || []).map((f) => f.id))).catch(
      () => {},
    );
    render();
    toast('Backup e arquivos importados.');
  } catch {
    toast('Backup inválido ou sem os anexos necessários. Os dados atuais foram preservados.');
  } finally {
    e.target.value = '';
  }
}
// Page events and user actions
function bind() {
  document
    .querySelectorAll('[data-page]')
    .forEach((b) => (b.onclick = () => navigate(b.dataset.page)));
  document
    .querySelectorAll('[data-action]')
    .forEach((b) => (b.onclick = () => action(b.dataset.action)));
  document
    .querySelectorAll('[data-edit]')
    .forEach((b) => (b.onclick = () => openForm('job', b.dataset.edit)));
  document
    .querySelectorAll('[data-client-edit]')
    .forEach((b) => (b.onclick = () => openForm('client', b.dataset.clientEdit)));
  document.querySelectorAll('[data-client-jobs]').forEach(
    (b) =>
      (b.onclick = () => {
        page = 'jobs';
        clientFilter = b.dataset.clientJobs;
        filter = 'all';
        query = '';
        render();
      }),
  );
  document.querySelectorAll('[data-filter]').forEach(
    (b) =>
      (b.onclick = () => {
        filter = b.dataset.filter;
        render();
      }),
  );
  document.querySelectorAll('[data-paid]').forEach(
    (b) =>
      (b.onclick = () => {
        if (corrupt) return;
        const j = data.jobs.find((x) => x.id === b.dataset.paid);
        j.paid = !j.paid;
        j.paidAt = j.paid ? today() : null;
        persist();
        render();
        toast(j.paid ? 'Recebimento registrado.' : 'Pagamento marcado como pendente.');
      }),
  );
  document.querySelectorAll('[data-delete]').forEach(
    (b) =>
      (b.onclick = () => {
        if (confirm('Excluir este trabalho? Esta ação não pode ser desfeita.')) {
          const previous = structuredClone(data);
          const removed = data.jobs.find((j) => j.id === b.dataset.delete);
          data.jobs = data.jobs.filter((j) => j.id !== b.dataset.delete);
          if (!persist()) {
            data = previous;
            return;
          }
          removeFiles((removed.files || []).map((f) => f.id)).catch(() => {});
          render();
        }
      }),
  );
  document.querySelectorAll('[data-client-delete]').forEach(
    (b) =>
      (b.onclick = () => {
        if (data.jobs.some((j) => j.clientId === b.dataset.clientDelete)) {
          toast('Este cliente tem trabalhos. Exclua ou transfira os trabalhos primeiro.');
          return;
        }
        if (confirm('Excluir este cliente?')) {
          data.clients = data.clients.filter((c) => c.id !== b.dataset.clientDelete);
          persist();
          render();
        }
      }),
  );
  const search = document.querySelector('#search');
  if (search)
    search.oninput = (e) => {
      const pos = e.target.selectionStart;
      query = e.target.value;
      render();
      const input = document.querySelector('#search');
      input.focus();
      try {
        input.setSelectionRange(pos, pos);
      } catch {}
    };
  const cf = document.querySelector('#client-filter');
  if (cf)
    cf.onchange = (e) => {
      clientFilter = e.target.value;
      render();
    };
  const mf = document.querySelector('#month-filter');
  if (mf)
    mf.onchange = (e) => {
      month = e.target.value;
      render();
    };
  const rate = document.querySelector('#rate-form');
  if (rate)
    rate.onsubmit = (e) => {
      e.preventDefault();
      if (corrupt) return;
      data.rate = Number(new FormData(e.target).get('rate'));
      data.rateSource = 'manual';
      data.rateUpdatedAt = new Date().toISOString();
      persist();
      render();
      toast('Cotação atualizada.');
    };
  const file = document.querySelector('#import-file');
  if (file) file.onchange = importBackup;
}
function action(name) {
  if (name === 'storage-info')
    api('storage')
      .then((r) => r.json())
      .then((s) =>
        toast(
          `${(s.used / 1048576).toFixed(1)} MB usados de ${(s.limit / 1048576).toFixed(0)} MB.`,
        ),
      )
      .catch((e) => toast(e.message));
  if (
    name === 'storage-cleanup' &&
    confirm('Remover arquivos não vinculados a trabalhos e enviados há mais de 24 horas?')
  )
    api('storage/cleanup', { method: 'POST' })
      .then((r) => r.json())
      .then((s) => toast(`${s.removed} arquivos sem vínculo removidos.`))
      .catch((e) => toast(e.message));
  if (name === 'install') installApp();
  if (name === 'theme') {
    theme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('thumbs-theme', theme);
    render();
  }
  if (name === 'refresh-rate') refreshRate(true);
  if (name === 'new-job') openForm('job');
  if (name === 'new-client') openForm('client');
  if (name === 'backup') exportBackup();
  if (name === 'import') document.querySelector('#import-file').click();
  if (name === 'export-csv') {
    const cell = (v) =>
      '"' +
      String(v)
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const rows = [
      [
        'Trabalho',
        'Cliente',
        'Valor',
        'Moeda',
        'Tempo (horas)',
        'Etapa',
        'Prazo',
        'Pago',
        'Recebido em',
        'Observações',
      ],
      ...selectedJobs().map((j) => [
        j.title,
        client(j.clientId).name,
        j.value,
        j.currency || 'USD',
        (elapsed(j) / 3600000).toFixed(2),
        statuses[j.status],
        j.deadline,
        j.paid ? 'Sim' : 'Não',
        j.paidAt || '',
        j.notes,
      ]),
    ];
    download(
      `thumbs-${today()}.csv`,
      '\ufeff' + rows.map((r) => r.map(cell).join(';')).join('\r\n'),
      'text/csv;charset=utf-8',
    );
  }
  if (name === 'demo') {
    if (corrupt || data.clients.length || data.jobs.length) {
      toast('O exemplo só pode ser carregado em um workspace vazio.');
      return;
    }
    data.clients = [
      { id: 'c1', name: 'Alex Morgan', email: 'alex@example.com', color: '#6d84a7' },
      { id: 'c2', name: 'Canal Horizonte', email: 'contato@example.com', color: '#b18455' },
      { id: 'c3', name: 'Studio Nova', email: 'studio@example.com', color: '#8a72a5' },
    ];
    const now = new Date();
    const day = (offset) => {
      const d = new Date(now);
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    data.jobs = Array.from({ length: 9 }, (_, i) => ({
      id: crypto.randomUUID(),
      title: [
        'O futuro da inteligência artificial',
        'Viaje além do óbvio',
        'O setup dos sonhos',
        'Como criar sua primeira marca',
        '7 ideias que mudam tudo',
        'Por dentro do processo criativo',
        'A próxima grande descoberta',
        'Um novo olhar sobre o mundo',
        'Criando sem limites',
      ][i],
      clientId: `c${(i % 3) + 1}`,
      value: [85, 65, 120, 90, 75, 100, 60, 85, 110][i],
      status: i < 3 ? ['production', 'review', 'briefing'][i] : 'delivered',
      deadline: day(i < 3 ? i + 1 : -i * 12),
      created: day(-i * 16),
      paid: i > 3,
      paidAt: i > 3 ? day(-i * 15) : null,
      notes: 'Trabalho fictício para demonstração.',
    }));
    data = migrate(data);
    persist();
    navigate('dashboard');
    toast('Exemplo carregado. Estes dados são fictícios.');
  }
}

// Application startup

render();
connect(
  data,
  (remote) => {
    data = migrate(remote);
    localStorage.setItem(KEY, JSON.stringify(data));
    corrupt = false;
    render();
  },
  () => render(),
).then(() => {
  if (syncState.status === 'saved') refreshRate();
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
});
setInterval(updateClocks, 1000);
setInterval(() => refreshRate(), 30 * 60 * 1000);
window.addEventListener('online', () => {
  retry().catch(() => {});
  refreshRate();
});
window.addEventListener('beforeunload', (event) => {
  if (syncState.status === 'saving') {
    event.preventDefault();
    event.returnValue = '';
  }
});
