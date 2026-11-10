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
- Valor padrão opcional em USD ou BRL por cliente. Novas thumbnails preenchem o preço ao selecionar o cliente, com edição livre por trabalho. Alterar o padrão do cliente não altera trabalhos existentes.
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

O backup JSON inclui os arquivos e o tempo acumulado; ao importá-lo, os cronômetros ficam pausados. A importação substitui os dados após confirmação e aceita backups antigos (trabalhos antigos continuam em USD). Apagar os dados do navegador remove apenas a cópia local; registros já sincronizados podem ser recuperados ao entrar no mesmo endereço com sua chave.

A API Frankfurter fornece cotação de referência, não valores líquidos de tarifas nem cotações em tempo real. O app mantém o último valor salvo quando a consulta falha; antes da primeira consulta usa a estimativa inicial de R$ 5,20, indicada na interface. O gráfico consolida recebimentos em reais com a cotação atual, não com a cotação histórica. O CSV inclui moeda e tempo, mas não os arquivos: use o backup JSON para uma cópia completa.

## Usar os novos recursos

Use o botão Claro/Escuro no topo para alternar o tema. Na edição de cada thumbnail escolha a moeda, e na tabela use ▷ para iniciar o cronômetro ou “anexos” para salvar arquivos e links. O contato adicional fica no cadastro do cliente. A cotação pode ser atualizada pela faixa no topo ou por Configurações.

As fontes do Google são opcionais e têm alternativas locais. O carregamento offline mantém a interface; as APIs privadas nunca entram no cache do service worker.
