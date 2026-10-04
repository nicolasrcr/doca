# Perguntas para a franqueada J&T

Oi! Estou construindo uma plataforma em que o franqueado J&T importa os arquivos que já exporta do JMS e vê, num painel simples, a saúde da operação: farol verde/amarelo/vermelho por base, motoristas, rotas, coleta e sugestões do que melhorar. Já funciona com os arquivos que você me passou (Monitoramento de bipagem de entrega e Carta de porte). Para acertar o que falta, preciso da sua experiência. Responda o que souber, em áudio ou texto; as marcadas com ⭐ são as mais importantes. Os blocos 7 e 9 (contrato e rastreadores) podem ficar para depois.

## 1. Os relatórios do JMS

1. ⭐ Quais relatórios você exporta no dia a dia e qual o caminho no menu do JMS para cada um? (Preciso do nome exato e do passo a passo.)
2. ⭐ Existe algum relatório que traga o **bairro, distrito, cidade ou CEP do destinatário** de cada pedido? Qual o nome? Hoje os dois que tenho não trazem, e sem isso não consigo mostrar quais bairros/rotas perdem mais entregas.
3. ⭐ Quando o franqueado tem **várias bases**, como ele exporta? Um arquivo por base, ou um arquivo só com todas? Dá para escolher a base ou o período na hora de exportar?
4. ⭐ O arquivo vem em .xlsx ou .xls? Muda de acordo com o relatório ou com a versão do JMS?
5. Qual o período máximo que dá para exportar de uma vez (um dia, uma semana, um mês)? Há limite de linhas?
6. Existe relatório de **coleta** (pickup)? Quais colunas ele traz? E de **devoluções**, **pacotes parados** (aging) e **reentregas**?
7. Existe alguma forma oficial de integração (API ou exportação automática) com o JMS, ou é sempre manual?

## 2. Como ler os dados (para eu não calcular errado)

8. ⭐ Na Carta de porte, o pedido só aparece quando foi **entregue**? Um pacote que está na bipagem e não está na Carta de porte é "não entregue"?
9. ⭐ O que significa cada horário? Na bipagem, "Tempo de entrega" é a hora em que o pacote saiu da base, foi atribuído ao motorista ou foi bipado na carga? "Horário da entrega" é a baixa feita pelo motorista no app? "Tempo de digitação" e "Data e hora de criação" são o quê?
10. ⭐ Qual é a regra real do **prazo (SLA)**? Hoje assumo 24 horas. Muda por tipo de produto, por região ou por tipo de serviço?
11. Um pacote que falhou ontem e foi entregue hoje aparece em qual dia? E quando há várias tentativas, como aparece?
12. Como diferenciar no relatório um pacote **retido na base**, **em devolução** e **com problema**? Quais colunas indicam cada um?
13. Qual a lista completa de **motivos de problema** da J&T? Quais dependem da franquia (motorista, rota) e quais dependem do remetente ou do destinatário?

## 3. O que é uma base "saudável"

14. ⭐ Quando você olha para a base e pensa "está tudo bem", o que você olha? Em que ordem de importância?
15. ⭐ Quais **metas** você usa para cada indicador? Por exemplo: % de entrega, % de problemas, prazo, coleta, devolução. Qual percentual é verde, qual é amarelo e qual é vermelho para você?
16. ⭐ A J&T avalia as franquias (nota, score, ranking, multa, bonificação)? Como isso é calculado e quais indicadores entram? Dá para ver esse número no JMS?
17. Hoje uso estes limites de partida. Eles fazem sentido? Entrega abaixo de 95% já é alerta? Prazo abaixo de 90%? Coleta abaixo de 95%? Mais de 3% de problemas? Mais de 3% de retidos ou devolução? Entrega depois das 20h é problema? Mais de 4 horas entre sair da base e a 1ª entrega é problema? Motorista com o dobro do ritmo da base é suspeito?
18. O que costuma ser causa de queda de resultado numa base? (Motorista novo, chuva, volume alto, rota mal montada, falta de aviso ao cliente…)

## 4. Rotas, motoristas e horários

19. ⭐ Como a base monta as **rotas** hoje? São fixas por motorista, por bairro ou por CEP, ou mudam todo dia? Quem decide e com base em quê?
20. ⭐ Quando você decide **trocar um motorista de rota** ou **redistribuir carga**, o que você olha? Que sugestão do sistema te ajudaria de verdade?
21. Quantos pacotes por dia é normal para um motorista? Isso muda com moto, carro, van ou ajudante?
22. Qual o horário normal de chegada da carga, de saída das rotas e de término da operação? Entrega noturna é permitida ou evitada?
23. Como você acompanha motorista que sai tarde ou demora para fazer a primeira entrega?
24. Como é a **coleta**: clientes fixos, horários combinados, quem faz? O que indica que a coleta está indo mal?

## 5. Pessoas e acessos

25. ⭐ Quem usa o sistema numa franquia? Dono, gerente da base, supervisor, financeiro, motorista? O que cada um precisa ver e o que **não** deve ver (por exemplo, pagamentos)?
26. ⭐ Quando há várias bases, quem acompanha todas? O dono? Um gerente geral? Cada base tem o seu gerente?
27. Os motoristas e funcionários são compartilhados entre bases?
28. Como funciona o pagamento dos motoristas (por entrega, por bairro, por dia)? Há acréscimos em dias especiais e descontos? Com que frequência fecha (semanal, quinzenal)?

## 6. Avisos e rotina

29. Que **alertas** você gostaria de receber e por onde (WhatsApp, e-mail, no sistema)? Em que horário?
30. Você gostaria de um **resumo diário ou semanal** pronto para mandar para o dono ou para a J&T?
31. Quer comparar as suas bases entre si? E com a média da região ou da J&T, se existir esse dado?
32. Quantos meses de histórico valem a pena importar no começo?

## 7. Cuidados com dados e contrato

33. ⭐ Os arquivos têm nome de motorista e de quem assinou a entrega. O contrato de franquia ou a J&T tem regra sobre compartilhar ou usar esses dados em ferramentas externas?
34. Você acha que a J&T veria esse tipo de plataforma como parceira ou como problema?

## 8. Negócio

35. O que você usa hoje para acompanhar a base? Planilhas? Qual parte dá mais trabalho?
36. Quantos franqueados você conhece que usariam isso? Quantas bases cada um costuma ter?
37. Quanto um franqueado pagaria por mês por isso? Por base ou por franquia?
38. O que faria um franqueado dizer "não preciso disso"?

## 9. Rastreadores e mapa (opcional, para uma etapa futura)

Quero avaliar um painel com o trajeto dos carros no mapa, cruzando com os horários do JMS, para dar mais controle ao gerente e ao dono. Isso só vale a pena se os clientes já tiverem rastreador.

39. ⭐ Quais franqueados já têm **rastreador** nos carros e de que marca ou plataforma (Sascar, Omnilink, Ituran, Cobli, Traccar, outra)?
40. ⭐ Dá para **exportar o histórico** do rastreador em CSV, GPX ou planilha? Qual o nome do relatório e quais colunas ele traz (placa, horário, latitude, longitude, velocidade)?
41. A plataforma do rastreador tem **API aberta** ou só tela e exportação? Quem é o contato para liberar o acesso?
42. Quem usaria o painel: o dono, o gerente, os dois? Para qual decisão (cobrar horário de saída, achar parada longa, comprovar entrega, reduzir km)?
43. O rastreador fica no **carro** ou no **celular do motorista**? Um mesmo carro é usado por mais de um motorista no dia?
44. O motorista é **avisado** de que o carro é rastreado? Existe documento assinado ou cláusula no contrato dele?
45. Hoje os clientes olham o rastreador para quê? O que sentem falta nele?

## 10. Arquivos que me ajudam muito

Se puder, sem dados que identifiquem pessoas (ou com os nomes trocados):
- Um dia de cada relatório que você exporta, de uma base que teve **dia ruim** (para eu ver os problemas aparecendo).
- O relatório de **coleta** e qualquer relatório que traga **bairro ou CEP**.
- Um exemplo de franqueado com **mais de uma base**, para eu ver como o arquivo vem.
- Prints das telas do JMS onde você baixa cada relatório (com o caminho do menu visível).
- Um arquivo de exemplo exportado de um **rastreador** (um carro, um dia), com a placa trocada se preferir.

Obrigado!
