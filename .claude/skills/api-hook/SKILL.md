# Skill: api-hook

Create a TanStack Query mutation hook for a new API endpoint, following the project's established pattern.

## Pattern

Every hook in `src/hooks/` follows this structure:

1. **Request type** — fields sent in the request body
2. **Response type** — fields expected from a successful response
3. **Fetch function** — async function that:
   - Calls `fetch` against `http://localhost:8000/<path>/`
   - Sets `Content-Type: application/json` and stringifies the body
   - Parses JSON with `.catch(() => null)` to avoid throwing on bad JSON
   - On `!res.ok`, casts data as `ValidationErrors`, reads `errors[keys[0]][0]`, and throws an `Error`
   - Validates required response fields are present; throws `"Invalid ... response from server."` if not
   - Returns the typed response object
4. **Hook export** — `export function use<Name>()` wrapping `useMutation({ mutationFn })`

## Example output (use as template)

```ts
import { useMutation } from "@tanstack/react-query";
import type { ValidationErrors } from "./types";

type <Name>Request = {
  // request fields
};

type <Name>Response = {
  // response fields
};

async function fetch<Name>(payload: <Name>Request): Promise<<Name>Response> {
  const res = await fetch("http://localhost:8000/<endpoint>/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => null)) as
    | (Partial<<Name>Response> & { detail?: string })
    | null;

  if (!res.ok) {
    const errors = data as ValidationErrors;
    const keys = Object.keys(errors);
    throw new Error(errors[keys[0]][0]);
  }

  // validate required fields
  if (!data?.<requiredField>) {
    throw new Error("Invalid <name> response from server.");
  }

  return data as <Name>Response;
}

export function use<Name>() {
  return useMutation({
    mutationFn: fetch<Name>,
  });
}
```

## Steps

Given the user's description of the endpoint (HTTP method, path, request fields, response fields):

1. Derive a PascalCase `<Name>` from the endpoint purpose (e.g. `PasswordReset`, `UpdateProfile`)
2. Write the hook to `src/hooks/use<Name>.ts` following the template above
3. If the method is not POST, adjust `method` accordingly and omit `body` if it's a GET
4. For GET hooks, use `useQuery` instead of `useMutation` — wrap in `useQuery({ queryKey: [...], queryFn })`
5. Report the file path when done

## Notes

- Always import `ValidationErrors` from `"./types"` for error handling
- Never hardcode the base URL elsewhere — keep it inline as `http://localhost:8000`
- Do not add axios or other HTTP libraries; use native `fetch`
- Do not add extra error handling beyond the DRF validation error pattern already established
