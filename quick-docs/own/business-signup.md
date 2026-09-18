---
outline: false
---

# Business Signup

How to sign up a new business with the OWN acquirer.

## Signup payload

You can sign up a new business through the `/cadastrarConveniada` endpoint.
The following table describes every field and the model from which its value
can be obtained.

| Field                                 | Required | Deprecated | Details                                                                                                                         | Model                                     |
| ------------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `cnpj`                                | Yes      | No         | CNPJ or CPF                                                                                                                     | `business.document`                       |
| `identificadorCliente`                | Yes      | No         | Single string with all subsequent fields separated by forward slashes                                                           | —                                         |
| `identificadorCliente.CNPJ_CPF`       | Yes      | No         | CNPJ or CPF                                                                                                                     | `business.document`                       |
| `identificadorCliente.EXTERNAL_ID`    | Yes      | No         | Business ID in our database                                                                                                     | `own_business`                            |
| `identificadorCliente.NOME_OPERACAO`  | Yes      | No         | Operation name, if needed, or CNPJ of the White Label partner                                                                   | Hardcoded: `37924499000133`               |
| `identificadorCliente.EMAIL`          | Yes      | No         | Signatory email                                                                                                                 | `own_business`                            |
| `identificadorCliente.CPF`            | Yes      | No         | Signatory CPF                                                                                                                   | `own_business`                            |
| `identificadorCliente.NOME_PESSOA`    | Yes      | No         | Signatory name                                                                                                                  | `own_business`                            |
| `razaoSocial`                         | Yes      | No         | Business legal name                                                                                                             | `business.name`                           |
| `nomeFantasia`                        | Yes      | No         | Business trade name; for CPFs, repeat the name                                                                                  | `business.trade_name`                     |
| `cnae`                                | Yes      | No         | Business CNAE                                                                                                                   | `own_business.own_activities.cnae`        |
| `ramoAtividade`                       | Yes      | No         | CNAE description                                                                                                                | `own_business.own_activities.description` |
| `faturamentoPrevisto`                 | Yes      | No         | Forecasted revenue                                                                                                              | `own_business`                            |
| `email`                               | Yes      | No         | Business email                                                                                                                  | `business.email`                          |
| `dddComercial`                        | Yes      | No         | Business landline area code: the first two digits of the landline number. If there is no landline, repeat the mobile area code. | `business.landline`                       |
| `telefoneComercial`                   | Yes      | No         | Business landline number. If there is no landline, repeat the mobile number.                                                    | `business.landline`                       |
| `cep`                                 | Yes      | No         | ZIP code                                                                                                                        | `own_business`                            |
| `logradouro`                          | Yes      | No         | Street                                                                                                                          | `own_business`                            |
| `numeroEndereco`                      | Yes      | No         | Street number                                                                                                                   | `own_business`                            |
| `bairro`                              | Yes      | No         | Neighborhood                                                                                                                    | `own_business`                            |
| `municipio`                           | Yes      | No         | City                                                                                                                            | `own_business`                            |
| `uf`                                  | Yes      | No         | State                                                                                                                           | `own_business`                            |
| `dddCel`                              | Yes      | No         | Mobile area code: the first two digits of the business phone number                                                             | `business.phone`                          |
| `telefoneCelular`                     | Yes      | No         | Mobile phone number                                                                                                             | `business.phone`                          |
| `responsavelAssinatura`               | Yes      | No         | Signatory name                                                                                                                  | `own_business`                            |
| `quantidadePos`                       | Yes      | No         | Quantity of POS devices                                                                                                         | `own_business`                            |
| `faturamentoContratado`               | Yes      | No         | Contract revenue                                                                                                                | `own_business`                            |
| `antecipacaoAutomatica`               | Yes      | No         | Anticipation. Options: `S`, `N`                                                                                                 | `own_business.own_plan`                   |
| `mcc`                                 | Yes      | No         | MCC (Merchant Category Code)                                                                                                    | `own_business.own_activities.mcc`         |
| `tipoContrato`                        | Yes      | No         | Contract type. Option: `W`                                                                                                      | Hardcoded: `W`                            |
| `cnpjParceiro`                        | Yes      | No         | CNPJ of the White Label partner                                                                                                 | Hardcoded: `37924499000133`               |
| `idCesta`                             | Yes      | No         | Basket ID                                                                                                                       | `own_business.own_plan`                   |
| `tarifacao`                           | Yes      | No         | Fees; all should be submitted if any fee is modified                                                                            | `own_business.own_plan`                   |
| `tarifacao.id`                        | Yes      | No         | Fee ID                                                                                                                          | `own_business.own_plan`                   |
| `tarifacao.valor`                     | Yes      | No         | Fee value                                                                                                                       | `own_business.own_plan`                   |
| `codBanco`                            | Yes      | No         | Bank code                                                                                                                       | `own_bussiness`                           |
| `agencia`                             | Yes      | No         | Bank branch                                                                                                                     | `own_business`                            |
| `digAgencia`                          | Yes      | No         | Bank branch digit                                                                                                               | `own_business`                            |
| `numConta`                            | Yes      | No         | Bank account number                                                                                                             | `own_business`                            |
| `digConta`                            | Yes      | No         | Bank account digit                                                                                                              | `own_business`                            |
| `documentosSocios`                    | Yes      | No         | Business partner documents                                                                                                      | `own_business`                            |
| `documentosSocios.identificacao`      | Yes      | No         | Business partner CPF                                                                                                            | `own_business`                            |
| `documentosSocios.anexos`             | Yes      | No         | Business partner attachments                                                                                                    | `own_business`                            |
| `documentosSocios.anexos.nomeArquivo` | Yes      | No         | File name                                                                                                                       | `own_business`                            |
| `documentosSocios.anexos.conteudo`    | Yes      | No         | Base64-encoded file                                                                                                             | `own_business`                            |
| `documentosSocios.anexos.tipo`        | Yes      | No         | Attachment type. Options: `RGFRENTE`, `RGVERSO`, `CPF`, `CNH`, `COMPROVANTE_ENDERECO`                                           | `own_business`                            |
| `anexos`                              | Yes      | No         | Contract attachments                                                                                                            | `own_business`                            |
| `anexos.nomeArquivo`                  | Yes      | No         | Attachment name                                                                                                                 | `own_business`                            |
| `anexos.conteudo`                     | Yes      | No         | Base64-encoded file                                                                                                             | `own_business`                            |
| `anexos.tipo`                         | Yes      | No         | Attachment type. Options: `COMPROVANTE_ENDERECO`, `CONTRATO_SOCIAL`, `TERMO_ADESAO`                                             | `own_business`                            |
| `urlCallback`                         | No       | No         | Callback URL for status updates                                                                                                 | Not used                                  |
| `complemento`                         | No       | No         | Address line 2                                                                                                                  | `own_business`                            |
| `taxaAntecipacao`                     | Yes      | No         | Anticipation fee; send `0` when `antecipacaoAutomatica` is `N`                                                                  | `own_business.own_plan`                   |
| `tipoAntecipacao`                     | No       | No         | Anticipation type. Options: `ROTATIVO`, `SEMANAL`, `MENSAL`, `QUINZENAL`                                                        | `own_business.own_plan`                   |
| `protocoloCore`                       | No       | No         | Protocol number used to retry after a failed signup                                                                             | `own_business`                            |
| `numeroContrato`                      | No       | No         | Contract number used to update the contract                                                                                     | `own_business`                            |
| `cnpjCanalWL`                         | No       | No         | White Label partner channel CNPJ                                                                                                | Not used                                  |
| `outrosMeiosCaptura`                  | No       | No         | List of other capture methods to enable                                                                                         | —                                         |
| `outrosMeiosCaptura.meioCaptura`      | No       | No         | Capture method. Option: `ECOMMERCE`                                                                                             | Not used                                  |
| `hashAceite`                          | Yes      | Yes        | Deprecated                                                                                                                      | Hardcoded: `"X"`                          |
| `codConfiguracao`                     | Yes      | Yes        | Deprecated                                                                                                                      | Hardcoded: `" "`                          |
| `cnpjOrigem`                          | No       | Yes        | Deprecated                                                                                                                      | Hardcoded: `" "`                          |

### Anticipation fee is always required

Always include the top-level `taxaAntecipacao` field, even when automatic
anticipation is disabled:

```json
{
  "antecipacaoAutomatica": "N",
  "taxaAntecipacao": 0
}
```

When automatic anticipation is enabled (`S`), send the configured anticipation
fee. In a registration request tested on 2026-09-08, omitting `taxaAntecipacao`
with anticipation disabled caused HTTP 400 with
`Cannot invoke "java.math.BigDecimal.compareTo(java.math.BigDecimal)" because "valorPct" is null`.
Adding `taxaAntecipacao: 0` resolved that error. `valorPct` is an internal error
variable, not an additional request field.

### Managed Fields

Some data is obtained in the backend instead of the POST request payload.

**Address Fields** \
From the provided `cep`, which is is the zipcode we fetch Brasil API for address data. The return schema is as follows:

```json
GET https://brasilapi.com.br/api/cep/v1/:cep

{
	"cep": "12244867",
	"state": "SP",
	"city": "São José dos Campos",
	"neighborhood": "Urbanova",
	"street": "Rua Milton Martins",
	"service": "open-cep",
	"ibge": {
		"city": "3549904",
		"state": "35"
	}
}
```

Number and address line 2 are still provided by the user
