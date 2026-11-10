# Thumbs Studio

Aplicativo em português para um thumbnail designer gerenciar clientes, trabalhos, prazos e pagamentos em dólares.

Para entender a estrutura dos módulos e o fluxo de dados, veja o [guia do código](docs/CODIGO.md). Use `npm run format` para formatar os arquivos e `npm run format:check` para verificar o padrão.

## Rodar localmente

Requer Node.js 22.13 ou superior. O modo local usa o SQLite integrado ao Node, sem instalar dependências de produção.

```sh
node server.mjs
```

Abra http://localhost:3000. O banco local fica em `data/thumbs.sqlite` e permanece no disco ao fechar o app e o servidor. Para executar os testes, use `node --test`.

## Aplicativo publicado

**https://thumbs-studio.thumbs-manager.workers.dev**

O app usa Cloudflare Workers + D1 no plano Free, sem R2 e sem domínio pago. Pode ser aberto sem manter seu computador ligado. Nenhum plano gratuito garante disponibilidade ininterrupta: limites, manutenção e mudanças do provedor ainda se aplicam.

Entre com sua senha. A cópia local em `data/access-key.txt` e o arquivo de secrets são ignorados pelo Git e não entram no pacote público. A senha permanece apenas na sessão do navegador e pode ser solicitada novamente ao reabrir. Para alterá-la, atualize o secret `ACCESS_KEY` com `npx wrangler secret put ACCESS_KEY` e use a nova senha nos seus dispositivos. O nome técnico do secret foi mantido por compatibilidade; o acesso aceita senhas a partir de seis caracteres.

No Chrome/Edge, use **Instalar aplicativo**. No iPhone, use **Compartilhar → Adicionar à Tela de Início**. O app abre em sua própria janela, tem temas claro/escuro e adapta a tabela para cartões no celular.

### Levar os dados antigos para a nuvem

1. No app antigo em `http://localhost:3000`, exporte o backup em Configurações.
2. Entre no endereço publicado e importe o backup em Configurações.
3. Aguarde **Salvo no banco** antes de fechar ou usar outro dispositivo. Isso inclui o envio dos anexos.

O navegador trata localhost e o endereço publicado como locais separados; dados antigos não são transferidos silenciosamente. Importar substitui o workspace atual após confirmação.

### Persistência e sincronização

Clientes, trabalhos e anexos ficam no banco SQL D1 da sua conta. O navegador mantém uma cópia para uso offline e enfileira alterações até a conexão voltar. Fechar o app não apaga os registros confirmados no banco. Os arquivos são enviados em partes de 512 KiB, respeitando os limites de linha do D1.

Se dois dispositivos alterarem a mesma versão, a gravação mais antiga é bloqueada para não apagar alterações. O app permite exportar a cópia local antes de carregar o banco; reaplique manualmente os ajustes necessários. Os dados de outro dispositivo são carregados ao abrir/recarregar o app, sem edição colaborativa em tempo real. Espere a sincronização terminar antes de trocar de dispositivo. Um arquivo incompleto pode precisar de novo envio se o app for fechado durante o upload.

Limites do aplicativo: **20 MB por arquivo**, **200 MB de anexos reservados no total** e **1 MiB por envio de registros**. Arquivos grandes devem ser guardados no Drive e anexados por link. Arquivos removidos são apagados do banco depois que a remoção do vínculo é sincronizada. Envios interrompidos podem deixar reservas sem vínculo; Configurações permite consultar o espaço e limpar arquivos não vinculados com mais de 24 horas. Exporte backups regularmente, inclusive quando usar a nuvem.

Na consulta de novembro de 2026, o plano Workers Free permite 100 mil requisições de Worker por dia; D1 Free limita cada banco a 500 MB, com quotas diárias de leitura e escrita. Mantenha o plano Free, sem ativar Workers Paid, R2 ou adicionais. Ao atingir as quotas gratuitas, operações podem ser bloqueadas. Fontes: [Workers](https://developers.cloudflare.com/workers/platform/limits/), [D1](https://developers.cloudflare.com/d1/platform/limits/), [comportamento das quotas Free](https://developers.cloudflare.com/d1/reference/faq/).

## Manutenção e publicação

```sh
npm ci
npm test
npm run build
npx wrangler login --scopes account:read user:read workers:write workers_scripts:write d1:write
npm run db:migrate
npm run cloud:deploy
```

`wrangler.jsonc` identifica o banco e o Worker existentes. Reutilize-os em novas publicações. As migrações ficam em `migrations/`; não edite migrações já aplicadas. Uma nova publicação não apaga os dados do banco e mantém os secrets existentes. Não coloque `data/` ou backups em `dist/`; o build usa uma lista explícita de arquivos públicos.

Para instalar em outra conta, crie outro banco D1 e atualize os identificadores em uma cópia de `wrangler.jsonc`, aplique as migrações e configure `ACCESS_KEY` antes de usar. `node scripts/prepare-key.mjs` gera uma chave local sem imprimi-la; a primeira publicação pode usar `npx wrangler deploy --secrets-file data/cloudflare-secrets.json`. Atualizações normais não precisam desse arquivo.

O comando `node scripts/verify-deployment.mjs https://thumbs-studio.thumbs-manager.workers.dev` verifica HTTPS, arquivos PWA, bloqueio sem chave e upload/download binário no D1, removendo seu arquivo de teste ao final.

## Recursos

- Painel com ganhos recebidos, saldo a receber, entregas e gráfico de seis meses.
- Clientes com histórico e valores pendentes por cliente.
- Preço por cliente definido no cadastro, em USD ou BRL. Novas thumbnails usam esse preço automaticamente, sem digitação repetida. Use “Alterar só este trabalho” para uma exceção ou edite o cliente para mudar o padrão das próximas thumbnails. Clientes antigos sem preço devem ser configurados uma única vez. Trabalhos existentes mantêm seus preços.
- Cadastro e edição de thumbnails, briefing, valor, prazo e etapa.
- Pagamentos independentes da etapa de produção, com data de recebimento.
- Agenda com indicação de atrasos, busca e filtros por cliente, mês e etapa.
- Trabalhos em USD ou BRL, com totais separados e conversão estimada para reais.
- Cotação automática USD/BRL pela API pública Frankfurter ao abrir e a cada 30 minutos, com data da referência, atualização manual e último valor salvo como alternativa offline.
- Temas claro e escuro com preferência persistida no navegador.
- E-mail e contato adicional por cliente (WhatsApp, Discord etc.).
- Cronômetro por trabalho: iniciar, pausar e retomar; iniciar outro pausa o anterior. O tempo continua contando se a aba for fechada até você pausar.
- Links HTTP/HTTPS e arquivos anexados por thumbnail, com download e remoção, salvos também no banco.
- Exportação CSV e backup JSON com importação validada.
- Dados fictícios opcionais em Configurações para explorar um workspace vazio.

## Fluxo de trabalho interativo

- **Quadro de produção:** em Thumbnails, alterne entre quadro e lista. Arraste um cartão entre Briefing, Em produção, Em revisão e Entregue, ou use o seletor de status no cartão ou na lista. No celular, use o seletor.
- **Prazos com hora:** novas thumbnails começam com pelo menos 24 horas a partir da criação do formulário. Há atalhos de 24h, 48h e 72h e edição livre de data/hora. O botão +24h adia o prazo atual. Trabalhos antigos que tinham só uma data continuam considerando o fim daquele dia.
- **Adicionais:** inclua descrição, quantidade e valor unitário para revisões extras, variações, urgência ou itens personalizados. O resumo mostra preço base, adicionais e total; os indicadores financeiros e o CSV usam o total.
- **Prioridades:** marque a bandeira no cartão para destacar trabalhos importantes. Filtre por prioridade, atrasos, próximas 24h, cliente ou pagamento pendente.
- **Ações rápidas:** cronômetro, anexos, pagamento, cópia de briefing e duplicação ficam no cartão. Uma cópia reinicia o status, o prazo, o pagamento e o cronômetro e não herda anexos ou links.
- **Histórico:** mudanças de status geram atividade recente no painel. Entregar uma thumbnail pausa seu cronômetro automaticamente. O histórico guarda as últimas 20 mudanças por trabalho.
- **Atalhos:** `N` cria uma thumbnail e `/` foca a busca, fora dos formulários.

Alterar o preço padrão de um cliente continua sem modificar preços de trabalhos existentes. Ao editar uma thumbnail com adicionais, o preço base e os itens são carregados separadamente para não somar os extras duas vezes.

O backup JSON inclui os arquivos e o tempo acumulado; ao importá-lo, os cronômetros ficam pausados. A importação substitui os dados após confirmação e aceita backups antigos (trabalhos antigos continuam em USD). Apagar os dados do navegador remove apenas a cópia local; registros já sincronizados podem ser recuperados ao entrar no mesmo endereço com sua chave.

A API Frankfurter fornece cotação de referência, não valores líquidos de tarifas nem cotações em tempo real. O app mantém o último valor salvo quando a consulta falha; antes da primeira consulta usa a estimativa inicial de R$ 5,20, indicada na interface. O gráfico consolida recebimentos em reais com a cotação atual, não com a cotação histórica. O CSV inclui moeda e tempo, mas não os arquivos: use o backup JSON para uma cópia completa.

## Usar os novos recursos

### Google Calendar e notificações

Em **Configurações → Google Calendar**, siga o guia gratuito para criar um cliente OAuth Web no seu próprio projeto Google, habilitar a API Calendar e autorizar a conta. O site não pode reutilizar a conexão Google deste chat. **Os lembretes do Google só ficam ativos após concluir essa configuração.**

URI de redirecionamento: `https://thumbs-studio.thumbs-manager.workers.dev/api/calendar/callback`. O escopo solicitado é apenas `https://www.googleapis.com/auth/calendar.app.created`: o app cria **Thumbs Studio · Prazos** e gerencia eventos nessa agenda separada, sem editar a agenda principal. Desmarque seu nome no Google Calendar para ocultá-la; ocultar não desliga notificações. Configure as notificações na agenda ou remova-a se quiser encerrá-las.

O Worker sincroniza após gravações e por cron a cada cinco minutos, em lotes de até quatro trabalhos modificados por ciclo. As entregas ativas mais próximas têm prioridade. O evento do prazo inclui lembretes de popup em 60, 15 e zero minutos, além de e-mail no horário. Se o prazo vencer sem entrega, é criado um evento de alerta aproximadamente dois minutos após a detecção no próximo ciclo, com popup e e-mail. Ele é deduplicado por trabalho e prazo. Entregar o trabalho remove alertas de atraso pendentes e desativa lembretes do evento da entrega; mensagens já enviadas pelo Google não podem ser recolhidas. Trabalhos removidos do app têm seus eventos gerenciados removidos na sincronização seguinte.

A integração é unidirecional: altere os trabalhos no app. Mudanças no Google não alteram os registros do estúdio. Etapas de produção exigem confirmação humana; o indicador de atraso e “Aguardando pagamento” são calculados automaticamente. O card em Thumbnails reúne entregas sem pagamento e filtra esses trabalhos.

Avisos **neste dispositivo** são opcionais e pedem permissão ao clicar no botão. Funcionam com o app aberto, uma hora antes e após o vencimento, sem repetir o mesmo alerta. Não há Web Push em segundo plano; para avisos com o app fechado, conclua a conexão com o Google. A entrega de notificações depende das permissões e configurações do Google, navegador e sistema operacional.

As credenciais OAuth e os tokens ficam criptografados em tabelas separadas no D1, usando AES-256-GCM. Não entram na API de registros, no backup exportado nem no bundle. A chave de criptografia é o secret `CALENDAR_ENCRYPTION_KEY`; a cópia local está em `data/calendar-encryption-key.txt`, ignorada pelo Git. Preserve essa chave em atualizações. `node scripts/prepare-key.mjs` prepara os secrets sem imprimi-los e rejeita chaves locais inconsistentes. Execute as migrações antes de publicar novas versões. O modo local não conecta o Google por padrão; faça a configuração no endereço HTTPS publicado.

No modo OAuth **Testing**, o Google pode expirar o refresh token após sete dias. Para uso contínuo, configure o status de publicação conforme as regras do Google; o botão Reconectar restaura autorizações expiradas. Desconectar remove as credenciais do app e tenta revogar a permissão, mas mantém os eventos já criados no Google.

Referências: [escopo restrito às agendas do app](https://developers.google.com/workspace/calendar/api/auth), [OAuth offline](https://developers.google.com/identity/protocols/oauth2/web-server), [limites e custo da API Calendar](https://developers.google.com/workspace/calendar/api/guides/quota).

Use o botão Claro/Escuro no topo para alternar o tema. Na edição de cada thumbnail escolha a moeda, e na tabela use ▷ para iniciar o cronômetro ou “anexos” para salvar arquivos e links. O contato adicional fica no cadastro do cliente. A cotação pode ser atualizada pela faixa no topo ou por Configurações.

As fontes do Google são opcionais e têm alternativas locais. O carregamento offline mantém a interface; as APIs privadas nunca entram no cache do service worker.
