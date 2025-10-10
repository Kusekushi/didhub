import React, { useEffect, useState, useRef } from 'react';
import { Autocomplete, TextField } from '@mui/material';

import { apiClient, type Subsystem } from '@didhub/api-client';

import InputPromptDialog from '../forms/InputPromptDialog';
import { useAuth } from '../../shared/contexts/AuthContext';
import { getEffectiveOwnerId } from '../../shared/utils/owner';

export interface SubsystemPickerProps {
  value?: number | { id?: number; name?: string } | null;
  onChange?: (v: number | null) => void;
  routeUid?: string | number | null;
}

export default function SubsystemPicker(props: SubsystemPickerProps) {
  const [options, setOptions] = useState<Subsystem[]>([]);
  const [inputValue, setInputValue] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [createDialog, setCreateDialog] = useState({ open: false, name: '' });
  const [createType, setCreateType] = useState('normal');
  const auth = useAuth();

  useEffect(() => {
    fetchOptions('');
  }, []);

  async function fetchOptions(q: string) {
    const response = await apiClient.subsystem.get_subsystems({ query: q || '', limit: 25 });
    const list = ((response.data?.items ?? []) as unknown) as Subsystem[];
    setOptions(list);
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchOptions(inputValue);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
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

  async function handleChange(e: React.SyntheticEvent, v: Subsystem | string | number | null) {
    if (typeof v === 'string') {
      setCreateDialog({ open: true, name: v });
      return;
    } else if (typeof v === 'number') {
      const numeric = parseNumericId(v);
      props.onChange && props.onChange(numeric ?? null);
      return;
    } else if (v && typeof v === 'object' && 'id' in v) {
      const numeric = parseNumericId((v as Subsystem).id);
      props.onChange && props.onChange(numeric ?? null);
    } else {
      props.onChange && props.onChange(null);
    }
  }

  const selected: Subsystem | null =
    props.value &&
    (typeof props.value === 'object'
      ? ((props.value as unknown) as Subsystem)
      : (() => {
          const numeric = parseNumericId(props.value);
          if (numeric == null) return null;
          const found = options.find((x) => Number(x.id) === numeric);
          return found ? ((found as unknown) as Subsystem) : null;
        })());

  return (
    <>
      <Autocomplete
        options={options}
        getOptionLabel={(o: Subsystem | string) => (typeof o === 'string' ? o : o.name)}
  value={selected}
        inputValue={inputValue}
        onInputChange={(e, v) => setInputValue(v)}
        onChange={handleChange}
        renderInput={(params) => <TextField {...params} label="Subsystem" />}
        freeSolo
        clearOnBlur={false}
      />
      {createDialog.open ? (
        <InputPromptDialog
          open={true}
          title={`Create subsystem "${createDialog.name}"`}
          label="Type (normal or nested-did)"
          defaultValue={createType}
          onCancel={() => setCreateDialog({ open: false, name: '' })}
          onSubmit={async (value: string | undefined) => {
            const type = value || 'normal';
            try {
              const owner = getEffectiveOwnerId(props.routeUid == null ? undefined : String(props.routeUid), auth.user?.id);
              const payload: any = { name: createDialog.name, type };
              if (typeof owner === 'number' || typeof owner === 'string') payload.owner_user_id = owner;
              const response = await apiClient.subsystem.post_subsystems(payload);
              const subsystem = response.data as Subsystem | undefined;
              const createdId = parseNumericId(subsystem?.id);
              if (subsystem && createdId != null) {
                setOptions((prev) => [subsystem, ...prev]);
                props.onChange && props.onChange(createdId);
              } else {
                props.onChange && props.onChange(null);
              }
            } catch (e) {
              props.onChange && props.onChange(null);
            } finally {
              setCreateDialog({ open: false, name: '' });
            }
          }}
        />
      ) : null}
    </>
  );
}
