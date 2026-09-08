# Publicação do Fate Gameplay Toolkit

O código deste repositório já está pronto para a publicação independente.

## GitHub

No diretório do projeto, com acesso de escrita ao repositório:

```bash
git remote set-url origin https://github.com/1lucas1barroso0/Fate-Gameplay-Toolkit.git
git fetch origin main
git push -u origin main
```

## Vercel

O repositório `1lucas1barroso0/Fate-Gameplay-Toolkit` está associado ao projeto Next.js
`fate-gameplay-toolkit`, usando a branch `main` para produção. Mantenha conectados:

- uma base Neon com `DATABASE_URL`;
- um Vercel Blob privado com `BLOB_READ_WRITE_TOKEN`.

O arquivo `vercel.json` já define o framework. O workflow de CI valida lint,
compilação e os testes antes de cada publicação.

O projeto foi dimensionado para os planos gratuitos, com limites preventivos e limpeza descritos em [STORAGE.md](STORAGE.md). Não ative planos pagos para manter as funções básicas.

## Verificação final

```bash
npm ci
npm run lint
npm test
```

Não salve credenciais no GitHub. O site antigo permanece separado e intacto.
