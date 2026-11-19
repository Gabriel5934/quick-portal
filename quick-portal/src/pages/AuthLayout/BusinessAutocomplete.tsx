import { useEffect, useMemo, useState } from 'react';
import { Autocomplete, type ComboboxParsedItem } from '@mantine/core';
import { useBusinesses } from '@/hooks/business/useBusinesses';
import { useSelectedBusiness } from '@/hooks/business/useSelectedBusiness';
import { normalizeCnpj } from '@/lib/cnpj';

/**
 * Header picker for the selected business. Only listed CNPJs can be selected:
 * on blur, text that is not a listed CNPJ is reset to the current selection.
 */
export function BusinessAutocomplete({ className }: { className?: string }) {
  const { data: businesses } = useBusinesses();
  const { cnpj, select } = useSelectedBusiness();
  const [search, setSearch] = useState('');

  const options = useMemo(
    () => (businesses ?? []).map((business) => normalizeCnpj(business.cnpj) ?? business.cnpj),
    [businesses]
  );

  useEffect(() => {
    setSearch(cnpj ?? '');
  }, [cnpj]);

  const empty = businesses?.length === 0;

  const handleBlur = () => {
    const typed = normalizeCnpj(search);
    if (typed && options.includes(typed)) {
      select(typed);
      setSearch(typed);
    } else {
      setSearch(cnpj ?? '');
    }
  };

  return (
    <Autocomplete
      className={className}
      aria-label="Selecionar negócio"
      placeholder={empty ? 'Nenhum negócio disponível' : 'Selecione um negócio'}
      disabled={!businesses || empty}
      data={options}
      value={search}
      onChange={setSearch}
      onOptionSubmit={(value) => {
        select(value);
        setSearch(value);
      }}
      onBlur={handleBlur}
      // Lists every business while the input shows the current selection.
      filter={({ options: items, search: text, limit }) => {
        const query = text.replace(/[^0-9a-z]/gi, '').toUpperCase();
        return items
          .filter(
            (item: ComboboxParsedItem) =>
              query === cnpj || !('value' in item) || item.value.includes(query)
          )
          .slice(0, limit);
      }}
    />
  );
}
