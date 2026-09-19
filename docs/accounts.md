# Contas opcionais

O site continua funcionando sem cadastro, com os dados guardados no aparelho.
O botão **Entrar** no topo permite criar conta, entrar e recuperar o acesso.
Quem entra escolhe se quer copiar os dados do aparelho para a conta. Essa cópia
preserva os dados originais e acrescenta os registros à conta.

Na conta, sincronizamos Fichas e suas imagens, conjuntos de regras, preferências,
leitura e favoritos, histórico pessoal de dados, acessos às Mesas e rascunhos.
O conteúdo compartilhado das Mesas continua no serviço existente.
As alterações são enviadas após a edição; outros aparelhos verificam novidades
a cada 15 segundos e ao voltar à aba ou recuperar a conexão. Mudanças independentes
são combinadas; alterações incompatíveis pedem que a pessoa escolha uma versão.
O salvamento pendente continua guardado neste aparelho se a conexão cair.

**Sair da conta** mantém os dados e volta ao espaço local do aparelho. A saída
aguarda as mudanças serem sincronizadas. Um cache separado permite recuperar
alterações pendentes depois de entrar novamente na mesma conta. As senhas nunca
entram nesse cache; a sessão usa um cookie HttpOnly.

**Apagar cadastro** exige senha e confirmação. Uma transação remove usuário,
credenciais, sessões, preferências, Fichas, imagens e vínculos. As Mesas criadas
pela conta são apagadas integralmente; nas outras Mesas, removemos seus envios
e sua participação. Arquivos compartilhados entram na fila durável de remoção
antes de os registros serem apagados. Se o serviço de arquivos falhar, a
manutenção existente tenta novamente. Dispositivos conectados perdem acesso;
os caches dos demais são apagados quando o site voltar a se conectar. Os dados
usados sem conta, inclusive originais copiados durante a importação, permanecem.

A chave de recuperação é mostrada ao cadastrar e pode ser substituída em
**Minha conta**. A pessoa deve guardá-la fora do site. Ela vale uma vez e permite
redefinir a senha, encerrando as sessões anteriores. Não há envio de e-mail
nem exigência de outro serviço. O endereço funciona como identificação de acesso;
não é apresentado como e-mail verificado.

## Configuração e limites

As contas usam Better Auth e o Postgres já configurado por `DATABASE_URL`.
As tabelas são criadas de forma aditiva, sem remover tabelas existentes.
Sem o banco, o modo local continua disponível e o cadastro fica indisponível.
`BETTER_AUTH_URL` só precisa ser ajustado para domínio ou porta diferentes.
`BETTER_AUTH_SECRET` é opcional: na ausência, uma chave aleatória é criada uma
vez no banco e reutilizada por todas as instâncias. Nunca a exponha no cliente.

Cada conta tem um limite de 3,5 MB para o conjunto de dados sincronizado e
25 MB de imagens, com até 2,1 MB por imagem. Imagens ficam como bytes no banco,
separadas por usuário e identificadas pelo hash do conteúdo. Os arquivos das
Mesas mantêm os limites já existentes. Gravações e cadastro também respeitam
a proteção de espaço do banco. Imagens sem referência recebem um dia de
carência antes da coleta; apagar o cadastro remove todas as imagens da conta.

Todos os acessos aos dados verificam sessão e conta esperada. Gravações validam
a origem, o tamanho do pedido e os dados; tentativas de login e cadastro usam
o limitador compartilhado do banco. Escritas incluem a revisão esperada para
evitar a substituição silenciosa de dados de outro aparelho.

## Verificação

`npm test` compila e roda os testes existentes, o ciclo completo das rotas de
conta em Postgres isolado (PGlite) e os testes de armazenamento e sincronização.
`npm run test:e2e -- tests/e2e/accounts.spec.ts` exercita dois contextos de
navegador com essas mesmas rotas e um banco de teste, sem usar dados reais.
Os testes cobrem senha incorreta, cookie, isolamento, imagens, conflito de
revisões, recuperação, saída, exclusão e retomada da limpeza de arquivos.

Referências da integração: [Better Auth com Drizzle](https://better-auth.com/docs/adapters/drizzle),
[sessões](https://better-auth.com/docs/concepts/session-management) e
[integração com Next.js](https://better-auth.com/docs/integrations/next).
