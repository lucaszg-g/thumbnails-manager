# Guia do código

O projeto usa JavaScript com módulos nativos, HTML e CSS. Não há framework de interface nem etapa de compilação do frontend. O build copia apenas os arquivos públicos para `dist/`.

## Onde encontrar cada parte

| Arquivo ou pasta                 | Responsabilidade                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `index.html`                     | Documento inicial, metadados e entrada do aplicativo.                                                      |
| `src/app.js`                     | Estado da interface, telas, formulários e ações do usuário. As seções estão identificadas por comentários. |
| `src/ui.js`                      | Textos de navegação, ícones SVG, escape de HTML e formatação de moedas, datas e duração.                   |
| `src/model.js`                   | Validação dos registros, migração de backups, totais financeiros e regras do cronômetro.                   |
| `src/sync.js`                    | Autenticação, fila de sincronização, recuperação offline e controle de revisões.                           |
| `src/storage.js`                 | Cache de anexos em IndexedDB e recuperação dos arquivos no banco.                                          |
| `src/style.css`                  | Layout, componentes, temas e adaptações para celular. A ordem das regras preserva a cascata existente.     |
| `backend/api.js`                 | API compartilhada entre o servidor local e a Cloudflare, com autorização e persistência.                   |
| `backend/sqlite.js`              | Adaptador do SQLite local para a interface de consultas usada pelo D1.                                     |
| `migrations/`                    | Esquema SQL do banco. Migrações já aplicadas não devem ser editadas.                                       |
| `server.mjs`                     | Servidor HTTP local e abertura do banco SQLite.                                                            |
| `worker.js`                      | Entrada da Cloudflare: encaminha APIs e serve os arquivos públicos.                                        |
| `sw.js` e `manifest.webmanifest` | Cache da interface e instalação como PWA. A API privada não é armazenada no cache.                         |
| `scripts/`                       | Build, geração de ícones, preparação da chave e verificação da publicação.                                 |
| `*.test.js`                      | Testes próximos dos módulos que verificam.                                                                 |

## Como uma alteração é salva

1. Um formulário ou botão em `app.js` altera os registros do workspace.
2. `model.js` valida os dados e aplica as regras de negócio.
3. `persist()` salva uma cópia no navegador e chama a fila em `sync.js`.
4. A fila envia os anexos pendentes antes de gravar os registros pela API.
5. `backend/api.js` verifica a chave, os anexos e a revisão esperada antes de atualizar o banco.
6. Se outro dispositivo já gravou uma revisão mais nova, o app mantém a cópia local e informa o conflito.

`localStorage` e IndexedDB são cópias locais. O banco remoto é a persistência compartilhada entre dispositivos. Não remova o controle de revisão para resolver conflitos: isso permitiria sobrescrever alterações de outro dispositivo.

## Comandos de desenvolvimento

```sh
npm ci
npm start
npm test
npm run format
npm run format:check
npm run build
```

O Prettier define a formatação em `.prettierrc.json`; `.editorconfig` define indentação e codificação para os editores. O comentário `/* HTML */` antes de templates permite formatar também o HTML dentro do JavaScript.

Ao adicionar um módulo usado pelo navegador, inclua-o na lista pública de `scripts/build.mjs`, na lista do servidor local em `server.mjs` e, se precisar funcionar offline, no cache de `sw.js`. Atualize a versão do cache quando mudar os arquivos necessários ao funcionamento offline.

## Arquivos privados e gerados

`data/`, `.wrangler/`, `node_modules/`, `dist/`, `.env` e `.dev.vars` não devem entrar no Git. A chave de acesso e os bancos locais ficam em `data/`. Nunca coloque dados de clientes ou backups nos arquivos públicos do build.

As instruções de acesso, backup e publicação estão no [README](../README.md).
