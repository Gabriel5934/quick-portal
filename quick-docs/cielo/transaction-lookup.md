# Transaction Lookup

After obtaining `PaymentId` through a transaction notification, you can look up transaction details through this endpoint. This data can then be used to request a payment split.

## URLs

| Env     | Method | Endpoint                                                                  |
| ------- | ------ | ------------------------------------------------------------------------- |
| Sandbox | GET    | `https://apiquerysandbox.cieloecommerce.cielo.com.br/1/sales/{PaymentId}` |
| Prod    | GET    | `https://apiquery.cieloecommerce.cielo.com.br/1/sales/{PaymentId}`        |

## Headers

| Header        | Value                 |
| ------------- | --------------------- |
| Authorization | Bearer {access_token} |

## Responses

### 200

```json
{
  "MerchantId": "f43fca07-48ec-46b5-8b93-ce79b75a8f63",
  "MerchantOrderId": "2014111701",
  "IsSplitted": true,
  "Customer": {
    "Name": "Comprador",
    "Address": {}
  },
  "Payment": {
    "ServiceTaxAmount": 0,
    "Installments": 1,
    "Capture": true,
    "Authenticate": false,
    "CreditCard": {
      "CardNumber": "455187******0181",
      "Holder": "Teste Holder",
      "ExpirationDate": "12/2021",
      "Brand": "Visa"
    },
    "ProofOfSale": "20171210061821319",
    "Tid": "1210061821319",
    "AuthorizationCode": "379918",
    "PaymentId": "507821c5-7067-49ff-928f-a3eb1e256148",
    "Type": "SplittedCreditCard",
    "Amount": 10000,
    "ReceivedDate": "2017-12-10 18:18:18",
    "CapturedAmount": 10000,
    "CapturedDate": "2017-12-10 18:18:21",
    "Currency": "BRL",
    "Country": "BRA",
    "Provider": "Simulado",
    "Status": 2,
    "Links": [
      {
        "Method": "GET",
        "Rel": "self",
        "Href": "https://apiquerysandbox.cieloecommerce.cielo.com.br/1/sales/507821c5-7067-49ff-928f-a3eb1e256148"
      },
      {
        "Method": "PUT",
        "Rel": "void",
        "Href": "https://apisandbox.cieloecommerce.cielo.com.br/1/sales/507821c5-7067-49ff-928f-a3eb1e256148/void"
      },
      {
        "Method": "PUT",
        "Rel": "sales.split",
        "Href": "https://splitsandbox.braspag.com.br/api/transactions/507821c5-7067-49ff-928f-a3eb1e256148/split"
      }
    ],
    "SplitPayments": [
      {
        "SubordinateMerchantId": "f2d6eb34-2c6b-4948-8fff-51facdd2a28f",
        "Amount": 6000,
        "Fares": {
          "Mdr": 5,
          "Fee": 30
        },
        "Splits": [
          {
            "MerchantId": "f2d6eb34-2c6b-4948-8fff-51facdd2a28f",
            "Amount": 5670
          },
          {
            "MerchantId": "f43fca07-48ec-46b5-8b93-ce79b75a8f63",
            "Amount": 330
          }
        ]
      },
      {
        "SubordinateMerchantId": "9140ca78-3955-44a5-bd44-793370afef94",
        "Amount": 4000,
        "Fares": {
          "Mdr": 4,
          "Fee": 15
        },
        "Splits": [
          {
            "MerchantId": "9140ca78-3955-44a5-bd44-793370afef94",
            "Amount": 3825
          },
          {
            "MerchantId": "f43fca07-48ec-46b5-8b93-ce79b75a8f63",
            "Amount": 175
          }
        ]
      }
    ]
  }
}
```

### 400

```json
{}
```

## Source

https://docs.cielo.com.br/split/reference/consultar-transa%C3%A7%C3%B5es
