# Payment Split

Payment Split divides the value of a transaction between multiple parties. After a payment is approved and receiving a `PaymentID` through a transaction notification you can request the transaction split. The master seller has until 1:00 am the day after the transaction to make the request.

- The value of the transaction is then divided between the parties;
- The division follows custom rules;
- Each party receives its part in their own bank account.

## URLs

| Env     | Method | Endpoint                                                                 |
| ------- | ------ | ------------------------------------------------------------------------ |
| Sandbox | PUT    | `https://splitsandbox.braspag.com.br/api/transactions/{PaymentId}/split` |
| Prod    | PUT    | `https://split.braspag.com.br/api/transactions/{PaymentId}/split`        |

## Example Request

```json
{
  "SplitPayments": {
    "SubordinateMerchantId": "f2d6eb34-2c6b-4948-8fff-51facdd2a28f",
    "Amount": 6000,
    "Fares": {
      "Mdr": 5,
      "Fee": 30
    }
  }
}
```

| Key                                 | Type   | Description                               |
| ----------------------------------- | ------ | ----------------------------------------- |
| SplitPayments                       | Node   | Root node                                 |
| SplitPayments.SubordinateMerchantId | GUID   | MID from the seller that made the sale    |
| SplitPayments.Amount                | Number | Transaction value AFTER discounting fares |
| SplitPayments.Fares                 | Node   | Fares node                                |
| SplitPayments.Fares.Mdr             | Number | Percentage fee                            |
| SplitPayments.Fares.Fee             | Number | Fixed value fee                           |

## Headers

| Header        | Value                 |
| ------------- | --------------------- |
| Authorization | Bearer {access_token} |

## Responses

### 200

```json
{
  "PaymentId": "c96bf94c-b213-44a7-9ea3-0ee2865dc57e",
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
```

### 400

```json
{}
```

## Source

https://docs.cielo.com.br/split/reference/split-autorizado
