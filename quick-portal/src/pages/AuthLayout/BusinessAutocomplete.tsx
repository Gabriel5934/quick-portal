import { useEffect, useMemo, useState } from 'react';
import { Combobox, InputBase, ScrollArea, useCombobox } from '@mantine/core';
import { useBusinesses } from '@/hooks/business/useBusinesses';
import { useSelectedBusiness } from '@/hooks/business/useSelectedBusiness';
import { normalizeCnpj } from '@/lib/cnpj';

/**
 * Header picker for the selected business. Only listed CNPJs can be selected:
 * on blur, text that is not a listed CNPJ is reset to the current selection.
 *
 * Built from Combobox primitives rather than `Autocomplete`, which gives its
 * listbox the input's `aria-label`, so the listbox gets its own name here. While
 * the dropdown is closed Combobox keeps the listbox mounted with `display: none`
 * (needed for `aria-controls`), which removes it from the accessibility tree.
 */
export function BusinessAutocomplete({ className }: { className?: string }) {
  const { data: businesses } = useBusinesses();
  const { cnpj, select } = useSelectedBusiness();
  const [search, setSearch] = useState('');
  const combobox = useCombobox({
    onDropdownClose: () => setTimeout(combobox.resetSelectedOption, 0),
  });

  const options = useMemo(
    () => (businesses ?? []).map((business) => normalizeCnpj(business.cnpj) ?? business.cnpj),
    [businesses]
  );

  useEffect(() => {
    setSearch(cnpj ?? '');
  }, [cnpj]);

  const empty = businesses?.length === 0;
  const disabled = !businesses || empty;

  // Lists every business while the input shows the current selection.
  const query = search.replace(/[^0-9a-z]/gi, '').toUpperCase();
  const filtered = options.filter((option) => query === cnpj || option.includes(query));

  const handleChange = (value: string) => {
    setSearch(value);
    combobox.resetSelectedOption();
  };

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
    <Combobox
      store={combobox}
      onOptionSubmit={(value) => {
        select(value);
        handleChange(value);
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target withExpandedAttribute>
        <InputBase
          className={className}
          aria-label="Selecionar negócio"
          placeholder={empty ? 'Nenhum negócio disponível' : 'Selecione um negócio'}
          disabled={disabled}
          value={search}
          onChange={(event) => {
            handleChange(event.currentTarget.value);
            combobox.openDropdown();
          }}
          onFocus={() => combobox.openDropdown()}
          onClick={() => combobox.openDropdown()}
          onBlur={() => {
            combobox.closeDropdown();
            handleBlur();
          }}
        />
      </Combobox.Target>

      <Combobox.Dropdown hidden={disabled || filtered.length === 0}>
        <Combobox.Options aria-label="Lista de negócios">
          <ScrollArea.Autosize mah={220} type="scroll">
            {filtered.map((option) => (
              <Combobox.Option value={option} key={option}>
                {option}
              </Combobox.Option>
            ))}
          </ScrollArea.Autosize>
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
