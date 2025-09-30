import React, { useEffect, useState, useRef } from 'react';
import { Autocomplete, TextField } from '@mui/material';

import InputPromptDialog from './InputPromptDialog';
import { apiClient, type Subsystem } from '@didhub/api-client';

export interface SubsystemPickerProps {
  value?: number | string | { id?: number; name?: string } | null;
  onChange?: (v: number | string | null) => void;
}

export default function SubsystemPicker(props: SubsystemPickerProps) {
  const [options, setOptions] = useState<Subsystem[]>([]);
  const [inputValue, setInputValue] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [createDialog, setCreateDialog] = useState({ open: false, name: '' });
  const [createType, setCreateType] = useState('normal');

  useEffect(() => {
    fetchOptions('');
  }, []);

  async function fetchOptions(q: string) {
    const r = await apiClient.subsystems.list({ query: q || '' });
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
      props.onChange && props.onChange((v as Subsystem).id);
    } else if (v && typeof v === 'object' && 'name' in v) {
      props.onChange && props.onChange((v as { name?: string }).name || null);
    } else {
      props.onChange && props.onChange(null);
    }
  }

  const selected: Subsystem | { name: string } | null =
    props.value &&
    (typeof props.value === 'object'
      ? (props.value as Subsystem)
      : typeof props.value === 'number'
        ? options.find((x) => x.id === props.value) || { name: String(props.value) }
        : { name: String(props.value) });

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
              const subsystem = await apiClient.subsystems.create({ name: createDialog.name, type });
              if (subsystem && subsystem.id != null) {
                setOptions((prev) => [subsystem, ...prev]);
                props.onChange && props.onChange(subsystem.id);
              } else {
                props.onChange && props.onChange(createDialog.name);
              }
            } catch (e) {
              props.onChange && props.onChange(createDialog.name);
            } finally {
              setCreateDialog({ open: false, name: '' });
            }
          }}
        />
      ) : null}
    </>
  );
}
