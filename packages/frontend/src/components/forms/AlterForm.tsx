import React from 'react';
import { normalizeEntityId, RelationshipOption } from '../../shared/utils/alterFormUtils';
import {
  TextField,
  Autocomplete,
  Switch,
  FormControlLabel,
  FormGroup,
  Stack,
  IconButton,
  Tooltip,
  LinearProgress,
  Typography,
  Chip,
} from '@mui/material';
import { createFilterOptions, type AutocompleteRenderGetTagProps } from '@mui/material/Autocomplete';
import DeleteIcon from '@mui/icons-material/Delete';

import RichEditor from '../common/RichEditor';
import GroupPicker from '../common/GroupPicker';
import SubsystemPicker from '../common/SubsystemPicker';
import { StackItem } from '../common/StackItem';

import { getAlterById } from '../../services/alterService';
import { getRelationships } from '../../services/relationshipService';
import { mapSelectionsToTagValues, TagValue, stripTrailingId, convertLabelsToIdentifiers, mapToLabels } from './alterFormUtils';
import { ApiAlter } from '@didhub/api-client';

function debugLog(...args: unknown[]) {
  console.debug('[AlterForm]', ...args);
}

export interface AlterFormFieldsProps {
  values: Partial<ApiAlter> & {
    _files?: File[];
    partners?: Array<string | { id?: string }>;
    parents?: Array<string | { id?: string }>;
    children?: Array<string | { id?: string }>;
    user_partners?: Array<string>;
    user_parents?: Array<string>;
    user_children?: Array<string>;
    affiliations?: Array<string>;
    subsystem?: string | { id?: string; name?: string } | null;
  };
  errors: Record<string, string>;
  partnerOptions: RelationshipOption[];
  partnerMap?: Record<string, string>;
  parentOptions?: RelationshipOption[];
  parentMap?: Record<string, string>;
  childOptions?: RelationshipOption[];
  childMap?: Record<string, string>;
  userPartnerOptions?: string[];
  userPartnerMap?: Record<string, string>;
  userParentOptions?: string[];
  userParentMap?: Record<string, string>;
  userChildOptions?: string[];
  userChildMap?: Record<string, string>;
  alterIdNameMap?: Record<string, string>;
  userIdNameMap?: Record<string, string>;
  onChange: (k: string, v: unknown) => void;
  onFile: (f: File[]) => void;
  onRemovePendingFile?: (idx: number) => void;
  onDeleteImage?: (url: string) => void; // for already-uploaded images (edit form)
  onReorderImages?: (from: number, to: number) => void;
  uploading?: boolean;
  showDescription?: boolean;
  partnerLabel?: string;
  useSwitchForHost?: boolean;
  progressMap?: Record<string, number>; // filename -> percent
  routeUid?: string | null;
}

export default function AlterFormFields(props: AlterFormFieldsProps) {
  const {
    values,
    errors,
    partnerOptions,
    onChange,
    onFile,
    uploading,
    showDescription,
    partnerLabel,
    useSwitchForHost,
    onDeleteImage,
    onRemovePendingFile,
    onReorderImages,
    progressMap,
  } = props;

  // normalize routeUid to string | undefined for child components
  const normalizedRouteUid = normalizeEntityId(props.routeUid ?? undefined) ?? undefined;

  const [soulSongsInput, setSoulSongsInput] = React.useState('');
  const [interestsInput, setInterestsInput] = React.useState('');

  React.useEffect(() => {
    if (Array.isArray(values.soul_songs)) {
      setSoulSongsInput(values.soul_songs.join(', '));
    } else if (typeof values.soul_songs === 'string') {
      setSoulSongsInput(values.soul_songs);
    } else {
      setSoulSongsInput('');
    }
  }, [values.soul_songs]);

  React.useEffect(() => {
    if (typeof values.interests === 'string') {
      setInterestsInput(values.interests);
    } else {
      setInterestsInput('');
    }
  }, [values.interests]);

  const parseCommaSeparated = React.useCallback((raw: string): string[] => {
    return raw
      .split(/[,\n;]/u)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
  }, []);
  const alterIdLookup = props.alterIdNameMap ?? {};
  const userIdLookup = props.userIdNameMap ?? {};

  // Local cache for alter id -> display name lookup. If the parent did not provide
  // `alterIdNameMap` (because relationships are no longer fetched with the alter),
  // fetch missing names on demand so tag rendering still works.
  const [localAlterIdLookup, setLocalAlterIdLookup] = React.useState<Record<string, string>>(
    props.alterIdNameMap ?? {},
  );
  const mergedAlterIdLookup = React.useMemo(
    () => ({ ...(props.alterIdNameMap ?? {}), ...localAlterIdLookup }),
    [props.alterIdNameMap, localAlterIdLookup],
  );

  React.useEffect(() => {
    let mounted = true;
    // collect numeric ids referenced in values that are not present in merged lookup
    const collectIdsFrom = (source: unknown): string[] => {
      if (!Array.isArray(source)) return [];
      return source
        .map((v) => {
          if (v == null) return null;
          if (typeof v === 'string') {
            const trimmed = v.trim();
            if (!trimmed) return null;
            if (trimmed.startsWith('#')) return trimmed.slice(1);
            return trimmed;
          }
          if (typeof v === 'object' && 'id' in (v as Record<string, unknown>)) {
            const idv = normalizeEntityId((v as { id?: unknown }).id);
            return idv != null ? idv : null;
          }
          return null;
        })
        .filter((x): x is string => Boolean(x));
    };

    const ids = new Set<string>([
      ...collectIdsFrom(values.partners),
      ...collectIdsFrom(values.parents),
      ...collectIdsFrom(values.children),
    ]);
    const missing: string[] = [];
    ids.forEach((id) => {
      if (!mergedAlterIdLookup[id]) missing.push(id);
    });
    if (!missing.length) return;

    (async () => {
      try {
        const entries: Array<[string, string]> = [];
        await Promise.all(
          missing.map(async (id) => {
            try {
              const normalizedId = normalizeEntityId(id);
              if (!normalizedId) return;
              const alter = await getAlterById(normalizedId);
              // alter is already the unwrapped object or null
              if (alter && alter.id != null) {
                const key = normalizeEntityId(alter.id);
                if (!key) return null;
                const label = (alter.name ?? (alter as any).username ?? `#${key}`) as string;
                entries.push([key, label]);
              }
            } catch (e) {
              // ignore per-id failures
            }
          }),
        );
        if (!mounted) return;
        if (entries.length) {
          setLocalAlterIdLookup((prev) => {
            const next = { ...prev };
            for (const [k, v] of entries) next[k] = v;
            return next;
          });
        }
      } catch (e) {
        // ignore
      }
    })();

    return () => {
      mounted = false;
    };
  }, [values.partners, values.parents, values.children, props.alterIdNameMap, mergedAlterIdLookup]);

  // If we are editing an existing alter (values.id), load its relationships via
  // the relationships endpoint and use any returned usernames to seed the local
  // id->name lookup. This is cheaper than fetching each referenced alter
  // individually and ensures tags render even when relationships weren't
  // included with the alter payload.
  React.useEffect(() => {
    let mounted = true;
    const thisId = values.id;
    if (thisId == null) return;
    (async () => {
      try {
  const rels = await getRelationships(String(thisId));
        const entries: Array<[string, string]> = [];
        for (const r of rels) {
          const aid = (r as any).alter_id ?? null;
          const uname = (r as any).username ?? null;
          if (aid != null) {
            const key = String(aid);
            if (!mergedAlterIdLookup[key]) {
              const label = uname ? String(uname) : `#${key}`;
              entries.push([key, label]);
            }
          }
        }
        if (!mounted) return;
        if (entries.length) {
          setLocalAlterIdLookup((prev) => {
            const next = { ...prev };
            for (const [k, v] of entries) next[k] = v;
            return next;
          });
        }
      } catch (e) {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [values.id, mergedAlterIdLookup]);

  const partnerOptionList = partnerOptions ?? [];
  const parentOptionList = props.parentOptions ?? partnerOptionList;
  const childOptionList = props.childOptions ?? partnerOptionList;

  const partnerTagValue = React.useMemo(
    () => mapSelectionsToTagValues(values.partners, partnerOptionList, mergedAlterIdLookup),
    [values.partners, partnerOptionList, mergedAlterIdLookup],
  );

  const parentTagValue = React.useMemo(
    () => mapSelectionsToTagValues(values.parents, parentOptionList, mergedAlterIdLookup),
    [values.parents, parentOptionList, mergedAlterIdLookup],
  );

  const childTagValue = React.useMemo(
    () => mapSelectionsToTagValues(values.children, childOptionList, mergedAlterIdLookup),
    [values.children, childOptionList, mergedAlterIdLookup],
  );

  const relationshipFilter = React.useMemo(
    () =>
      createFilterOptions<RelationshipOption>({
        stringify: (option) => {
          const idStr = normalizeEntityId(option.id);
          const segments = [option.label, ...(option.aliases ?? [])];
          if (idStr) {
            segments.push(idStr, `#${idStr}`);
          }
          return segments
            .map((segment) => String(segment).trim().toLowerCase())
            .filter(Boolean)
            .join(' ');
        },
        matchFrom: 'any',
        trim: true,
      }),
    [],
  );

  React.useEffect(() => {
    debugLog('Partner option list updated', {
      count: partnerOptionList.length,
      example: partnerOptionList.slice(0, 5),
    });
  }, [partnerOptionList]);

  React.useEffect(() => {
    debugLog('Parent option list updated', { count: parentOptionList.length, example: parentOptionList.slice(0, 5) });
  }, [parentOptionList]);

  React.useEffect(() => {
    debugLog('Child option list updated', { count: childOptionList.length, example: childOptionList.slice(0, 5) });
  }, [childOptionList]);

  const resolveAlterTagLabel = React.useCallback(
    (item: TagValue): string => {
      if (item && typeof item === 'object') {
        const idKey = normalizeEntityId((item as RelationshipOption).id);
        if (idKey) {
          const label = alterIdLookup[idKey] ?? (item as RelationshipOption).label;
          return stripTrailingId(label);
        }
        return stripTrailingId((item as RelationshipOption).label ?? '');
      }
      const raw = String(item ?? '').trim();
      if (!raw) return '';
      const direct = alterIdLookup[raw];
      if (direct) return stripTrailingId(direct);
      if (raw.startsWith('#')) {
        const hashMatch = alterIdLookup[raw.slice(1)];
        if (hashMatch) return stripTrailingId(hashMatch);
      }
      const numericKey = raw.startsWith('#') ? raw.slice(1) : raw;
      const numericMatch = alterIdLookup[numericKey];
      if (numericMatch) return stripTrailingId(numericMatch);
      const lower = raw.toLowerCase();
      const matchedValue = Object.entries(alterIdLookup).find(([, label]) => label.toLowerCase() === lower);
      if (matchedValue) return stripTrailingId(matchedValue[1]);
      return stripTrailingId(raw);
    },
    [alterIdLookup],
  );

  const renderAlterRelationshipTags = React.useCallback(
    (tagValue: readonly (RelationshipOption | string)[], getTagProps: AutocompleteRenderGetTagProps) =>
      (tagValue as TagValue[]).map((item, index) => {
        const { key, ...chipProps } = getTagProps({ index });
        const label = resolveAlterTagLabel(item);
        return <Chip key={key} variant="outlined" label={label} {...chipProps} />;
      }),
    [resolveAlterTagLabel],
  );

  React.useEffect(() => {
    debugLog('Partner tag value recalculated', partnerTagValue);
  }, [partnerTagValue]);

  React.useEffect(() => {
    debugLog('Parent tag value recalculated', parentTagValue);
  }, [parentTagValue]);

  React.useEffect(() => {
    debugLog('Child tag value recalculated', childTagValue);
  }, [childTagValue]);

  const resolveUserTagLabel = React.useCallback(
    (item: TagValue): string => {
      if (item && typeof item === 'object') {
        const idKey = normalizeEntityId((item as RelationshipOption).id);
        if (idKey) return userIdLookup[idKey] ?? (item as RelationshipOption).label;
        return (item as RelationshipOption).label ?? '';
      }
      const raw = String(item ?? '').trim();
      if (!raw) return '';
      const direct = userIdLookup[raw];
      if (direct) return direct;
      if (raw.startsWith('#')) {
        const hashMatch = userIdLookup[raw.slice(1)];
        if (hashMatch) return hashMatch;
      }
      const lower = raw.toLowerCase();
      const matchedValue = Object.entries(userIdLookup).find(([, label]) => label.toLowerCase() === lower);
      if (matchedValue) return matchedValue[1];
      return raw;
    },
    [userIdLookup],
  );

  const renderUserRelationshipTags = React.useCallback(
    (tagValue: readonly (RelationshipOption | string)[], getTagProps: AutocompleteRenderGetTagProps) =>
      (tagValue as TagValue[]).map((item, index) => {
        const { key, ...chipProps } = getTagProps({ index });
        const label = resolveUserTagLabel(item);
        return <Chip key={key} variant="outlined" label={label} {...chipProps} />;
      }),
    [resolveUserTagLabel],
  );

  function dragStart(e: React.DragEvent<HTMLDivElement>, idx: number) {
    e.dataTransfer.setData('text/plain', String(idx));
  }
  function dragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }
  function drop(e: React.DragEvent<HTMLDivElement>, idx: number) {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/plain');
    const parsed = parseInt(String(raw), 10);
    const from = Number.isNaN(parsed) ? null : parsed;
    if (from !== null && from !== idx && onReorderImages) onReorderImages(from, idx);
  }
  const dndAreaStyle: React.CSSProperties = {
    border: '2px dashed #999',
    padding: 12,
    marginTop: 12,
    textAlign: 'center',
    borderRadius: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    cursor: 'pointer',
  };
  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith('image/'));
    if (files.length) onFile([...(values._files || []), ...files]);
  }
  function handleDndOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
  }

  return (
    <Stack spacing={1} sx={{ mt: 1 }}>
      <StackItem>
        <TextField
          label="Name"
          value={values.name || ''}
          onChange={(e) => onChange('name', e.target.value)}
          error={!!errors.name}
          helperText={errors.name}
          fullWidth
        />
      </StackItem>

      {showDescription ? (
        <StackItem>
          <TextField
            label="Description"
            value={values.description || ''}
            onChange={(e) => onChange('description', e.target.value)}
            error={!!errors.description}
            helperText={errors.description}
            fullWidth
            multiline
          />
        </StackItem>
      ) : null}

      <StackItem>
        <TextField
          label="Species"
          value={values.species || ''}
          onChange={(e) => onChange('species', e.target.value)}
          error={!!errors.species}
          helperText={errors.species}
          fullWidth
        />
      </StackItem>

      <StackItem>
        <TextField
          label="Job"
          value={values.job || ''}
          onChange={(e) => onChange('job', e.target.value)}
          error={!!errors.job}
          helperText={errors.job}
          fullWidth
        />
      </StackItem>

      <StackItem>
        <TextField
          label="Weapon"
          value={values.weapon || ''}
          onChange={(e) => onChange('weapon', e.target.value)}
          error={!!errors.weapon}
          helperText={errors.weapon}
          fullWidth
        />
      </StackItem>

      <StackItem>
        <TextField
          label="Pronouns"
          value={values.pronouns || ''}
          onChange={(e) => onChange('pronouns', e.target.value)}
          error={!!errors.pronouns}
          helperText={errors.pronouns}
          fullWidth
        />
      </StackItem>

      <StackItem>
        <TextField
          label="Gender"
          value={values.gender || ''}
          onChange={(e) => onChange('gender', e.target.value)}
          error={!!errors.gender}
          helperText={errors.gender}
          fullWidth
        />
      </StackItem>

      <StackItem>
        <TextField
          label="Age"
          value={values.age || ''}
          onChange={(e) => onChange('age', e.target.value)}
          error={!!errors.age}
          helperText={errors.age}
          fullWidth
        />
      </StackItem>

      <StackItem>
        <TextField
          label="Birthday (DD-MM)"
          placeholder="DD-MM"
          value={values.birthday || ''}
          onChange={(e) => onChange('birthday', e.target.value)}
          error={!!errors.birthday}
          helperText={errors.birthday}
          fullWidth
        />
      </StackItem>

      <StackItem>
        <TextField
          label="Sexuality"
          value={values.sexuality || ''}
          onChange={(e) => onChange('sexuality', e.target.value)}
          error={!!errors.sexuality}
          helperText={errors.sexuality}
          fullWidth
        />
      </StackItem>

      <StackItem>
        <Autocomplete<RelationshipOption, true, false, true>
          multiple
          freeSolo
          options={partnerOptionList}
          filterSelectedOptions
          disableCloseOnSelect
          openOnFocus
          autoHighlight
          onOpen={() => debugLog('Partner autocomplete opened', { optionCount: partnerOptionList.length })}
          onInputChange={(event, value, reason) => debugLog('Partner autocomplete input', { value, reason })}
          getOptionLabel={(option: RelationshipOption | string) => (typeof option === 'string' ? option : option.label)}
          isOptionEqualToValue={(option, value) => {
            if (value && typeof value === 'object') {
              return normalizeEntityId(option.id) === normalizeEntityId((value as RelationshipOption).id);
            }
            return option.label.toLowerCase() === String(value ?? '').toLowerCase();
          }}
          filterOptions={relationshipFilter}
          value={partnerTagValue}
          onChange={(e: React.SyntheticEvent, v: (RelationshipOption | string)[] | null) => {
            const selections = (v || []) as TagValue[];
            const converted = convertLabelsToIdentifiers(selections, props.partnerMap, alterIdLookup);
            debugLog('Partner selection changed', { raw: selections, converted });
            onChange('partners', converted);
          }}
          renderTags={renderAlterRelationshipTags}
          renderInput={(params) => (
            <TextField {...params} label={partnerLabel || 'Partner(s)'} placeholder="Add partner(s)" />
          )}
          fullWidth
        />
      </StackItem>

      <StackItem>
        <Autocomplete<RelationshipOption, true, false, true>
          multiple
          freeSolo
          options={parentOptionList}
          filterSelectedOptions
          disableCloseOnSelect
          openOnFocus
          autoHighlight
          onOpen={() => debugLog('Parent autocomplete opened', { optionCount: parentOptionList.length })}
          onInputChange={(event, value, reason) => debugLog('Parent autocomplete input', { value, reason })}
          getOptionLabel={(option: RelationshipOption | string) => (typeof option === 'string' ? option : option.label)}
          isOptionEqualToValue={(option, value) => {
            if (value && typeof value === 'object') {
              return normalizeEntityId(option.id) === normalizeEntityId((value as RelationshipOption).id);
            }
            return option.label.toLowerCase() === String(value ?? '').toLowerCase();
          }}
          filterOptions={relationshipFilter}
          value={parentTagValue}
          onChange={(e: React.SyntheticEvent, v: (RelationshipOption | string)[] | null) => {
            const selections = (v || []) as TagValue[];
            const converted = convertLabelsToIdentifiers(selections, props.parentMap, alterIdLookup);
            debugLog('Parent selection changed', { raw: selections, converted });
            onChange('parents', converted);
          }}
          renderTags={renderAlterRelationshipTags}
          renderInput={(params) => <TextField {...params} label={'Parent(s)'} placeholder="Add parent(s)" />}
          fullWidth
        />
      </StackItem>

      <StackItem>
        <Autocomplete<RelationshipOption, true, false, true>
          multiple
          freeSolo
          options={childOptionList}
          filterSelectedOptions
          disableCloseOnSelect
          openOnFocus
          autoHighlight
          onOpen={() => debugLog('Child autocomplete opened', { optionCount: childOptionList.length })}
          onInputChange={(event, value, reason) => debugLog('Child autocomplete input', { value, reason })}
          getOptionLabel={(option: RelationshipOption | string) => (typeof option === 'string' ? option : option.label)}
          isOptionEqualToValue={(option, value) => {
            if (value && typeof value === 'object') {
              return normalizeEntityId(option.id) === normalizeEntityId((value as RelationshipOption).id);
            }
            return option.label.toLowerCase() === String(value ?? '').toLowerCase();
          }}
          filterOptions={relationshipFilter}
          value={childTagValue}
          onChange={(e: React.SyntheticEvent, v: (RelationshipOption | string)[] | null) => {
            const selections = (v || []) as TagValue[];
            const converted = convertLabelsToIdentifiers(selections, props.childMap, alterIdLookup);
            debugLog('Child selection changed', { raw: selections, converted });
            onChange('children', converted);
          }}
          renderTags={renderAlterRelationshipTags}
          renderInput={(params) => <TextField {...params} label={'Child(ren)'} placeholder="Add child(ren)" />}
          fullWidth
        />
      </StackItem>

      <StackItem>
        <Autocomplete
          multiple
          freeSolo={false}
          options={props.userPartnerOptions || []}
          filterSelectedOptions
          disableCloseOnSelect
          openOnFocus
          autoHighlight
          onOpen={() =>
            debugLog('User partner autocomplete opened', {
              optionCount: props.userPartnerOptions?.length ?? 0,
            })
          }
          onInputChange={(event, value, reason) => debugLog('User partner autocomplete input', { value, reason })}
          value={mapToLabels(values.user_partners, userIdLookup)}
          onChange={(e: React.SyntheticEvent, v: string[] | null) => {
            const names = (v || []).map((name) => (name == null ? '' : String(name).trim())).filter(Boolean);
            const converted = convertLabelsToIdentifiers(names, props.userPartnerMap, userIdLookup);
            onChange('user_partners', converted);
          }}
          renderTags={renderUserRelationshipTags}
          renderInput={(params) => (
            <TextField {...params} label={'User Partner(s)'} placeholder="Add user partner(s)" />
          )}
          fullWidth
        />
      </StackItem>

      <StackItem>
        <Autocomplete
          multiple
          freeSolo={false}
          options={props.userParentOptions || []}
          filterSelectedOptions
          disableCloseOnSelect
          openOnFocus
          autoHighlight
          onOpen={() =>
            debugLog('User parent autocomplete opened', {
              optionCount: props.userParentOptions?.length ?? 0,
            })
          }
          onInputChange={(event, value, reason) => debugLog('User parent autocomplete input', { value, reason })}
          value={mapToLabels(values.user_parents, userIdLookup)}
          onChange={(e: React.SyntheticEvent, v: string[] | null) => {
            const names = (v || []).map((name) => (name == null ? '' : String(name).trim())).filter(Boolean);
            const converted = convertLabelsToIdentifiers(names, props.userParentMap, userIdLookup);
            onChange('user_parents', converted);
          }}
          renderTags={renderUserRelationshipTags}
          renderInput={(params) => <TextField {...params} label={'User Parent(s)'} placeholder="Add user parent(s)" />}
          fullWidth
        />
      </StackItem>

      <StackItem>
        <Autocomplete
          multiple
          freeSolo={false}
          options={props.userChildOptions || []}
          filterSelectedOptions
          disableCloseOnSelect
          openOnFocus
          autoHighlight
          onOpen={() =>
            debugLog('User child autocomplete opened', {
              optionCount: props.userChildOptions?.length ?? 0,
            })
          }
          onInputChange={(event, value, reason) => debugLog('User child autocomplete input', { value, reason })}
          value={mapToLabels(values.user_children, userIdLookup)}
          onChange={(e: React.SyntheticEvent, v: string[] | null) => {
            const names = (v || []).map((name) => (name == null ? '' : String(name).trim())).filter(Boolean);
            const converted = convertLabelsToIdentifiers(names, props.userChildMap, userIdLookup);
            onChange('user_children', converted);
          }}
          renderTags={renderUserRelationshipTags}
          renderInput={(params) => (
            <TextField {...params} label={'User Child(ren)'} placeholder="Add user child(ren)" />
          )}
          fullWidth
        />
      </StackItem>

      <StackItem>
        <GroupPicker
          multiple={true}
          value={
            Array.isArray(values.affiliations)
              ? values.affiliations.map((value) => String(value)).filter((s) => s.length > 0)
              : []
          }
          routeUid={normalizedRouteUid}
          onChange={async (v: string | string[] | null) => {
            try {
              if (!v || (Array.isArray(v) && v.length === 0)) {
                onChange('group', null);
                onChange('affiliations', []);
              } else {
                const ids = (Array.isArray(v) ? v : [v]).map((value) => String(value)).filter(Boolean);
                if (!ids.length) {
                  onChange('group', null);
                  onChange('affiliations', []);
                  return;
                }
                onChange('group', ids[0] ?? null);
                onChange('affiliations', ids);
              }
            } catch (e) {
              // ignore
            }
          }}
        />
      </StackItem>

      <StackItem>
        <TextField
          label="Type"
          value={values.alter_type || ''}
          onChange={(e) => onChange('alter_type', e.target.value)}
          error={!!errors.alter_type}
          helperText={errors.alter_type}
          fullWidth
        />
      </StackItem>

      <StackItem>
        <Autocomplete
          multiple
          freeSolo
          options={[]}
          value={(() => {
            const raw = (values as any).system_roles;
            let vals: string[] = [];
            if (Array.isArray(raw)) vals = raw.map((x) => (x == null ? '' : String(x).trim())).filter(Boolean);
            else if (typeof raw === 'string') {
              const s = raw.trim();
              if (!s) vals = [];
              else {
                try {
                  const p = JSON.parse(s);
                  if (Array.isArray(p)) vals = p.map((x) => (x == null ? '' : String(x).trim())).filter(Boolean);
                  else vals = [s];
                } catch (e) {
                  if (s.indexOf(',') !== -1)
                    vals = s
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean);
                  else vals = [s];
                }
              }
            } else if (raw || raw === 0) vals = [String(raw)];
            return vals;
          })()}
          onChange={(e: React.SyntheticEvent, v: string[] | null) => {
            let names = (v || []).map((n) => (n == null ? '' : String(n).trim())).filter(Boolean);
            // Flatten any JSON-like strings
            names = names.flatMap((n) => {
              if (n.startsWith('[') && n.endsWith(']')) {
                try {
                  const parsed = JSON.parse(n);
                  if (Array.isArray(parsed)) {
                    return parsed.map((x) => (x == null ? '' : String(x).trim())).filter(Boolean);
                  }
                } catch (e) {}
              }
              return [n];
            });
            onChange('system_roles', names);
          }}
          renderInput={(params) => <TextField {...params} label={'Roles (system)'} placeholder="Add roles" />}
          fullWidth
        />
      </StackItem>

      <StackItem>
        <SubsystemPicker
          routeUid={normalizedRouteUid}
          value={(values.subsystem as any) ?? null}
          onChange={(v: number | string | null) => onChange('subsystem', v)}
        />
      </StackItem>

      <StackItem>
        <TextField
          label="Soul songs (comma separated)"
          value={soulSongsInput}
          onChange={(e) => {
            const next = e.target.value;
            setSoulSongsInput(next);
            onChange('soul_songs', parseCommaSeparated(next));
          }}
          error={!!errors.soul_songs}
          helperText={errors.soul_songs}
          fullWidth
        />
      </StackItem>

      <StackItem>
        <TextField
          label="Interests (comma separated)"
          value={interestsInput}
          onChange={(e) => {
            const next = e.target.value;
            setInterestsInput(next);
            // Keep interests as a plain string for the backend TEXT field
            onChange('interests', next);
          }}
          error={!!errors.interests}
          helperText={errors.interests}
          fullWidth
        />
      </StackItem>

      <StackItem>
        <TextField
          label="Triggers"
          value={values.triggers || ''}
          onChange={(e) => onChange('triggers', e.target.value)}
          error={!!errors.triggers}
          helperText={errors.triggers}
          fullWidth
          multiline
        />
      </StackItem>

      <StackItem>
        <FormGroup>
          {useSwitchForHost ? (
            <FormControlLabel
              control={
                <Switch
                  type="checkbox"
                  checked={Boolean(values.is_system_host)}
                  onChange={(e) => onChange('is_system_host', e.target.checked)}
                />
              }
              label="Is system host"
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="is_system_host"
                checked={Boolean(values.is_system_host)}
                onChange={(e) => onChange('is_system_host', e.target.checked)}
              />
              <label htmlFor="is_system_host">Is system host</label>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <input
              type="checkbox"
              id="is_dormant"
              checked={Boolean((values as any).is_dormant)}
              onChange={(e) => onChange('is_dormant', e.target.checked)}
            />
            <label htmlFor="is_dormant">Is Dormant/Dead</label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <input
              type="checkbox"
              id="is_merged"
              checked={Boolean((values as any).is_merged)}
              onChange={(e) => onChange('is_merged', e.target.checked)}
            />
            <label htmlFor="is_merged">Is Merged</label>
          </div>
        </FormGroup>
      </StackItem>

      <StackItem>
        <div>
          <label>Notes</label>
          <RichEditor
            value={values.notes || ''}
            onChange={(v: string) => onChange('notes', v)}
            placeholder={'Notes (markdown)'}
            uploadUrl={undefined}
          />
          {errors.notes ? <div style={{ color: 'red' }}>{errors.notes}</div> : null}
        </div>
        {uploading ? <div>Uploading...</div> : null}
        {/* Existing images (for edit) */}
        {Array.isArray(values.images) && values.images.length ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Images</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {values.images.map((url: string, i: number) => (
                <div
                  key={url + '_' + i}
                  draggable={!!onReorderImages}
                  onDragStart={(e) => dragStart(e, i)}
                  onDragOver={dragOver}
                  onDrop={(e) => drop(e, i)}
                  style={{
                    border: '1px solid #ccc',
                    padding: 4,
                    borderRadius: 4,
                    position: 'relative',
                    width: 90,
                    height: 90,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#fafafa',
                    boxShadow: i === 0 ? '0 0 0 2px #1976d2' : undefined,
                  }}
                >
                  {i === 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: -8,
                        left: -8,
                        background: '#1976d2',
                        color: '#fff',
                        fontSize: 10,
                        padding: '2px 4px',
                        borderRadius: 4,
                      }}
                    >
                      Primary
                    </div>
                  )}
                  <img src={url} alt="alter" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }} />
                  {onDeleteImage && (
                    <Tooltip title="Delete image">
                      <IconButton
                        size="small"
                        onClick={() => onDeleteImage(url)}
                        style={{ position: 'absolute', top: -10, right: -10, background: '#fff' }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {/* Pending (new) files preview (create/edit before upload) */}
        {values._files && values._files.length ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Pending Uploads</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {values._files.map((f: File, idx: number) => {
                const url = URL.createObjectURL(f);
                return (
                  <div
                    key={idx + '_' + f.name}
                    style={{
                      border: '1px solid #ccc',
                      padding: 4,
                      borderRadius: 4,
                      position: 'relative',
                      width: 90,
                      height: 90,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#fafafa',
                    }}
                  >
                    <img src={url} alt={f.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }} />
                    {progressMap && typeof progressMap[f.name] === 'number' && (
                      <div style={{ position: 'absolute', left: 2, right: 2, bottom: 2 }}>
                        <LinearProgress variant="determinate" value={progressMap[f.name]} />
                      </div>
                    )}
                    {onRemovePendingFile && (!progressMap || progressMap[f.name] === 100) && (
                      <Tooltip title="Remove">
                        <IconButton
                          size="small"
                          onClick={() => onRemovePendingFile(idx)}
                          style={{ position: 'absolute', top: -10, right: -10, background: '#fff' }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
        <div
          style={dndAreaStyle}
          onDrop={handleDrop}
          onDragOver={handleDndOver}
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.multiple = true;
            input.onchange = (ev: any) => {
              const list = Array.from(ev.target.files || []) as File[];
              if (list.length) onFile([...((values._files || []) as File[]), ...list]);
            };
            input.click();
          }}
        >
          Drag & drop images here or click to select
        </div>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
          Maximum file size: 20MB per image
        </Typography>
      </StackItem>
    </Stack>
  );
}
