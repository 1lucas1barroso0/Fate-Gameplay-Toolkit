# Fate Gameplay Toolkit

Ferramenta independente para jogar Fate no navegador. Reúne Fichas, a Central de Regras bilíngue, rolagens de 4dF, Mesas compartilhadas e personalização do jogo em uma interface responsiva e instalável.

Fate Condensado continua sendo a regra principal. Os demais livros são identificados como guias ou expansões e nunca substituem silenciosamente a base atual.

## Recursos

- Fichas universais em modos de edição e leitura, com imagem, importação e exportação.
- Regras completas em português e inglês, busca, resumo rápido e fontes identificadas.
- Rolagens locais e compartilhadas com distribuição criptograficamente imparcial de 4dF.
- Mesas com aprovação de participantes, Histórico da Mesa, regras compartilhadas e arquivos privados.
- Conjuntos de regras personalizáveis, recuperação de versões e vínculo entre Fichas e Mesas.
- Tema claro ou escuro, densidade e tamanho de leitura ajustáveis.
- PWA responsiva para computador, tablet e celular.

## Tecnologia

- Next.js 16 e React 19.
- Neon Postgres para Mesas, participantes e histórico.
- Vercel Blob privado para arquivos compartilhados.
- Drizzle Kit para evolução versionada do banco.
- Vercel para hospedagem e GitHub para a fonte do projeto.

As Fichas, preferências, rolagens pessoais e conjuntos personalizados permanecem no armazenamento do próprio dispositivo. Apenas os dados publicados em uma Mesa usam o backend compartilhado.

## Desenvolvimento local

Requisitos: Node.js 22 e uma base Postgres compatível com Neon. Arquivos compartilhados também exigem um Vercel Blob privado.

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Variáveis necessárias para usar as Mesas:

- `DATABASE_URL`: conexão Postgres.
- `BLOB_READ_WRITE_TOKEN`: credencial do Vercel Blob.

A aplicação cria de forma idempotente as tabelas necessárias no primeiro uso. Para produzir e versionar uma migração depois de alterar `db/schema.ts`, use `npm run db:generate`.

## Verificação

```bash
npm run lint
npm test
```

`npm test` produz a compilação de produção antes de executar as verificações de conteúdo, interface, persistência e regressão.

## Publicação

O projeto está preparado para integração Git da Vercel. Cada alteração enviada a uma branch gera uma prévia; a branch `main` publica a produção. No projeto da Vercel, conecte:

1. uma base Neon que forneça `DATABASE_URL`;
2. um Vercel Blob privado que forneça `BLOB_READ_WRITE_TOKEN`.

Nenhuma credencial deve ser salva no repositório.

## Créditos e licenças

Fate™ é marca registrada da Evil Hat Productions, LLC. Este é um projeto independente, sem patrocínio ou endosso da Evil Hat.

As atribuições, licenças e fontes de cada material estão preservadas na Central de Regras e resumidas em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Materiais protegidos usados como referência aparecem apenas em sínteses editoriais; seu texto integral não é redistribuído.
