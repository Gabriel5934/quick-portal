/** A Cielo choice; unlisted values are labelled `Desconhecido (<value>)`. */
export interface CieloChoice<T> {
  value: T;
  label: string;
}

export interface CieloTransaction {
  id: number;
  payment_id: string;
  received_date: string;
  /** In cents. */
  amount: number;
  installments: number;
  payment_type: CieloChoice<string>;
  brand: string | null;
  provider: string | null;
  status: CieloChoice<number>;
}

export interface CieloTransactionsResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: CieloTransaction[];
}
