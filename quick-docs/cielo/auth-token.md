# Auth Token

Use this endpoint to obtain an access token. In prod env this token expires after 20 minutes.

## URLs

| Env     | Method | Endpoint                                          |
| ------- | ------ | ------------------------------------------------- |
| Sandbox | POST   | `https://authsandbox.braspag.com.br/oauth2/token` |
| Prod    | POST   | `https://auth.braspag.com.br/oauth2/token`        |

## Example Request

```json
{
  "grant_type": "client_credentials"
}
```

To build `client_credentials` concatenate `MerchantId` and `ClientSecret` as `MerchantId:ClientSecret` and convert to base64

## Responses

### 200

```json
{
  "access_token": "ey..Hg",
  "token_type": "bearer",
  "expires_in": 86399
}
```

### 400

```json
{
  "error": "invalid_client",
  "error_description": "A autenticação do cliente falhou. Por favor, informe o Request Id para o suporte: 5ffb616e-35a7-49a5-85b3-1bb891b0b5c3."
}
```

## Source

https://docs.cielo.com.br/split/reference/token-acesso
