import React, { useEffect, useState, useRef, useMemo } from 'react';
import debounce from 'lodash-es/debounce';
import { Autocomplete, TextField } from '@mui/material';

// Use a lightweight local type for Subsystem to avoid importing runtime types
// from the generated client during this migration sweep.
type Subsystem = {
  id?: string | null;
  name?: string | null;
  [k: string]: any;
};
import { listSubsystems, createSubsystem } from '../../services/subsystemService';

import InputPromptDialog from '../forms/InputPromptDialog';
import { useAuth } from '../../shared/contexts/AuthContext';
import { getEffectiveOwnerId } from '../../shared/utils/owner';
import { type EntityId } from '../../shared/utils/alterFormUtils';
import { normalizeEntityId } from '../../shared/utils/alterFormUtils';

export interface SubsystemPickerProps {
  value?: string | { id?: string; name?: string } | null;
  onChange?: (v: string | null) => void;
  routeUid?: EntityId | null;
}

export default function SubsystemPicker(props: SubsystemPickerProps) {
  const [options, setOptions] = useState<Subsystem[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [createDialog, setCreateDialog] = useState({ open: false, name: '' });
  const [createType, setCreateType] = useState('normal');
  const auth = useAuth();

  useEffect(() => {
    fetchOptions('');
  }, []);

  async function fetchOptions(q: string) {
    const response: any = (await listSubsystems({ q: q || '', limit: 25 })) ?? { items: [] };
    const list = (response.items ?? []) as Subsystem[];
    setOptions(list);
  }

  const debouncedFetch = useMemo(() => debounce((q: string) => fetchOptions(q), 300), []);

  useEffect(() => {
    debouncedFetch(inputValue);
  }, [inputValue, debouncedFetch]);

  useEffect(() => {
    return () => {
      debouncedFetch.cancel();
    };
  }, [debouncedFetch]);

  async function handleChange(e: React.SyntheticEvent, v: Subsystem | string | number | null) {
    if (typeof v === 'string') {
      setCreateDialog({ open: true, name: v });
      return;
    }
    if (v && typeof v === 'object' && 'id' in v) {
      const id = normalizeEntityId(v) ?? undefined;
      props.onChange && props.onChange(id ?? null);
      return;
    }
    props.onChange && props.onChange(null);
  }

  const selected: Subsystem | null =
    props.value &&
    (typeof props.value === 'object'
      ? (props.value as unknown as Subsystem)
      : (() => {
        const id = normalizeEntityId(props.value) ?? undefined;
        if (!id) return null;
        const found = options.find((x) => x.id === id);
        return found ? (found as unknown as Subsystem) : null;
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
              const owner = getEffectiveOwnerId(
                props.routeUid == null ? undefined : normalizeEntityId(props.routeUid),
                auth.user?.id,
              );
              const payload: any = { name: createDialog.name, type };
              if (typeof owner === 'string') payload.owner_user_id = owner;
              const subsystem = (await createSubsystem(payload)) as Subsystem | undefined;
              const createdId = normalizeEntityId(subsystem?.id) ?? undefined;
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
