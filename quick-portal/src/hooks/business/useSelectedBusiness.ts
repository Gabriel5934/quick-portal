import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { normalizeCnpj } from '@/lib/cnpj';
import {
  clearSelectedBusiness,
  getSelection,
  loadSelectedBusiness,
  selectBusiness,
  subscribe,
} from './selection-store';
import { useBusinesses } from './useBusinesses';

export type SelectedBusiness =
  | { status: 'unknown'; cnpj: null }
  | { status: 'none'; cnpj: null }
  | { status: 'selected'; cnpj: string };

/**
 * The selected business. `unknown` until sessionStorage is read after mount.
 * A selection that is not in the loaded business list is cleared.
 */
export function useSelectedBusiness(): SelectedBusiness & {
  select: (cnpj: string) => boolean;
  clear: () => void;
} {
  const cnpj = useSyncExternalStore(subscribe, getSelection, () => undefined);
  const { data: businesses } = useBusinesses();

  useEffect(() => {
    if (cnpj === undefined) {
      loadSelectedBusiness();
    }
  }, [cnpj]);

  useEffect(() => {
    if (
      cnpj &&
      businesses &&
      !businesses.some((business) => normalizeCnpj(business.cnpj) === cnpj)
    ) {
      clearSelectedBusiness();
    }
  }, [cnpj, businesses]);

  const select = useCallback((value: string) => selectBusiness(value), []);
  const clear = useCallback(() => clearSelectedBusiness(), []);

  if (cnpj === undefined) {
    return { status: 'unknown', cnpj: null, select, clear };
  }
  if (cnpj === null) {
    return { status: 'none', cnpj: null, select, clear };
  }
  return { status: 'selected', cnpj, select, clear };
}
