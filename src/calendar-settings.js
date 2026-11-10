import { esc } from './ui.js';
import {
  notificationStatus,
  enableDeadlineNotifications,
  disableDeadlineNotifications,
} from './notifications.js';

let state = { loading: false, ready: false, configured: false, connected: false };
let lastLoaded = 0;
export function renderCalendarSettings() {
  const notification = notificationStatus();
  const redirect =
    state.redirectUri ||
    (typeof location !== 'undefined' ? location.origin : '') + '/api/calendar/callback';
  return /* HTML */ `<section class="panel settings calendar-settings" id="calendar-settings">
    <div class="calendar-title">
      <div>
        <span class="eyebrow">PRAZOS SEM SURPRESAS</span>
        <h2>Google Calendar</h2>
      </div>
      <span class="badge ${state.connected && !state.error ? 'paid' : 'pending'}"
        >${state.connected ? (state.error ? 'Requer atenção' : '● Conectado') : 'Conexão pendente'}</span
      >
    </div>
    <p>
      Uma agenda só para suas thumbs: <strong>Thumbs Studio · Prazos</strong>. Para ocultá-la,
      desmarque esse nome na lista de agendas do Google.
    </p>
    <div class="calendar-benefits">
      <span>◷ 1h e 15min antes</span><span>✉ No horário da entrega</span
      ><span>⚑ Alerta após o atraso</span>
    </div>
    ${state.error ? /* HTML */ `<div class="notice" role="status">${esc(state.error)}</div>` : ''}${
      state.connected
        ? /* HTML */ `<p>
              A sincronização automática roda mesmo com o app fechado, em ciclos de 5 minutos.
              Eventos recebem o prazo e o status atual do app. O Google agenda uma notificação e um
              e-mail após um prazo perdido, uma vez por prazo. Muitos trabalhos podem exigir mais de
              um ciclo de sincronização.
            </p>
            <div class="calendar-actions">
              <button class="primary" id="calendar-sync" ${state.running ? 'disabled' : ''}>
                ${state.running ? 'Sincronizando…' : 'Sincronizar agora'}</button
              >${state.calendarUrl ? /* HTML */ `<a class="secondary" href="${esc(state.calendarUrl)}" target="_blank" rel="noopener noreferrer">Abrir agenda ↗</a>` : ''}<button
                class="textbutton"
                id="calendar-connect"
              >
                Reconectar</button
              ><button class="textbutton danger" id="calendar-disconnect">Desconectar</button>
            </div>
            <p class="calendar-last-sync">
              Última sincronização:
              ${state.lastSync ? esc(new Date(state.lastSync).toLocaleString('pt-BR')) : 'aguardando o primeiro ciclo'}
            </p>`
        : /* HTML */ `<p>
              A conexão deste chat não autoriza o site. Configure o OAuth gratuito uma vez e, em
              seguida, autorize a sua conta Google.
            </p>
            ${!state.ready ? '<div class="notice">A conexão segura estará disponível no endereço publicado após a configuração do servidor.</div>' : ''}
            <details class="calendar-guide" ${!state.configured ? 'open' : ''}>
              <summary>Configuração guiada gratuita · uma única vez</summary>
              <ol>
                <li>
                  Abra o
                  <a
                    href="https://console.cloud.google.com/projectcreate"
                    target="_blank"
                    rel="noopener noreferrer"
                    >Google Cloud Console</a
                  >
                  e crie um projeto chamado “Thumbs Studio”. Não é necessário ativar faturamento
                  para a API Calendar.
                </li>
                <li>
                  Em <strong>APIs e serviços → Biblioteca</strong>, ative
                  <strong>Google Calendar API</strong>.
                </li>
                <li>
                  Em <strong>Google Auth Platform</strong>, configure o nome e seu e-mail. Se usar o
                  modo de teste, adicione seu próprio e-mail aos usuários de teste.
                </li>
                <li>
                  Em <strong>Acesso a dados</strong>, adicione o escopo
                  <code>https://www.googleapis.com/auth/calendar.app.created</code>. Ele permite
                  gerenciar apenas agendas criadas pelo aplicativo.
                </li>
                <li>
                  Crie um cliente OAuth do tipo <strong>Aplicativo da Web</strong>. Cadastre este
                  endereço exato em <strong>URIs de redirecionamento autorizados</strong>:<code
                    >${esc(redirect)}</code
                  >
                </li>
                <li>
                  Copie o <strong>Client ID</strong> e o <strong>Client Secret</strong> para os
                  campos abaixo. Eles ficam criptografados no servidor e não entram em backups ou no
                  Git.
                </li>
                <li>
                  Salve, clique em <strong>Conectar Google</strong> e autorize a criação da agenda
                  separada.
                </li>
              </ol>
              <p>
                No modo “Testing”, a autorização offline pode expirar em 7 dias. Para uso contínuo,
                configure o status de publicação do OAuth conforme as orientações do Google; se
                expirar, use Reconectar.
              </p>
            </details>
            <form id="calendar-setup">
              <div class="field">
                <label for="google-client-id">Client ID do Google</label
                ><input
                  id="google-client-id"
                  placeholder="…apps.googleusercontent.com"
                  maxlength="300"
                  required
                  autocomplete="off"
                />
              </div>
              <div class="field">
                <label for="google-client-secret">Client Secret do Google</label
                ><input
                  type="password"
                  id="google-client-secret"
                  maxlength="500"
                  required
                  autocomplete="off"
                />
              </div>
              <button class="secondary" ${state.ready ? '' : 'disabled'}>
                Salvar configuração segura
              </button>
            </form>
            <div class="calendar-actions">
              <button class="primary" id="calendar-connect" ${state.configured ? '' : 'disabled'}>
                Conectar Google</button
              ><button class="textbutton" id="calendar-refresh">Verificar conexão</button>
            </div>`
    }
    <p class="calendar-help">
      Os avisos do Google dependem das notificações habilitadas no seu Calendar e no celular.
      Ocultar a agenda apenas esconde os eventos; não desativa os lembretes. Eventos são gerenciados
      pelo app: ajuste prazos e entregas aqui.
    </p>
    <hr />
    <h2>Notificações neste dispositivo</h2>
    <p>
      Com o app aberto, receba avisos uma hora antes e após o vencimento. Para receber com o app
      fechado, conclua a conexão com o Google acima. Esta opção não ativa notificações push em
      segundo plano.
    </p>
    <button
      class="secondary"
      id="deadline-notifications"
      ${notification === 'unsupported' ? 'disabled' : ''}
    >
      ${notification === 'enabled' ? 'Desativar avisos locais' : notification === 'denied' ? 'Permissão bloqueada no navegador' : notification === 'unsupported' ? 'Notificações indisponíveis neste navegador' : 'Ativar avisos neste dispositivo'}
    </button>
  </section>`;
}

export function bindCalendarSettings(api, render, toast) {
  const panel = document.querySelector('#calendar-settings');
  if (!panel) return;
  const load = async () => {
    if (state.loading) return;
    state.loading = true;
    try {
      state = { ...state, ...(await (await api('calendar/status')).json()) };
    } catch (error) {
      state.error = error.message;
    } finally {
      state.loading = false;
      lastLoaded = Date.now();
      render();
    }
  };
  if (Date.now() - lastLoaded > 60000) void load();
  const form = panel.querySelector('#calendar-setup');
  if (form)
    form.onsubmit = async (event) => {
      event.preventDefault();
      const button = form.querySelector('button');
      button.disabled = true;
      const clientId = form.querySelector('#google-client-id').value.trim(),
        clientSecret = form.querySelector('#google-client-secret').value.trim();
      try {
        await api('calendar/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, clientSecret }),
        });
        form.querySelector('#google-client-secret').value = '';
        toast('Configuração salva. Agora conecte sua conta Google.');
        await load();
      } catch (error) {
        toast(error.message);
        button.disabled = false;
      }
    };
  const connect = panel.querySelector('#calendar-connect');
  if (connect)
    connect.onclick = async () => {
      connect.disabled = true;
      try {
        const result = await (await api('calendar/connect', { method: 'POST' })).json();
        const url = new URL(result.url);
        if (url.origin !== 'https://accounts.google.com')
          throw Error('Endereço de autorização inválido.');
        window.location.assign(url.href);
      } catch (error) {
        toast(error.message);
        connect.disabled = false;
      }
    };
  const refresh = panel.querySelector('#calendar-refresh');
  if (refresh) refresh.onclick = load;
  const sync = panel.querySelector('#calendar-sync');
  if (sync)
    sync.onclick = async () => {
      sync.disabled = true;
      try {
        await api('calendar/sync', { method: 'POST' });
        toast('Sincronização solicitada.');
        state.running = true;
        render();
        setTimeout(load, 5000);
      } catch (error) {
        toast(error.message);
        sync.disabled = false;
      }
    };
  const disconnect = panel.querySelector('#calendar-disconnect');
  if (disconnect)
    disconnect.onclick = async () => {
      if (
        !confirm(
          'Desconectar o app? A agenda e seus lembretes já criados permanecem no Google. Para interrompê-los, ajuste as notificações dessa agenda ou remova-a no Calendar.',
        )
      )
        return;
      try {
        const result = await (await api('calendar/disconnect', { method: 'POST' })).json();
        toast(
          result.revoked
            ? 'Google desconectado.'
            : 'Conexão local removida. Revogue também o acesso nas permissões da sua conta Google.',
        );
        await load();
      } catch (error) {
        toast(error.message);
      }
    };
  panel.querySelector('#deadline-notifications').onclick = async () => {
    try {
      if (notificationStatus() === 'enabled') {
        disableDeadlineNotifications();
        toast('Avisos locais desativados.');
      } else {
        await enableDeadlineNotifications();
        toast('Avisos locais ativados.');
      }
      render();
    } catch (error) {
      toast(error.message);
    }
  };
}
