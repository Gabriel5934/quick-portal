# Seller Onboarding
Cielo Split API allows for the signup of sellers who can then be included in the split of transactions.
## URLs

| Environment | Method | Endpoint                                                         |
| ----------- | ------ | ---------------------------------------------------------------- |
| Sandbox     | POST   | `https://splitonboardingapisandbox.braspag.com.br/api/merchants` |
| Prod        | POST   | `https://splitonboardingapi.braspag.com.br/api/merchants`        |
## Headers
| Header        | Value                 |
| ------------- | --------------------- |
| Authorization | Bearer {access_token} |
## Body Params
Required fields are marked with an asterisk*

| Key                | Type   | Notes                                                                                             |
| ------------------ | ------ | ------------------------------------------------------------------------------------------------- |
| Type*              | String | Fixed value: "Subordinate"                                                                        |
| MasterMerchantId   | UUID   |                                                                                                   |
| ContactName*       | String | 100 characters max                                                                                |
| ContactPhone*      | String | 11 characters max                                                                                 |
| CorporateName*     | String | 100 characters max                                                                                |
| DocumentNumber*    | String | 14 characters max                                                                                 |
| DocumentType*      | String | Either "CPF" or "CNPJ"                                                                            |
| FancyName*         | String | 50 characters max                                                                                 |
| MailAddress*       | String | 50 characters max                                                                                 |
| Website            | String | 200 characters max                                                                                |
| BirthdayDate       | String | YYYY/MM/DD; Required if CPF DocumentType                                                          |
| BusinessActivityId | String | 1 to 100, see [Cielo Business Activities](./business-activities.md); Required if CPF DocumentType |
| BankAccount        | Object |                                                                                                   |
| Address            | Object |                                                                                                   |
**BankAccount**

| Key              | Type   | Notes                                           |
| ---------------- | ------ | ----------------------------------------------- |
| Bank*            | String | 3 characters max; See [Cielo Banks](./banks)    |
| BankAccountType* | String | Either "CheckingAccount" or "SavingsAccount"    |
| Number*          | String | 10 characters max                               |
| Operation        | String | 10 characters max                               |
| VerifierDigit*   | String | 1 character max                                 |
| AgencyNumber*    | String | 4 characters max                                |
| AgencyDigit*     | String | 1 character max; If there's no digit inform "x" |
| DocumentNumber   | String | 14 characters max                               |
| DocumentType     | String | Either "CPF" or "CNPJ"                          |
**Address**

| Key           | Type   | Notes              |
| ------------- | ------ | ------------------ |
| Street*       | String | 100 characters max |
| Number*       | String | 15 characters max  |
| Complement    | String | 80 characters max  |
| Neighborhood* | String | 50 characters max  |
| City*         | String | 50 characters max  |
| State*        | String | 2 characters max   |
| ZipCode*      | String | 9 characters max   |
## Responses
### 200
```json
{
  "Id": "5dcee8e4-f432-42e4-a2a6-5a30c8ce2ca5",
  "Type": "Subordinate",
  "MasterMerchantId": "2b8e9c38-0d9e-4f30-adac-fef3601632e4",
  "CorporateName": "Corporate Name Seller",
  "FancyName": "Fancy Name Seller",
  "DocumentType": 1,
  "DocumentNumber": "64829167000142",
  "BirthdayDate": "2019-04-25",
  "WebSite": "https://www.website.com.br",
  "ContactName": "Joao Costa",
  "MailAddress": "address@email.mail.com",
  "ContactPhone": "2133333334",
  "Blocked": true,
  "Analysis": {
    "Status": 5
  },
  "Address": {
    "ZipCode": "20020081",
    "Street": "My street updated",
    "Number": "20",
    "Complement": "My Complement Seller",
    "City": "My City Master",
    "Neighborhood": "My Neighborhood Seller",
    "State": "RJ"
  },
  "BankAccount": {
    "BankId": 1,
    "Bank": "001",
    "BankAccountType": "CheckingAccount",
    "Number": "0002",
    "AgencyNumber": "0002",
    "AgencyDigit": "2",
    "VerifierDigit": "2",
    "Operation": "2"
  },
  "Links": [
    {
      "Href": "http://splitonboardingapisandbox.braspag.com.br/api/merchants/5dcee8e4-f432-42e4-a2a6-5a30c8ce2ca5",
      "Rel": "self",
      "Method": "GET"
    }
  ]
}
```
## Source
https://docs.cielo.com.br/split/reference/cadastrar-seller-api


