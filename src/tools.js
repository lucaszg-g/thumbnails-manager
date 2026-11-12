import { esc, money } from './ui.js';
import { today } from './model.js';
export const monthlyJobs = (jobs, month = today().slice(0, 7)) =>
  jobs.filter((j) => j.created.startsWith(month));
export function monthPicker(jobs, selected) {
  const months = [...new Set([today().slice(0, 7), ...jobs.map((j) => j.created.slice(0, 7))])]
    .sort()
    .reverse();
  return `<div class="month-picker"><label>Histórico mensal <select data-month><option value="all" ${selected === 'all' ? 'selected' : ''}>Todos os meses</option>${months.map((m) => `<option value="${m}" ${selected === m ? 'selected' : ''}>${m.slice(5)}/${m.slice(0, 4)} · ${monthlyJobs(jobs, m).length} thumbs</option>`).join('')}</select></label><p>Os trabalhos ficam preservados no mês de criação. Os contadores do mês começam do zero na virada; pendências continuam nos prazos.</p></div>`;
}
export function convertCase(text, mode, locale) {
  const lower = text.toLocaleLowerCase(locale),
    upper = text.toLocaleUpperCase(locale);
  if (mode === 'upper') return upper;
  if (mode === 'lower') return lower;
  if (mode === 'sentence')
    return lower.replace(
      /(^|[.!?。！？]\s*)(\p{L})/gu,
      (_, p, c) => p + c.toLocaleUpperCase(locale),
    );
  if (mode === 'first') return lower.replace(/\p{L}/u, (c) => c.toLocaleUpperCase(locale));
  if (mode === 'title')
    return [...new Intl.Segmenter(locale, { granularity: 'word' }).segment(lower)]
      .map((s) =>
        s.isWordLike ? s.segment.replace(/\p{L}/u, (c) => c.toLocaleUpperCase(locale)) : s.segment,
      )
      .join('');
  let i = 0;
  return [...text]
    .map((c) =>
      /\p{L}/u.test(c)
        ? (mode === 'random' ? Math.random() < 0.5 : i++ % 2 === 0)
          ? c.toLocaleUpperCase(locale)
          : c.toLocaleLowerCase(locale)
        : c,
    )
    .join('');
}
export function youtubeId(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const id =
      host === 'youtu.be'
        ? u.pathname.split('/')[1]
        : ['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)
          ? u.searchParams.get('v') ||
            (/^\/(shorts|embed|live)\//.test(u.pathname) ? u.pathname.split('/')[2] : '')
          : '';
    return /^[\w-]{11}$/.test(id || '') ? id : null;
  } catch {
    return null;
  }
}
let textDraft = '',
  textMode = 'upper',
  textLocale = '',
  referenceId = '';
const caseModes = {
  upper: 'MAIÚSCULAS',
  lower: 'minúsculas',
  first: 'Primeira letra',
  sentence: 'Frases',
  title: 'Cada Palavra',
  alternate: 'AlTeRnAdO',
  random: 'Aleatório',
};
let activeTool = 'text';
export function renderTools() {
  return `<div class="creative-tools">
 <div class="tool-navigation" role="group" aria-label="Escolher ferramenta">
 <button class="tool-nav-card" data-tool="text" aria-pressed="${activeTool === 'text'}"><span class="tool-symbol">Aa</span><span><strong>Estúdio de texto</strong><small>Transforme títulos em segundos</small></span><span class="tool-nav-arrow">↗</span></button>
 <button class="tool-nav-card" data-tool="reference" aria-pressed="${activeTool === 'reference'}"><span class="tool-symbol">▧</span><span><strong>Referências</strong><small>Do link direto para sua inspiração</small></span><span class="tool-nav-arrow">↗</span></button>
 </div>
 <section class="panel tool-workbench" data-tool-panel="text" ${activeTool !== 'text' ? 'hidden' : ''}>
 <div class="workbench-heading"><div><span class="eyebrow">TEXTO, NO SEU ESTILO</span><h2>Uma ideia. Muitas formas.</h2><p>Escreva, escolha o formato e copie. O resultado aparece na hora.</p></div><span class="tool-status"><i></i> Conversão instantânea</span></div>
 <div class="case-presets" role="group" aria-label="Formatos de texto">${Object.entries(caseModes)
   .map(
     ([v, l]) => `<button data-case-preset="${v}" aria-pressed="${v === textMode}">${l}</button>`,
   )
   .join('')}</div>
 <div class="case-options"><label>Formato <select id="case-mode">${Object.entries(caseModes)
   .map(([v, l]) => `<option value="${v}">${l}</option>`)
   .join(
     '',
   )}</select></label><label>Idioma <select id="case-locale"><option value="">Automático</option><option value="pt-BR">Português</option><option value="en">English</option><option value="tr">Türkçe</option><option value="el">Ελληνικά</option><option value="de">Deutsch</option></select></label></div>
 <div class="text-editors"><div class="text-editor"><div class="editor-label"><label for="case-input">Seu texto</label><button id="clear-case" class="textbutton">Limpar</button></div><textarea id="case-input" placeholder="Cole seu título ou escreva uma ideia aqui…" rows="8" spellcheck="false">${esc(textDraft)}</textarea><div class="editor-footer" id="case-count" aria-live="polite"></div></div>
 <div class="text-editor result-editor"><div class="editor-label"><label for="case-output">Resultado</label><span class="badge">Pronto para usar</span></div><textarea id="case-output" rows="8" placeholder="Seu texto transformado aparece aqui…" readonly></textarea><div class="editor-footer">Acentos, emojis e outros alfabetos preservados</div></div></div>
 <div class="workbench-footer"><p>Idiomas sem maiúsculas e minúsculas mantêm sua escrita original.</p><div><button class="secondary" id="reuse-case">Usar como entrada</button><button class="primary" id="copy-case">Copiar resultado ↗</button></div></div>
 </section>
 <section class="panel tool-workbench" data-tool-panel="reference" ${activeTool !== 'reference' ? 'hidden' : ''}>
 <div class="workbench-heading"><div><span class="eyebrow">SUA PRÓXIMA INSPIRAÇÃO</span><h2>Salve a referência. Crie sua versão.</h2><p>Recebeu um vídeo do cliente? Traga a thumbnail para o seu processo.</p></div><span class="badge">YouTube · Shorts · Lives</span></div>
 <form id="reference-form" class="reference-search"><label class="field">Link do vídeo<div class="reference-input-row"><input name="url" type="url" required placeholder="Cole aqui o link do YouTube" autocomplete="off"><button class="primary">Buscar referência ↗</button></div></label></form>
 <div id="reference-result" aria-live="polite"><div class="reference-empty"><span class="empty-reference-icon">▧</span><h3>Uma boa referência é um ótimo começo.</h3><p>Cole um link acima para visualizar e baixar a imagem.</p><div><span>01 Cole o link</span><span>02 Veja a imagem</span><span>03 Baixe em JPG</span></div></div></div>
 </section></div>`;
}
export function bindTools(api, toast) {
  const input = document.querySelector('#case-input');
  if (!input) return;
  const mode = document.querySelector('#case-mode'),
    locale = document.querySelector('#case-locale'),
    output = document.querySelector('#case-output');
  document.querySelectorAll('[data-tool]').forEach(
    (button) =>
      (button.onclick = () => {
        activeTool = button.dataset.tool;
        document
          .querySelectorAll('[data-tool]')
          .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === activeTool)));
        document
          .querySelectorAll('[data-tool-panel]')
          .forEach((panel) => (panel.hidden = panel.dataset.toolPanel !== activeTool));
      }),
  );
  mode.value = textMode;
  locale.value = textLocale;
  const update = () => {
    textDraft = input.value;
    textMode = mode.value;
    textLocale = locale.value;
    output.value = convertCase(textDraft, textMode, textLocale || undefined);
    document
      .querySelectorAll('[data-case-preset]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.casePreset === textMode)));
    document.querySelector('#copy-case').disabled = document.querySelector('#reuse-case').disabled =
      !output.value;
    document.querySelector('#case-count').textContent =
      `${[...new Intl.Segmenter().segment(textDraft)].length} caracteres`;
  };
  input.oninput = mode.onchange = locale.onchange = update;
  document.querySelectorAll('[data-case-preset]').forEach(
    (button) =>
      (button.onclick = () => {
        mode.value = button.dataset.casePreset;
        update();
      }),
  );
  document.querySelector('#reuse-case').onclick = () => {
    input.value = output.value;
    update();
    input.focus();
  };
  update();
  document.querySelector('#copy-case').onclick = async () => {
    try {
      await navigator.clipboard.writeText(output.value);
      toast('Texto copiado.');
    } catch {
      output.select();
      toast('Selecione e copie o resultado.');
    }
  };
  document.querySelector('#clear-case').onclick = () => {
    input.value = '';
    update();
  };
  const result = document.querySelector('#reference-result');
  const preview = (id) => {
    referenceId = id;
    result.innerHTML = `<div class="reference-ready"><div class="reference-image-wrap"><img class="reference-preview" src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="Thumbnail de referência"></div><div class="reference-details"><span class="eyebrow">REFERÊNCIA ENCONTRADA</span><h3>Sua inspiração, pronta para salvar.</h3><p>Baixe a maior resolução disponível em JPG e use como referência no seu próximo projeto.</p><button class="primary" id="download-reference">Baixar imagem JPG</button><p>YouTube · JPG · Melhor qualidade disponível</p><p id="reference-feedback" role="status"></p></div></div>`;
    document.querySelector('#download-reference').onclick = async (e) => {
      const button = e.currentTarget;
      button.disabled = true;
      button.textContent = 'Baixando imagem…';
      const feedback = document.querySelector('#reference-feedback');
      feedback.textContent = 'Buscando a melhor resolução disponível…';
      try {
        const blob = await (await api(`reference/${id}`)).blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `referencia-${id}.jpg`;
        document.body.append(a);
        a.click();
        a.remove();
        feedback.textContent = 'Download iniciado. Sua referência está pronta!';
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        feedback.textContent = 'Não foi possível baixar. Confira sua conexão e tente novamente.';
        toast('Não foi possível baixar esta thumbnail. Tente novamente.');
      } finally {
        button.disabled = false;
        button.textContent = 'Baixar imagem JPG';
      }
    };
  };
  if (referenceId) preview(referenceId);
  document.querySelector('#reference-form').onsubmit = (e) => {
    e.preventDefault();
    const id = youtubeId(new FormData(e.target).get('url'));
    if (!id) {
      toast('Envie um link válido do YouTube.');
      return;
    }
    preview(id);
  };
}
let noteEditing = '',
  noteSearch = '';
export function renderNotes(data) {
  const notes = data.notes || [],
    editing = notes.find((n) => n.id === noteEditing);
  return `<div class="tool-grid"><section class="panel tool-panel"><h2>${editing ? 'Editar nota' : 'Nova nota'}</h2><form id="note-form"><label class="field">Título<input name="title" maxlength="200" required value="${esc(editing?.title || '')}"></label><label class="field">Cliente<select name="clientId"><option value="">Geral / prompts</option>${data.clients.map((c) => `<option value="${esc(c.id)}" ${editing?.clientId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label><label class="field">Nota<textarea name="body" rows="12" maxlength="50000" required>${esc(editing?.body || '')}</textarea></label><button class="primary">Salvar nota</button> <button type="button" class="secondary" id="new-note">Nova nota</button></form></section><section><label class="field">Buscar notas<input id="note-search" type="search" value="${esc(noteSearch)}" placeholder="Título, conteúdo ou cliente"></label><div id="note-list">${
    notes
      .filter((n) =>
        `${n.title} ${n.body} ${data.clients.find((c) => c.id === n.clientId)?.name || ''}`
          .toLocaleLowerCase()
          .includes(noteSearch.toLocaleLowerCase()),
      )
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .map(
        (n) =>
          `<article class="panel tool-panel"><small>${esc(data.clients.find((c) => c.id === n.clientId)?.name || 'Geral / prompts')}</small><h2>${esc(n.title)}</h2><p class="note-body">${esc(n.body)}</p><button class="secondary" data-note-edit="${esc(n.id)}">Editar</button> <button class="textbutton danger" data-note-delete="${esc(n.id)}">Excluir</button></article>`,
      )
      .join('') || '<p>Nenhuma nota encontrada.</p>'
  }</div></section></div>`;
}
export function bindNotes(data, persist, render, toast) {
  const form = document.querySelector('#note-form');
  if (!form) return;
  form.onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const note = {
      id: noteEditing || crypto.randomUUID(),
      title: f.get('title').trim(),
      body: f.get('body').trim(),
      clientId: f.get('clientId'),
      updatedAt: new Date().toISOString(),
    };
    if (!note.title || !note.body) return;
    data.notes ||= [];
    const index = data.notes.findIndex((n) => n.id === note.id);
    if (index < 0) data.notes.push(note);
    else data.notes[index] = note;
    if (persist()) {
      noteEditing = '';
      render();
      toast('Nota salva.');
    }
  };
  document.querySelector('#new-note').onclick = () => {
    noteEditing = '';
    render();
  };
  document.querySelector('#note-search').oninput = (e) => {
    noteSearch = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const input = document.querySelector('#note-search');
    input.focus();
    input.setSelectionRange(pos, pos);
  };
  document.querySelectorAll('[data-note-edit]').forEach(
    (b) =>
      (b.onclick = () => {
        noteEditing = b.dataset.noteEdit;
        render();
      }),
  );
  document.querySelectorAll('[data-note-delete]').forEach(
    (b) =>
      (b.onclick = () => {
        if (!confirm('Excluir esta nota?')) return;
        data.notes = data.notes.filter((n) => n.id !== b.dataset.noteDelete);
        if (noteEditing === b.dataset.noteDelete) noteEditing = '';
        persist();
        render();
      }),
  );
}
let calendarMonth = today().slice(0, 7);
export function renderDeadlineCalendar(jobs, clients) {
  const [y, m] = calendarMonth.split('-').map(Number),
    first = new Date(y, m - 1, 1),
    days = new Date(y, m, 0).getDate(),
    offset = (first.getDay() + 6) % 7;
  return `<section class="panel tool-panel"><div class="calendar-heading"><button class="secondary" data-calendar="-1" aria-label="Mês anterior">←</button><h2>${first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h2><button class="secondary" data-calendar="1" aria-label="Próximo mês">→</button><button class="secondary" data-calendar="today">Hoje</button></div><div class="calendar-scroll"><div class="deadline-calendar">${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => `<strong>${d}</strong>`).join('')}${'<div class="calendar-blank"></div>'.repeat(offset)}${Array.from(
    { length: days },
    (_, i) => {
      const key = `${calendarMonth}-${String(i + 1).padStart(2, '0')}`;
      return `<div class="calendar-day ${key === today() ? 'is-today' : ''}"><strong>${i + 1}</strong>${jobs
        .filter((j) => (j.dueAt?.slice(0, 10) || j.deadline) === key)
        .map(
          (j) =>
            `<button data-edit="${esc(j.id)}" class="calendar-job ${j.status === 'delivered' ? 'complete' : ''}">${esc(j.title)}<small>${esc(clients.find((c) => c.id === j.clientId)?.name || '')} · ${j.dueAt?.slice(11, 16) || '23:59'} · ${j.status === 'delivered' ? 'Entregue' : 'Pendente'}</small></button>`,
        )
        .join('')}</div>`;
    },
  ).join(
    '',
  )}</div></div><p>Selecione uma entrega para editar. A lista abaixo mantém todas as pendências, inclusive de outros meses.</p></section>`;
}
export function bindDeadlineCalendar(render) {
  document.querySelectorAll('[data-calendar]').forEach(
    (b) =>
      (b.onclick = () => {
        if (b.dataset.calendar === 'today') calendarMonth = today().slice(0, 7);
        else {
          const [y, m] = calendarMonth.split('-').map(Number),
            d = new Date(y, m - 1 + Number(b.dataset.calendar), 1);
          calendarMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }
        render();
      }),
  );
}
export function financialBreakdown(jobs, rate) {
  const values = ['Recebido', 'A receber'].map((label, i) => ({
      label,
      value: jobs
        .filter((j) => j.paid === !i)
        .reduce((s, j) => s + j.value * ((j.currency || 'USD') === 'USD' ? rate : 1), 0),
    })),
    max = Math.max(1, ...values.map((v) => v.value));
  return `<section class="panel tool-panel"><h2>Recebido × a receber</h2><p>Valores do período selecionado, em BRL estimado pela cotação atual.</p>${values.map((v) => `<div class="finance-bar"><span>${v.label}</span><div><i style="width:${(v.value / max) * 100}%"></i></div><strong>${money(v.value, 'BRL')}</strong></div>`).join('')}</section>`;
}
