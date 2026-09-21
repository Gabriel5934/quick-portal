# Cestas

Cestas são grupos de produtos, onde produto é uma forma de pagamento acompanhadas da taxa cobrada pela OWN.
Para a Quick estão disponíveis duas cestas: Cesta por Parcela e Cesta por Bandeira.

## Na API da OWN

Todos os produtos de todas as cestas são retornados sem paginação pelo seguinte endpoint:

> /consultarCesta

```json
{
  "cestaId": 333,
  "nomeCesta": "CESTA DE SERVICO - POR PARCELA",
  "cestaValorId": 297116,
  "produto": "CREDITO PARCELADO 02X VISA E-COMMERCE",
  "valor": 3.3,
  "faixaInicial": 0,
  "valorMinimo": 3.3
}
```

`cestaId` e `nomeCesta` - Identificam a cesta. 333 para a cesta por parcela e 117 para a cesta por bandeira

`cestaValorId` - id do produto específico dentro da cesta

`produto` - a qual tipo de pagamento e canal a taxa se aplica. Inclui se é crédito, débito ou pix, a bandeira, o parcelamento e indica se se trata
de uma taxa para e-commerce. Esse campo costuma ser
inconsistente, alternando por exemplo a forma de escrever o nome das bandeiras (alternando entre "master" e "mastercard").

Quando o canal é físico, essa informação é omitida no campo `produto`.

`valor`, `faixaInicial` e `valorMinimo` - valores referentes a taxa especîfica

## Cesta por bandeira

A cesta por bandeira traz as taxas para pagamentos parcelados em patameres.
Os patamares para todas as bandeiras começam em 2 parcelas com o primeiro patamar tendo 5 parcelas e os demais 6 parcelas.
A única diferença entre as bandeiras acontece no último patamar onde as bandeiras Visa e Mastercard vão até 24 parcelas,
enquanto a bandeira ELO vai apenas até 21 parcelas.

| Visa, Master | Elo |
| --- | --- |
| Débito | Débito |
| Crédito à vista | Crédito à vista |
| 2x - 6x | 2x - 6x |
| 7x - 12x | 7x - 12x |
| 13x - 18x | 13x - 18x |
| **19x - 24x** | **19x - 21x** |

Todos os patamares tem uma taxa específica para o canal físico e o canal digital, sendo assim temos para os pagamentos
parcelados `24 taxas` (4 patamares \* 3 bandeiras \* 2 canais)

Além dos pagamentos parcelados a cesta também traz as taxas de pagamentos por débito e crédito à vista para todas
as 3 bandeiras e os 2 canais. Totalizando assim mais `12 taxas` (2 formas de pagamento \* 3 bandeiras \* 2 canais)

Por fim a cesta traz as taxas de pagamentos que não são específicos de nenhuma bandeira nem canal:

- Pix
- Top Bank
- Visa Voucher
- 2 taxas para Aluguel de POS\*

Juntando essas `5 taxas` com as `24 taxas` de parcelamento mais as `12 taxas` de pagamentos à vista e débito, chegamos no número de `41 taxas`
para a cesta por bandeira.

> \* Provavelmente se trata de um error de duplicidade por parte da OWN. As duas taxas possuem IDs diferentes mas valores iguais.
> Na fase de credenciamento se faz necessário informar as duas taxas com o mesmo valor.

## Cesta por Parcela

A cesta por parcela possui mais taxas (140) porém é mais simples. A cesta traz uma taxa para cada quantidade de parcelas, começando em
1 parcela (não é a mesma coisa que crédito à vista) e terminando em 21 parcelas (aqui todas as bandeiras vão até o mesmo número de parcelas).

Além das 21 parcelas temos também taxas para pagamentos em:

- Débito
- Crédito à vista

Totalizando 23 formas de pagamento exclusivas de bandeiras e canais e `138 taxas` (23 formas \* 3 bandeiras \* 2 canais)

E duas formas de pagamentos que não são específicas de bandeira nem canal:

- Pix
- Aluguel de POS

Com esses dois chegamos no número de `140 taxas`.

## Na API da Quick

Na API do portal quick as taxas da OWN são retornadas pelo endpoint `/own/fees`. O seeding dessas taxas no banco de dados é feito
através do management command `load_own_fees` que espera um arquivo json com a resposta raw da own como o nome `load_consultar_cesta.json`
na raíz de `/app`.

As bandeiras, canais e métodos são valores de texto em `OwnFee`. A opção "Padrão" usada no formulário de planos é somente um atalho visual para preencher acréscimos iguais em várias bandeiras.

```json
{
  "id": 14965,
  "basketId": 117,
  "value": "0.0000000000",
  "baseMdr": "1.7900000000",
  "network": "Visa",
  "channel": "Physical",
  "method": "Debit",
  "installment": null,
  "upperInstallment": null
}
```

O endpoint autenticado `GET /own/baskets/{id}/anticipation-fee/` retorna a taxa de antecipação da cesta selecionada:

```json
{ "basketId": 117, "anticipation_fee": "1.2500000000" }
```
