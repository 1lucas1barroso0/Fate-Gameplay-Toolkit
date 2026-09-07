# Publicação do Fate Gameplay Toolkit

O código deste repositório já está pronto para a publicação independente.

## GitHub

No diretório do projeto, com acesso de escrita ao repositório:

```bash
git remote set-url origin https://github.com/1lucas1barroso0/Fate-Gameplay-Toolkit.git
git fetch origin main
# O repositório remoto contém apenas o README inicial criado no preparo.
git push --force-with-lease -u origin main
```

## Vercel

Importe `1lucas1barroso0/Fate-Gameplay-Toolkit` como um projeto Next.js chamado
`fate-gameplay-toolkit`, usando a branch `main` para produção. Depois, conecte:

- uma base Neon com `DATABASE_URL`;
- um Vercel Blob privado com `BLOB_READ_WRITE_TOKEN`.

O arquivo `vercel.json` já define o framework. O workflow de CI valida lint,
compilação e os testes antes de cada publicação.

## Verificação final

```bash
npm ci
npm run lint
npm test
```

Não salve credenciais no GitHub. O site antigo permanece separado e intacto.
