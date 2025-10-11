import React, { useEffect, useState, useRef } from 'react';
import { Autocomplete, TextField } from '@mui/material';

import { apiClient, Group } from '@didhub/api-client';

import InputPromptDialog from '../forms/InputPromptDialog';
import { useAuth } from '../../shared/contexts/AuthContext';
import { getEffectiveOwnerId } from '../../shared/utils/owner';
import { normalizeEntityId, type EntityId } from '../../shared/utils/alterFormUtils';

type Option = Group | { name: string };

export interface GroupPickerProps {
  value?: string | string[] | { id?: string; name?: string } | null;
  onChange?: (v: string | string[] | null) => void;
  multiple?: boolean;
  routeUid?: EntityId | null;
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
    const response = await apiClient.group.get_groups({ q: q || null });
    const items = (response.data?.items ?? []) as unknown as Group[];
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
        .map((item) => normalizeEntityId(item) ?? undefined)
        .filter((id): id is string => typeof id === 'string');
      props.onChange?.(result);
      return;
    }
    if (typeof v === 'string') {
      setCreateDialog({ open: true, name: v });
      return;
    } else if (v && typeof v === 'object' && 'id' in v) {
      const id = normalizeEntityId(v) ?? undefined;
      props.onChange?.(id ?? null);
    } else {
      props.onChange?.(null);
    }
  }

  const selected: Option | Option[] | null = (() => {
    if (multiple) {
      if (!props.value) return [];
      const arr = Array.isArray(props.value) ? props.value : [props.value];
      return arr
        .map((v) => {
          if (v && typeof v === 'object') {
            const id = normalizeEntityId((v as { id?: unknown }).id);
            if (id != null) return options.find((x) => x.id === id) || (v as Option);
            return v as Option;
          }
          const idStr = normalizeEntityId(v);
          if (idStr) return options.find((x) => x.id === idStr) || { name: idStr };
          return null;
        })
        .filter((x): x is Option => x != null);
    }
    if (!props.value) return null;
    if (typeof props.value === 'object') {
      const id = (props.value as any).id;
      if (id != null)
        return options.find((x) => normalizeEntityId(x.id) === normalizeEntityId(id)) || (props.value as Option);
      return props.value as Option;
    }
    const idStr = String(props.value);
    return options.find((x) => normalizeEntityId(x.id) === idStr) || { name: idStr };
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
              const owner = getEffectiveOwnerId(
                props.routeUid == null ? undefined : normalizeEntityId(props.routeUid),
                auth.user?.id,
              );
              const payload: any = { name: createDialog.name };
              if (typeof owner === 'string') payload.owner_user_id = owner;
              // Debug: log payload prior to API call
              // eslint-disable-next-line no-console
              console.debug('[GroupPicker] inline create payload', payload);
              const group = (await apiClient.group.post_groups(payload)).data;
              const createdId = normalizeEntityId(group?.id) ?? undefined;
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
