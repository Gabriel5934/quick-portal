---
description: Splitting a transaction's payment between multiple sellers
---

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
[
  {
    "SubordinateMerchantId": "f2d6eb34-2c6b-4948-8fff-51facdd2a28f",
    "Amount": 6000,
    "Fares": {
      "Mdr": 5,
      "Fee": 30
    }
  },
  {
    "SubordinateMerchantId": "58a75624-c254-45fb-8272-28a344ae32aa",
    "Amount": 6000,
    "Fares": {
      "Mdr": 5,
      "Fee": 30
    }
  }
]
```

| Key                       | Type   | Description                            |
| ------------------------- | ------ | -------------------------------------- |
| [n].SubordinateMerchantId | GUID   | MID from the seller that made the sale |
| [n].Amount                | Number | Check Below                            |
| [n].Fares                 | Node   | Fares node                             |
| [n].Fares.Mdr             | Number | Percentage fee                         |
| [n].Fares.Fee             | Number | Fixed value fee                        |

**Amount:** Amount is the value that belongs to the subordinate merchant before any master fees or MDR is discounted. For that reason the sum of all "Amount" keys in the split payments array should be equal to the transaction value

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
