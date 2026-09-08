# Política de armazenamento

O Fate Gameplay Toolkit foi desenhado para permanecer utilizável nos recursos gratuitos do navegador, do Vercel Blob e do Neon. Nenhum fluxo básico depende de plano pago, trial ou cobrança futura.

## Limites confirmados e margens

As cotas de referência são as publicadas para [Vercel Blob no plano Hobby](https://vercel.com/docs/vercel-blob/usage-and-pricing) e [Neon no plano Free](https://neon.com/docs/introduction/plans). A aplicação usa apenas 75% das cotas compartilhadas como limite operacional, deixando margem para reconciliação, limpeza e mudanças futuras.

| Área | Cota gratuita de referência | Limite do Toolkit | Aviso |
| --- | ---: | ---: | ---: |
| Vercel Blob, armazenamento do projeto | 1 GB-mês | 750 MB | margem incorporada |
| Vercel Blob, operações simples em 30 dias | 10.000 | 7.500 | bloqueio seguro antes da cota |
| Vercel Blob, operações avançadas em 30 dias | 2.000 | 1.500 | bloqueio seguro antes da cota |
| Vercel Blob, transferência em 30 dias | 10 GB | 7,5 GB | bloqueio seguro antes da cota |
| Neon, banco do projeto | 0,5 GB | novas gravações param em 375 MB | 300 MB |
| Arquivos por Mesa | compartilhado | 100 MB e 100 arquivos | 75 MB |
| Arquivo individual | compartilhado | 50 MiB | validação antes do envio |

Os contadores de operações e transferência usam uma janela móvel de 30 dias. Seus registros expiram após 45 dias. Operações reparativas podem usar a margem entre 75% e a cota gratuita para que uma limpeza não fique impedida justamente quando for necessária.

## Dados deste dispositivo

- Fichas, regras, preferências e Mesas lembradas usam `localStorage`; coleções grandes têm limites explícitos ou exclusão seletiva.
- Imagens de Fichas ficam como `Blob` imutável no IndexedDB. O JSON da Ficha guarda somente uma referência, enquadramento e descrição.
- Imagens iguais compartilham o mesmo Blob por SHA-256. Undo e backup compartilham a referência e não copiam os bytes.
- Fichas antigas com imagem Base64 são migradas automaticamente e de forma idempotente. O original só é substituído depois da confirmação no IndexedDB; se a migração falhar, ele permanece recuperável.
- A coleta de lixo preserva referências da versão atual, do backup e do Undo. Imagens realmente órfãs podem ser removidas nas configurações.
- O histórico local de rolagens mantém no máximo 100 itens; o Undo mantém 30 estados.
- URLs temporárias, timers e listeners são liberados após o uso.

A área **Seu Fate → Armazenamento** usa `navigator.storage.estimate()` quando disponível, identifica medições aproximadas, permite solicitar persistência ao navegador e oferece exportação e limpeza explícitas. Uma gravação grande é recusada antes de substituir dados válidos quando não existe reserva segura de espaço.

## Dados compartilhados

- O Histórico da Mesa é carregado em páginas de 100 itens e exportado como fluxo JSONL em páginas de 200; nunca é reunido por inteiro na memória do servidor.
- O narrador pode apagar somente a parte antiga do Histórico, após exportá-la se desejar. Não existe retenção curta automática para campanhas.
- Arquivos privados passam por validação de tamanho, quantidade, espaço da Mesa, espaço do projeto e uso móvel da cota antes do envio.
- A confirmação tardia de upload repete todas as validações sob uma trava global. Um Blob que já chegou mas não pode ser publicado entra na limpeza durável.
- Excluir um arquivo remove seu registro e enfileira a exclusão física. Excluir uma Mesa remove participantes, Histórico, reservas e referências por cascata, além de enfileirar todos os Blobs.
- A fila de limpeza é idempotente, justa entre tentativas e sempre aguardada pela função serverless. Falhas permanecem registradas para a próxima manutenção.
- Mesas excluídas deixam uma lápide por 30 dias e recebem até sete revarreduras espaçadas, capturando callbacks ou Blobs tardios sem atingir uma nova Mesa com o mesmo código.
- O narrador pode procurar órfãos antigos manualmente. Um período de segurança impede a remoção de uploads ainda em trânsito.
- Reservas abandonadas, participantes pendentes e registros operacionais têm retenção finita. Autores rejeitados só são removidos quando nenhuma entrada ainda depende deles.

Ao se aproximar de qualquer limite, a aplicação preserva o estado anterior, informa o motivo e orienta exportar ou limpar. Nenhuma falha de quota é tratada como sucesso e nenhuma credencial ou URL privada é enviada ao cliente.
