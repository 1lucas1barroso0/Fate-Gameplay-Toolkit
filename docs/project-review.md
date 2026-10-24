# Revisão do Fate Gameplay Toolkit — 24/10/2026

Base examinada: main em 1d7f3c5502dbaefa76fd0c33305168e8df705150, publicado na Vercel.
A revisão cobre código, automação e registros disponíveis; não equivale a teste de invasão ou observação de todas as sessões reais.

## Forças a preservar

- Conta opcional e espaço local separado: a pessoa pode começar a jogar sem cadastro.
- Sincronização com revisão e combinação de alterações; conflitos pedem decisão, em vez de substituir silenciosamente.
- Conta, sessão e imagens verificam o espaço esperado; saída sem conexão preserva o trabalho.
- Mesas exigem aprovação; arquivos são privados e exclusões usam fila durável.
- Conteúdo bilíngue, fontes e modos de leitura identificados; capítulos são carregados separadamente e há caches limitados.
- Backups exportam as imagens atuais e a importação preserva os originais.
- Limites de pedidos compartilhados entre instâncias, quotas de armazenamento, paginação e manutenção limitada.
- Testes já cobrem autorização, recuperação de conta, exclusão, sincronização, uploads e linguagem da interface.

## Fraquezas e reforços desta revisão

| Achado | Reforço | Verificação |
| --- | --- | --- |
| A comparação de backups recalculava o conteúdo de cada ficha local para cada ficha recebida, inclusive imagens grandes. | Calcular cada impressão local uma vez e indexar os identificadores. Preservar a ordem e as decisões de copiar ou ignorar. | Testes de entradas em lote, não mutação e contagem de leituras locais. |
| Os testes de navegador existiam, mas não eram executados no fluxo automático. | Executar Chromium nos projetos desktop e mobile após lint, build e testes; guardar evidências de falhas por sete dias. | Resultado do GitHub Actions desta revisão. |
| Faltava proteção explícita contra enquadramento em páginas de terceiros. | X-Frame-Options DENY e CSP para impedir frames, objetos, alteração externa da URL-base e envio de formulários a outra origem. | Teste HTTP no navegador e carregamento da página. A política não restringe scripts nem constitui proteção completa contra XSS. |
| Não havia uma tela própria de recuperação para erros de renderização da página. | Mensagem curta em PT/EN, tentar novamente e recarregar; diagnóstico local somente com consentimento, sem texto privado do erro. | Compilação e lint. Não cobre falhas do layout raiz. |
| README ainda dizia que apenas Mesas usavam o servidor e que backups guardavam só referências das imagens. | Documentar contas opcionais, separação de espaços, exportação com imagens e limites de exclusão/recuperação. | Confronto com implementações de exportação, contas e armazenamento. |
| Não havia configuração de acompanhamento de dependências. | Solicitar revisões mensais de npm e Actions, com propostas limitadas e sem aprovação automática. | Leitura da configuração; propostas dependem do serviço do GitHub. |

## Oportunidades priorizadas

1. Tornar a primeira sessão mais simples, com ações contextuais curtas, mantendo as opções avançadas disponíveis.
2. Adicionar verificação de e-mail e uma alternativa de recuperação após definir provedor, domínio e custo; não apresentar esses recursos como existentes.
3. Medir tamanho das buscas, tempo de importação e carregamento em dispositivos modestos antes de acrescentar bibliotecas ou refazer o visual.
4. Exercitar periodicamente a restauração de backups e a limpeza após indisponibilidade dos serviços.
5. Separar migrações do primeiro pedido se volume e latência justificarem. Hoje o banco é preparado de forma idempotente em tempo de execução.
6. Definir a licença do código próprio com o titular. As atribuições dos livros não definem automaticamente a licença da aplicação.

## Ameaças e limites que permanecem

| Ameaça | Proteção existente ou adicionada | Limite real |
| --- | --- | --- |
| Perda do dispositivo, limpeza do navegador ou armazenamento cheio | Exportação com imagens, lembretes opcionais, quotas e modo com conta | Dados locais ainda exigem cópia fora do navegador. |
| Duas pessoas ou dispositivos editarem ao mesmo tempo | Revisões, combinação de mudanças e decisão para conflitos | Falhas de rede podem adiar a sincronização. |
| Tentativas de acesso ou abuso de armazenamento | Limites compartilhados, sessão, aprovação e quotas | Não impedem todo ataque distribuído ou indisponibilidade do fornecedor. |
| Conta registrada com e-mail de outra pessoa | Recuperação por chave, senhas e sessões protegidas | E-mail ainda não é verificado; perder senha e chave impede a recuperação automática. |
| Uso em dispositivo compartilhado | Espaços separados e saída da conta | Sair mantém cache, como solicitado; o perfil do navegador não é um cofre criptografado. |
| Exclusão durante falha do serviço de arquivos | Fila durável e nova tentativa | Remoção física pode terminar depois; exportações externas não são apagadas pelo site. |
| Dependência comprometida ou mudança incompatível | Lockfile, testes e acompanhamento de versões | Uma atualização proposta ainda precisa de revisão; não houve varredura de vulnerabilidades nesta revisão. |
| Confusão de licença ou conteúdo | Fontes, atribuições e distinção entre texto aberto e síntese editorial | Cada material novo precisa de verificação de seus próprios termos. |
| Interface sobrecarregada ou lenta | Carregamento por capítulo, caches limitados e comparação de backup otimizada | Não foi executada uma auditoria visual completa de todas as combinações nesta revisão. |

## Evidências e critérios de conclusão

- O deploy inicial da revisão estava READY e correspondia à main examinada.
- A consulta de erros de execução dos sete dias anteriores não retornou grupos de erros. Isso não comprova ausência de problemas de uso.
- Os cinco fluxos automáticos anteriores consultados estavam concluídos com sucesso.
- Os reforços desta revisão devem passar por lint, compilação, testes e navegação automatizada antes de entrar em produção.
- As mudanças não adicionam coleta remota de dados, serviços pagos ou dependências de execução.

## Referências do projeto

- docs/accounts-review.md
- lib/workspace-sync.ts e lib/workspace-storage.ts
- lib/server/request-limits.ts e lib/server/account-lifecycle.ts
- lib/server/rooms.ts e lib/storage-policy.ts
- components/storage-settings.tsx e components/backup-settings.tsx
- .github/workflows/ci.yml e playwright.config.ts
