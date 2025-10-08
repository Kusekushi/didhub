import React, { useEffect, useState, useRef } from 'react';
import { Autocomplete, TextField } from '@mui/material';

import { apiClient, type Group } from '@didhub/api-client';

import InputPromptDialog from '../forms/InputPromptDialog';
import { useAuth } from '../../shared/contexts/AuthContext';
import { getEffectiveOwnerId } from '../../shared/utils/owner';

type Option = Group | { name: string };

export interface GroupPickerProps {
  value?: number | number[] | { id?: number; name?: string } | null;
  onChange?: (v: number | number[] | null) => void;
  multiple?: boolean;
  routeUid?: string | number | null;
}

export default function GroupPicker(props: GroupPickerProps) {
  const multiple = props.multiple ?? false;
  const [options, setOptions] = useState<Group[]>([]);
  const [inputValue, setInputValue] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [createDialog, setCreateDialog] = useState({ open: false, name: '' });
  const auth = useAuth();

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

  const parseNumericId = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const numeric = Number(trimmed.replace(/^#/u, ''));
      return Number.isFinite(numeric) ? numeric : undefined;
    }
    if (value && typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
      return parseNumericId((value as { id?: unknown }).id);
    }
    return undefined;
  };

  async function handleChange(e: React.SyntheticEvent, v: Option | Option[] | string | number | null) {
    if (multiple) {
      const arr = Array.isArray(v) ? v : [];
      const result = arr.map((item) => parseNumericId(item)).filter((id): id is number => typeof id === 'number');
      props.onChange?.(result);
      return;
    }
    if (typeof v === 'string') {
      setCreateDialog({ open: true, name: v });
      return;
    } else if (typeof v === 'number') {
      const numeric = parseNumericId(v);
      props.onChange?.(numeric ?? null);
      return;
    } else if (v && typeof v === 'object' && 'id' in v) {
      const numeric = parseNumericId((v as Group).id);
      props.onChange?.(numeric ?? null);
    } else {
      props.onChange?.(null);
    }
  }

  const selected: Option | Option[] | null = (() => {
    if (multiple) {
      if (!props.value) return [];
      const arr = Array.isArray(props.value) ? props.value : [props.value];
      return arr
        .map((v) => parseNumericId(v))
        .filter((id): id is number => typeof id === 'number')
        .map((id) => options.find((x) => x.id === id) || { name: String(id) });
    }
    if (!props.value) return null;
    if (typeof props.value === 'object') return props.value as Option;
    const numeric = parseNumericId(props.value);
    if (typeof numeric === 'number') {
      return options.find((x) => x.id === numeric) || { name: String(numeric) };
    }
    return null;
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
          <TextField {...params} label={label} placeholder={multiple ? 'Select affiliations' : 'Select affiliation'} />
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
              // include owner_user_id when creating on-behalf-of if a route uid is present
              const owner = getEffectiveOwnerId(props.routeUid == null ? undefined : String(props.routeUid), auth.user?.id);
              const payload: any = { name: createDialog.name };
              if (typeof owner === 'number') payload.owner_user_id = owner;
              // Debug: log payload prior to API call
              // eslint-disable-next-line no-console
              console.debug('[GroupPicker] inline create payload', payload);
              const group = await apiClient.groups.create(payload);
              const createdId = parseNumericId(group?.id);
              if (group && createdId != null) {
                setOptions((prev) => [group, ...prev]);
                props.onChange?.(createdId);
              } else {
                props.onChange?.(null);
              }
            } catch {
              props.onChange?.(null);
            } finally {
              setCreateDialog({ open: false, name: '' });
            }
          }}
        />
      ) : null}
    </>
  );
}
