import { Controller, type Control, type FieldPathByValue, type FieldValues } from 'react-hook-form';
import { Select, TextInput, type SelectProps, type TextInputProps } from '@mantine/core';
import { applyMask } from '@/lib/mask';

type TextFieldProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPathByValue<T, string>;
  /** See `applyMask` for the pattern syntax. */
  mask?: string;
  /** Shown when the field itself has no validation error. */
  extraError?: string | null;
} & Omit<TextInputProps, 'name' | 'value' | 'onChange' | 'onBlur' | 'error'>;

/** Mantine TextInput bound to React Hook Form, optionally masked. */
export function TextField<T extends FieldValues>({
  control,
  name,
  mask,
  extraError,
  ...props
}: TextFieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextInput
          {...props}
          ref={field.ref}
          name={field.name}
          value={(field.value as string | undefined) ?? ''}
          onBlur={field.onBlur}
          onChange={(event) => {
            const { value } = event.currentTarget;
            field.onChange(mask ? applyMask(value, mask) : value);
          }}
          error={fieldState.error?.message ?? extraError ?? undefined}
        />
      )}
    />
  );
}

type SelectFieldProps<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPathByValue<T, string | null | undefined>;
  data: readonly { value: string; label: string }[];
  /** Called after the form value changes. */
  onValueChange?: (value: string | null) => void;
} & Omit<SelectProps, 'name' | 'value' | 'onChange' | 'onBlur' | 'error' | 'data' | 'searchable'>;

/** Mantine Select bound to React Hook Form. Always searchable. */
export function SelectField<T extends FieldValues>({
  control,
  name,
  data,
  onValueChange,
  ...props
}: SelectFieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Select
          nothingFoundMessage="Nenhuma opção encontrada"
          {...props}
          searchable
          data={[...data]}
          ref={field.ref}
          name={field.name}
          value={(field.value as string | null | undefined) || null}
          onBlur={field.onBlur}
          onChange={(value) => {
            field.onChange(value);
            onValueChange?.(value);
          }}
          error={fieldState.error?.message}
        />
      )}
    />
  );
}
