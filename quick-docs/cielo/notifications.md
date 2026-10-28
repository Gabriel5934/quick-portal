# Cielo Notifications

Cielo will send notification to a configured URL via webhooks. The configured URL must utilize HTTPS and use the standard HTTPS port (443). The URL must be static and have a limit of 255 characters.

You can configure up to three key-value pairs that will be used as headers by the notification post.

Notifications are sent every 30 minutes, if it fails 3 new attempts are made. Cielo expects a 200 OK response.

There are two categories of notifications: onboarding and transaction. There are three onboarding notification types (Global, KYC and bank account) and ony one transaction notification type

## Onboarding

All three types of onboarding notifications are composed of three keys: MasterMerchantId, Data and ChangeType

| ChangeType | Notification            |
| ---------- | ----------------------- |
| 23         | Global                  |
| 21         | Bank Account Validation |
| 20         | KYC                     |

### Global

The onboarding status notification represent the global status of the seller onboarding. It is sent right after the KYC and bank account notifications. Because of that, only the second notification may return status 2 assuming that the onboarding was approved.

**Example Notification**

```json
{
  "ChangeType": 23,
  "MasterMerchantId": "96ffb8be-6693-4f9b-bf8e-925b555b3207",
  "Data": {
    "SubordinateMerchantId": "4d76b525-e66d-402e-a318-5fd3ce1af7aa",
    "OnboardingStatus": 2,
    "KycAnalysisInfo": {
      "Status": 2
    },
    "BankAccountValidation": {
      "Status": 3
    }
  }
}
```

| Key                               | Type   | Length |
| --------------------------------- | ------ | ------ |
| ChangeType                        | Number | 2      |
| MasterMerchantId                  | GUID   | 36     |
| Data.SubordinateMerchantId        | GUID   | 36     |
| Data.OnboardingStatus             | Number | 1      |
| Data.KycAnalysisInfo.Status       | Number | 1      |
| Data.BankAccountValidation.Status | Number | 1      |

| Data.OnboardingStatus | Description            |
| --------------------- | ---------------------- |
| 1                     | UnderAnalysis          |
| 2                     | Approved               |
| 3                     | AwaitingMerchantAction |
| 4                     | Unknown                |
| 5                     | Banned                 |

| Data.KycAnalysisInfo.Status | Description             |
| --------------------------- | ----------------------- |
| 1                           | UnderAnalysis           |
| 2                           | Approved                |
| 3                           | ApprovedWithRestriction |
| 4                           | Rejected                |

| Data.BankAccountValidation.Status | Description   |
| --------------------------------- | ------------- |
| 0                                 | InternalError |
| 1                                 | Created       |
| 2                                 | Processing    |
| 3                                 | Success       |
| 4                                 | Error         |

### KYC

**Example Notification**

```json
{
  "ChangeType": 20,
  "MasterMerchantId": "96ffb8be-6693-4f9b-bf8e-925b555b3207",
  "Data": {
    "SubordinateMerchantId": "4d76b525-e66d-402e-a318-5fd3ce1af7aa",
    "Status": 2
  }
}
```

| Key                        | Type   | Length |
| -------------------------- | ------ | ------ |
| ChangeType                 | Number | 2      |
| MasterMerchantId           | GUID   | 36     |
| Data.SubordinateMerchantId | GUID   | 36     |
| Data.Status                | Número | 1      |

| Data.Status | Description             |
| ----------- | ----------------------- |
| 1           | UnderAnalysis           |
| 2           | Approved                |
| 3           | ApprovedWithRestriction |
| 4           | Rejected                |

### Bank Account

**Example Notification**

```json
{
  "ChangeType": 21,
  "MasterMerchantId": "96ffb8be-6693-4f9b-bf8e-925b555b3207",
  "Data": {
    "MerchantId": "4d76b525-e66d-402e-a318-5fd3ce1af7aa",
    "MerchantType": "Subordinate",
    "Status": 3,
    "AccountNumber": "123",
    "AccountDigit": "1",
    "AgencyNumber": "3581",
    "AgencyDigit": "x",
    "CompeCode": "260",
    "BankAccountType": 1,
    "DocumentNumber": "45224563215",
    "DocumentType": 2
  }
}
```

| Key                  | Type           | Length | Options             |
| -------------------- | -------------- | ------ | ------------------- |
| ChangeType           | Number         | 2      |                     |
| MasterMerchantId     | GUID           | 36     |                     |
| Data.MerchantId      | GUID           | 36     |                     |
| Data.MerchantType    | String         | 14     | Subordinate, Master |
| Data.Status          | Number         | 1      |                     |
| Data.CompeCode       | Numeric String | 3      |                     |
| Data.BankAccountType | Number         | 1      |                     |
| Data.AccountNumber   | Numeric string | 10     |                     |
| Data.AccountDigit    | Numeric string | 1      |                     |
| Data.AgencyNumber    | Numeric string | 15     |                     |
| Data.AgencyDigit     | String         | 1      | Digit or "x"        |
| Data.DocumentNumber  | Numeric string | 14     |                     |
| Data.DocumentType    | Number         | 1      |                     |

| Data.BankAccountType | Description     |
| -------------------- | --------------- |
| 1                    | CheckingAccount |
| 2                    | SavingsAccount  |

| Data.Status | Description   |
| ----------- | ------------- |
| 0           | InternalError |
| 1           | Created       |
| 2           | Processing    |
| 3           | Success       |
| 4           | Error         |

| Data.DocumentType | Description |
| ----------------- | ----------- |
| 1                 | CPF         |
| 2                 | CNPJ        |

| Data.CompeCode | Bank Name                                      |
| -------------- | ---------------------------------------------- |
| 001            | Banco do Brasil                                |
| 003            | Amazônia - BASA                                |
| 004            | BNB                                            |
| 012            | BANCO INBURSA                                  |
| 021            | Est. ES - Banestes                             |
| 025            | Alfa                                           |
| 033            | Santander                                      |
| 037            | Est. PA - Banpará                              |
| 041            | Est. RS - Banrisul                             |
| 047            | Est. SE - Banese                               |
| 063            | BANCO BRADESCARD                               |
| 069            | Banco Crefisa                                  |
| 070            | BRB - Banco de Brasília                        |
| 077            | Banco Inter                                    |
| 081            | BANCOSEGURO S.A.                               |
| 082            | Banco Topázio                                  |
| 083            | BCO DA CHINA BRASIL S.A.                       |
| 084            | CC Uniprime Norte do Paraná                    |
| 085            | CC Cecred                                      |
| 089            | CC Região da Mogiana                           |
| 093            | POLOCRED SCMEPP LTDA.                          |
| 094            | Banco Finaxis                                  |
| 097            | CC Centralcredi                                |
| 099            | CC Uniprime Central                            |
| 102            | XP INVESTIMENTOS CCTVM S/A                     |
| 104            | Caixa Econômica Federal                        |
| 107            | BBM                                            |
| 120            | Rodobens                                       |
| 121            | BCO AGIBANK S.A.                               |
| 125            | BANCO GENIAL                                   |
| 130            | Scfi Caruana                                   |
| 133            | CRESOL CONFEDERAÇÃO                            |
| 136            | CC Unicred do Brasil                           |
| 149            | FACTA S.A. CFI                                 |
| 174            | PEFISA S.A. - C.F.I.                           |
| 195            | VALOR SCD S.A.                                 |
| 197            | STONE PAGAMENTOS S.A                           |
| 208            | BANCO BTG PACTUAL S.A                          |
| 212            | Banco Original                                 |
| 213            | Arbi                                           |
| 218            | Banco BS2                                      |
| 224            | Fibra                                          |
| 237            | Bradesco                                       |
| 243            | Banco Master                                   |
| 246            | ABC - Brasil                                   |
| 260            | NU PAGAMENTOS S.A (NUBANK)                     |
| 274            | Money Plus SCMEPP LTDA                         |
| 299            | BCO SOROCRED S.A. - BM                         |
| 301            | Dock Instituição de Pagamento S.A              |
| 318            | BCO BMG S.A.                                   |
| 320            | BCO CCB BRASIL S.A.                            |
| 323            | Mercado Pago                                   |
| 329            | QI SCD S.A.                                    |
| 330            | BANCO BARI S.A.                                |
| 335            | Banco Digio S.A.                               |
| 336            | Banco C6 S.A                                   |
| 341            | Itaú Unibanco                                  |
| 348            | BCO XP S.A.                                    |
| 359            | ZEMA CFI S/A                                   |
| 364            | GERENCIANET                                    |
| 368            | BCO CSF S.A.                                   |
| 376            | J. P. Morgan                                   |
| 380            | PICPAY                                         |
| 382            | FIDUCIA SCMEPP LTDA                            |
| 383            | JUNO                                           |
| 389            | Mercantil do Brasil                            |
| 394            | BCO BRADESCO FINANC. S.A.                      |
| 396            | HUB PAGAMENTOS                                 |
| 403            | CORA SCD S.A.                                  |
| 404            | SUMUP SCD S.A.                                 |
| 406            | ACCREDITO SCD S.A.                             |
| 413            | BCO BV S.A.                                    |
| 414            | WORK SCD S.A.                                  |
| 422            | Safra                                          |
| 435            | DELCRED SCD S.A.                               |
| 450            | FITBANK PAGAMENTOS ELETRONICOS S.A.            |
| 477            | CITIBANK N.A.                                  |
| 487            | DEUTSCHE BANK S.A.BCO ALEMAO                   |
| 509            | CELCOIN INSTITUIÇÃO DE PAGAMENTO S.A           |
| 542            | Cloud Walk Meios de Pagamentos                 |
| 595            | Zoop Instituição de Pagamentos                 |
| 600            | Luso Brasileiro                                |
| 604            | Indl. do Brasil                                |
| 611            | Paulista                                       |
| 612            | Guanabara                                      |
| 613            | OMNI BANCO S.A.                                |
| 623            | BANCO PAN                                      |
| 630            | Banco Smartbank                                |
| 633            | Rendimento                                     |
| 634            | Triângulo                                      |
| 637            | Sofisa                                         |
| 643            | Pine                                           |
| 653            | BANCO VOITER                                   |
| 654            | Banco Digimais                                 |
| 655            | Votorantim                                     |
| 707            | Daycoval                                       |
| 741            | Ribeirão Preto                                 |
| 743            | Semear                                         |
| 745            | Citibank S. A.                                 |
| 748            | Sicredi                                        |
| 752            | BCO BNP PARIBAS BRASIL S A                     |
| 753            | NOVO BCO CONTINENTAL S.A. - BM                 |
| 755            | Bank of America Merrill Lynch                  |
| 756            | Bancoob - Banco Cooperativo do Brasil (Sicoob) |
| 757            | BCO KEB HANA DO BRASIL S.A.                    |

## Transaction

**Example Notification**

```json
{
  "PaymentId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "ChangeType": 1,
  "RecurrentPaymentId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

| Key                           | Type   | Length |
| ----------------------------- | ------ | ------ |
| PaymentId                     | GUID   | 36     |
| ChangeType                    | Number | 1-2    |
| RecurrentPaymentId (Optional) | GUID   | 36     |

| ChangeType | Description                            |
| ---------- | -------------------------------------- |
| 1          | Change in transaction status           |
| 2          | Recurrence Created                     |
| 3          | Change in the anti-fraud status        |
| 4          | Change in the recurring payment status |
| 5          | Cancelling / refund denied             |
| 6          | Paid less then the actual boleto value |
| 7          | Chargeback (legacy)                    |
| 8          | Fraud alert                            |
| 25         | Cancelled or refunded partially        |

## Source

https://docs.cielo.com.br/split/reference/notifica%C3%A7%C3%A3o-kyc
https://docs.cielo.com.br/split/reference/notifica%C3%A7%C3%A3o-valida%C3%A7%C3%A3o-domic%C3%ADlio
https://docs.cielo.com.br/split/reference/notifica%C3%A7%C3%A3o-de-onboarding
https://docs.cielo.com.br/split/reference/post-notificacao
