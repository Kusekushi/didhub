import React, { useEffect, useState, useRef } from 'react';
import { Autocomplete, TextField } from '@mui/material';

import { apiClient, type Group } from '@didhub/api-client';

import InputPromptDialog from './InputPromptDialog';

type Option = Group | { name: string };

export interface GroupPickerProps {
  value?: number | string | (number | string)[] | { id?: number; name?: string } | null;
  onChange?: (v: number | string | (number | string)[] | null) => void;
  multiple?: boolean;
}

export default function GroupPicker(props: GroupPickerProps) {
  const multiple = props.multiple ?? false;
  const [options, setOptions] = useState<Group[]>([]);
  const [inputValue, setInputValue] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [createDialog, setCreateDialog] = useState({ open: false, name: '' });

  useEffect(() => {
    fetchOptions('');
  }, []);

  async function fetchOptions(q: string) {
    const items = await apiClient.groups.list({ query: q || '' });
    setOptions(items);
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current as any);
    debounceRef.current = setTimeout(() => {
      fetchOptions(inputValue);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current as any);
    };
  }, [inputValue]);

  async function handleChange(e: React.SyntheticEvent, v: Option | Option[] | string | number | null) {
    if (multiple) {
      const arr = Array.isArray(v) ? v : [];
      const result = arr
        .map((item) => {
          if (!item) return null;
          if (typeof item === 'string') return item;
          if (typeof item === 'number') return item;
          if ('id' in item && item.id) return (item as Group).id;
          if ('name' in item && item.name) return (item as any).name;
          return null;
        })
        .filter((x) => x != null) as (number | string)[];
      props.onChange?.(result);
      return;
    }
    if (typeof v === 'string') {
      setCreateDialog({ open: true, name: v });
      return;
    } else if (v && typeof v === 'object' && 'id' in v) {
      props.onChange?.((v as Group).id);
    } else if (v && typeof v === 'object' && 'name' in v) {
      props.onChange?.((v as any).name);
    } else {
      props.onChange?.(null);
    }
  }

  const selected: Option | Option[] | null = (() => {
    if (multiple) {
      if (!props.value) return [];
      const arr = Array.isArray(props.value) ? props.value : [props.value];
      return arr.map((v) =>
        typeof v === 'number'
          ? options.find((x) => x.id === v) || { name: String(v) }
          : typeof v === 'object'
            ? (v as Option)
            : { name: String(v) },
      );
    }
    if (!props.value) return null;
    if (typeof props.value === 'object') return props.value as Option;
    if (typeof props.value === 'number')
      return options.find((x) => x.id === props.value) || { name: String(props.value) };
    return { name: props.value };
  })();

  const label = multiple ? 'Affiliations' : 'Affiliation';

  return (
    <>
      <Autocomplete
        multiple={multiple}
        options={options}
        getOptionLabel={(o: Option | string) => (typeof o === 'string' ? o : o.name)}
        value={(selected as any) || (multiple ? [] : null)}
        inputValue={inputValue}
        onInputChange={(e, v) => setInputValue(v)}
        onChange={handleChange}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            placeholder={multiple ? 'Select affiliations' : 'Select affiliation'}
          />
        )}
        freeSolo
        clearOnBlur={false}
      />
      {createDialog.open ? (
        <InputPromptDialog
          open={true}
          title={`Create group "${createDialog.name}"`}
          label={`Create group "${createDialog.name}"?`}
          defaultValue={createDialog.name}
          onCancel={() => setCreateDialog({ open: false, name: '' })}
          onSubmit={async () => {
            try {
              const group = await apiClient.groups.create({ name: createDialog.name });
              if (group && group.id != null) {
                setOptions((prev) => [group, ...prev]);
                props.onChange?.(group.id);
              } else {
                props.onChange?.(createDialog.name);
              }
            } catch {
              props.onChange?.(createDialog.name);
            } finally {
              setCreateDialog({ open: false, name: '' });
            }
          }}
        />
      ) : null}
    </>
  );
}
