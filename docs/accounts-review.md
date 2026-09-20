# Revisão de contas e interface

Escopo: implementação atual de cadastro, acesso, saída, recuperação, troca de
senha, sincronização, imagens, vínculos com Mesas e exclusão. Revisão do código
com testes locais e banco isolado, sem acessar dados de usuários em produção.

| Área | Avaliação e resultado |
| --- | --- |
| Pontos fortes | Conta opcional; modo local preservado; dados e imagens separados por conta; senhas com hash; cookies HttpOnly e Secure em HTTPS; edição independente combinada; conflitos exigem escolha; exclusão transacional com limpeza durável de arquivos. |
| Pontos fracos corrigidos | Saída bloqueada por falhas de sincronização; respostas atrasadas durante a troca de conta; imagens que terminavam de gravar no espaço seguinte; chave antiga após troca de senha; acessos às Mesas dependentes apenas do token; importação de vínculos antes de aceitar a revisão; pedidos JSON inválidos tratados como falhas do serviço. |
| Oportunidades aproveitadas | Seletor de idioma mais leve e acessível; “dispositivo” em todos os textos da interface; menos consultas e transferência quando nada mudou; pausa fora de uso; espera progressiva após falhas; limpeza e limite de sessões; confirmação da senha também na recuperação. |
| Ameaças tratadas | Mistura de dados entre contas/abas; perda de mudanças sem conexão; restauração automática após saída sem rede; uso de sessões e chaves antigas; acesso a Mesas após revogação; sobrescrita de revisões; importação incompleta; tentativas repetidas; pedidos de outro site; arquivos órfãos após exclusão. |

## Correções aplicadas

- O seletor do topo tem fundo discreto apenas na opção ativa, sem a caixa e as
  bordas sobrepostas. Os alvos de toque têm pelo menos 44 px; o foco de teclado
  e os idiomas das opções continuam identificados.
- Sair tenta sincronizar e preserva mudanças pendentes no cache da mesma conta.
  Se o dispositivo estiver sem conexão, a saída fica registrada e sobrevive ao
  recarregamento. A sessão do servidor só pode ser revogada ao reconectar.
- Operações de autenticação e saída usam o bloqueio de abas do navegador quando
  disponível. A conta esperada é verificada no servidor; uma saída antiga não
  encerra outra conta que entrou depois.
- Receber dados de outra aba não regrava uma cópia antiga sobre uma edição nova.
  Salvamentos pendentes também ignoram estados já substituídos por uma atualização.
- Cada troca de espaço invalida operações pendentes. Imagens conferem o espaço
  antes de gravar; a sincronização ignora respostas de uma sessão anterior.
- Trocar a senha exige a senha atual. A gravação da nova senha, a revogação das
  outras sessões e a invalidação da chave anterior ocorrem juntas. Novas senhas
  exigem 15 caracteres; o acesso com senhas já existentes permanece disponível.
- A chave de recuperação continua de uso único. O diálogo pede que a pessoa
  confirme que a guardou; recuperar a conta também exige repetir a nova senha.
- Acesso e emissão de autorização de upload para Mesas vinculadas exigem a
  sessão da conta dona do vínculo. Mesas sem vínculo continuam no modo local.
- Importar uma Mesa e salvar a revisão usam a mesma transação. Revisões
  rejeitadas não transferem vínculos. Importações concorrentes verificam a
  propriedade antes de gravar.
- A API de autenticação aceita somente operações e campos necessários à
  interface. As respostas de entrada/cadastro não incluem o token de sessão.
- Consultas sem mudanças retornam 204 usando a revisão; o JSON não é carregado.
  A consulta periódica passou de 15 para 30 segundos e pausa em abas ocultas ou
  sem conexão. Há espera progressiva e respeito ao prazo de novas tentativas.
- Cada entrada limpa sessões expiradas e limita a conta a 20 sessões ativas.

## Limites e riscos que permanecem

- **Identidade e recuperação:** o e-mail ainda não é verificado e não há envio
  de mensagens. Um endereço pode ser cadastrado por quem não o controla. O
  cadastro com entrada automática pode revelar se um endereço já está em uso.
  Recuperar acesso depende da chave; perder senha e chave não tem recuperação
  automática. Verificação de e-mail, passkeys ou segundo fator são melhorias
  futuras; não foram simuladas nem apresentadas como existentes.
- **Dispositivo compartilhado:** sair não apaga o cache, conforme solicitado.
  Quem controla o perfil do navegador ou o sistema pode inspecionar seus dados.
  Não há criptografia ponta a ponta nem proteção contra um dispositivo já
  comprometido. Use perfis separados quando esse isolamento for necessário.
- **Disponibilidade e abuso:** limites de pedidos e espaço reduzem abuso, mas
  não garantem disponibilidade contra ataques distribuídos. Banco, hospedagem
  e serviço de arquivos continuam sujeitos a falhas e limites próprios.
- **Exclusão:** arquivos externos pendentes de remoção exigem o serviço voltar
  a responder. Caches em dispositivos fechados são tratados no próximo acesso;
  backups ou exportações guardados fora do site não podem ser apagados por ele.
- **Verificação:** os testes não equivalem a um teste de invasão externo, a uma
  auditoria independente ou a garantia contra qualquer ataque futuro.

## Critérios e evidências

Os testes exercitam sessões e cookies, senha incorreta, recuperação de uso
único, invalidação após troca de senha, isolamento de imagens e contas,
revisões incompatíveis, importação rejeitada sem vínculo, revogação do acesso
às Mesas, saída sem rede, retomada, múltiplas abas e exclusão com limpeza pendente.
O navegador verifica desktop e mobile, os temas claro/escuro e erros de execução.

A exigência de senha atual, o tratamento de sessões após eventos sensíveis e
o comprimento mínimo para novas senhas foram confrontados com as recomendações
da [OWASP sobre autenticação](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).
Os limites da saída sem conexão e da proteção no navegador foram avaliados
à luz da [OWASP sobre sessões](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
As limitações de e-mail sem verificação e cadastro com entrada automática são
descritas na [documentação do Better Auth](https://better-auth.com/docs/authentication/email-password).
