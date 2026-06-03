import { useMutation } from "@tanstack/react-query";
import type { CompleteBusinessFormValues } from "#features/business/types";
import type { ValidationErrors } from "#hooks/types";
import { useToken } from "#hooks/auth/useToken";

type Payload = CompleteBusinessFormValues & { id: number };

async function fetchCompleteBusiness({ id, ...data }: Payload, token: string): Promise<void> {
  const res = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/api/businesses/${id}/complete/`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        bank_code: data.bankCode,
        branch: data.branch,
        branch_digit: data.branchDigit,
        account: data.account,
        account_digit: data.accountDigit,
        postal_code: data.postalCode.replace(/\D/g, ""),
        state: data.state,
        city: data.city,
        neighborhood: data.neighborhood,
        street: data.street,
        number: data.number,
        pos_devices: data.posDevices.map((d) => ({
          model: d.model,
          serial_number: d.serialNumber,
        })),
      }),
    },
  );

  if (!res.ok) {
    const body = (await res
      .json()
      .catch(() => null)) as ValidationErrors | null;
    const keys = Object.keys(body ?? {});
    throw new Error(
      keys.length && (body as ValidationErrors)[keys[0]]?.[0]
        ? (body as ValidationErrors)[keys[0]][0]
        : "Erro ao completar cadastro.",
    );
  }
}

export function useCompleteBusiness() {
  const { data: token } = useToken();
  return useMutation({ mutationFn: (payload: Payload) => fetchCompleteBusiness(payload, token!) });
}
