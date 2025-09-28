import React, { useEffect, useState, useRef } from 'react';
import { Autocomplete, TextField } from '@mui/material';

import InputPromptDialog from './InputPromptDialog';
import { listSubsystems, createSubsystem, Subsystem } from '@didhub/api-client';

export default function SubsystemPicker({
  value,
  onChange,
}: {
  value?: number | string | { id?: number; name?: string } | null;
  onChange?: (v: number | string | null) => void;
}) {
  const [options, setOptions] = useState<Subsystem[]>([]);
  const [inputValue, setInputValue] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [createDialog, setCreateDialog] = useState({ open: false, name: '' });
  const [createType, setCreateType] = useState('normal');

  useEffect(() => {
    fetchOptions('');
  }, []);

  async function fetchOptions(q: string) {
    const r = await listSubsystems(q || '');
    setOptions(r || []);
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

  async function handleChange(e: React.SyntheticEvent, v: Subsystem | string | number | null) {
    if (typeof v === 'string') {
      setCreateDialog({ open: true, name: v });
      return;
    } else if (v && typeof v === 'object' && 'id' in v) {
      onChange && onChange((v as Subsystem).id);
    } else if (v && typeof v === 'object' && 'name' in v) {
      onChange && onChange((v as { name?: string }).name || null);
    } else {
      onChange && onChange(null);
    }
  }

  const selected: Subsystem | { name: string } | null =
    value &&
    (typeof value === 'object'
      ? (value as Subsystem)
      : typeof value === 'number'
        ? options.find((x) => x.id === value) || { name: String(value) }
        : { name: String(value) });

  return (
    <>
      <Autocomplete
        options={options}
        getOptionLabel={(o: Subsystem | string) => (typeof o === 'string' ? o : o.name)}
        value={selected || null}
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
              const cr = await createSubsystem({ name: createDialog.name, type });
              if (cr && cr.json) {
                const s = cr.json;
                setOptions((prev) => [s, ...prev]);
                onChange && onChange(s.id);
              } else {
                onChange && onChange(createDialog.name);
              }
            } catch (e) {
              onChange && onChange(createDialog.name);
            } finally {
              setCreateDialog({ open: false, name: '' });
            }
          }}
        />
      ) : null}
    </>
  );
}
