import React from 'react';
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
import RichEditor from './RichEditor';
import GroupPicker from './GroupPicker';
import SubsystemPicker from './SubsystemPicker';
import { apiClient, type Alter } from '@didhub/api-client';
import { StackItem } from './StackItem';

function debugLog(...args: unknown[]) {
  console.debug('[AlterForm]', ...args);
}

export interface RelationshipOption {
  id: number | string;
  label: string;
  aliases?: string[];
}

type TagValue = string | RelationshipOption;

export interface AlterFormFieldsProps {
  values: Partial<Alter> & { _files?: File[] };
  errors: Record<string, string>;
  partnerOptions: RelationshipOption[];
  partnerMap?: Record<string, number | string>;
  parentOptions?: RelationshipOption[];
  parentMap?: Record<string, number | string>;
  childOptions?: RelationshipOption[];
  childMap?: Record<string, number | string>;
  userPartnerOptions?: string[];
  userPartnerMap?: Record<string, number | string>;
  userParentOptions?: string[];
  userParentMap?: Record<string, number | string>;
  userChildOptions?: string[];
  userChildMap?: Record<string, number | string>;
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
  routeUid?: string | number | null;
}

function coerceIdentifier(value: number | string): number | string {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? value : parsed;
}

function toDisplayLabel(value: unknown, idLookup: Record<string, string>): string | null {
  if (value == null) return null;
  if (typeof value === 'object') {
    const maybeNamed =
      (value as { name?: unknown }).name ??
      (value as { label?: unknown }).label ??
      (value as { display_name?: unknown }).display_name ??
      (value as { username?: unknown }).username;
    if (maybeNamed != null && maybeNamed !== '') return String(maybeNamed);
    if ('id' in (value as Record<string, unknown>)) {
      const idValue = (value as { id?: unknown }).id;
      if (idValue != null) {
        const label = idLookup[String(idValue)];
        if (label) return label;
      }
    }
  }
  const label = idLookup[String(value)];
  if (label) return label;
  const str = String(value);
  if (!str || str === '[object Object]') return null;
  return str;
}

function stripTrailingId(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return trimmed;
  const withoutTrailingId = trimmed.replace(/\s*#\d+$/u, '').trim();
  return withoutTrailingId || trimmed;
}

function mapToLabels(source: unknown, idLookup: Record<string, string>): string[] {
  if (!Array.isArray(source)) return [];
  return (source as unknown[])
    .map((item) => {
      const label = toDisplayLabel(item, idLookup);
      return label ? label.trim() : '';
    })
    .filter((label) => Boolean(label));
}

function buildNameLookup(
  primary?: Record<string, number | string>,
  idLookup?: Record<string, string>,
): Record<string, number | string> {
  const result: Record<string, number | string> = {};
  if (primary) {
    Object.entries(primary).forEach(([name, id]) => {
      if (!name) return;
      result[name] = id;
      result[name.toLowerCase()] = id;
    });
  }
  if (idLookup) {
    Object.entries(idLookup).forEach(([id, label]) => {
      if (!label) return;
      const coerced = coerceIdentifier(id);
      result[label] = coerced;
      result[label.toLowerCase()] = coerced;
    });
  }
  return result;
}

function convertLabelsToIdentifiers(
  selections: TagValue[],
  primary?: Record<string, number | string>,
  idLookup?: Record<string, string>,
): Array<number | string> {
  const lookup = buildNameLookup(primary, idLookup);
  debugLog('Converting selections to identifiers', {
    selections,
    primaryKeys: primary ? Object.keys(primary) : [],
    idLookupKeys: idLookup ? Object.keys(idLookup) : [],
  });
  return selections.map((selection) => {
    if (selection && typeof selection === 'object') {
      return coerceIdentifier(selection.id);
    }
    const trimmed = String(selection ?? '').trim();
    if (!trimmed) return trimmed;
    const match = lookup[trimmed] ?? lookup[trimmed.toLowerCase()];
    if (typeof match !== 'undefined') return coerceIdentifier(match);
    if (trimmed.startsWith('#')) {
      const numericFromHash = Number(trimmed.slice(1));
      if (!Number.isNaN(numericFromHash)) return numericFromHash;
    }
    const numeric = Number(trimmed);
    return Number.isNaN(numeric) ? trimmed : numeric;
  });
}

function buildOptionIndexes(options: RelationshipOption[]) {
  const byId = new Map<string, RelationshipOption>();
  const byAlias = new Map<string, RelationshipOption>();
  options.forEach((option) => {
    const idKey = String(option.id);
    byId.set(idKey, option);
    byAlias.set(idKey, option);
    byAlias.set(`#${idKey}`, option);
    const labelLower = option.label.toLowerCase();
    byAlias.set(labelLower, option);
    if (option.aliases) {
      option.aliases
        .map((alias) => alias.trim().toLowerCase())
        .filter(Boolean)
        .forEach((alias) => {
          if (!byAlias.has(alias)) byAlias.set(alias, option);
        });
    }
  });
  return { byId, byAlias };
}

function mapSelectionsToTagValues(
  source: unknown,
  options: RelationshipOption[],
  idLookup: Record<string, string>,
): TagValue[] {
  if (!Array.isArray(source)) return [];
  if (!options.length && Object.keys(idLookup).length === 0) {
    debugLog('No options or lookup available; falling back to raw labels', { source });
    return mapToLabels(source, idLookup);
  }
  const { byId, byAlias } = buildOptionIndexes(options);
  debugLog('Mapping selections to tag values', {
    source,
    optionsCount: options.length,
    idLookupKeys: Object.keys(idLookup),
  });
  return (source as unknown[])
    .map((item) => {
      if (item == null) return null;

      const potentialIds: string[] = [];
      if (typeof item === 'number') {
        potentialIds.push(String(item));
      } else if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed) {
          potentialIds.push(trimmed);
          if (trimmed.startsWith('#')) potentialIds.push(trimmed.slice(1));
        }
      } else if (typeof item === 'object' && 'id' in (item as Record<string, unknown>)) {
        const idValue = (item as { id?: unknown }).id;
        if (idValue != null) potentialIds.push(String(idValue));
      }

      for (const candidate of potentialIds) {
        if (!candidate) continue;
        if (byId.has(candidate)) return byId.get(candidate)!;
        const lower = candidate.toLowerCase();
        if (byAlias.has(lower)) return byAlias.get(lower)!;
      }

      const label = toDisplayLabel(item, idLookup);
      if (label) {
        const trimmed = label.trim();
        if (trimmed) {
          const lower = trimmed.toLowerCase();
          if (byAlias.has(lower)) return byAlias.get(lower)!;
          const candidateId = potentialIds.find(Boolean);
          if (candidateId) {
            const normalized = candidateId.startsWith('#') ? candidateId.slice(1) : candidateId;
            const mapped = { id: coerceIdentifier(normalized), label: trimmed, aliases: [] };
            debugLog('Constructed synthetic option from label', mapped);
            return mapped;
          }
          return trimmed;
        }
      }

      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (!trimmed) return null;
        const lower = trimmed.toLowerCase();
        if (byAlias.has(lower)) return byAlias.get(lower)!;
        const normalized = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
        const inferred = idLookup[normalized] ?? idLookup[trimmed];
        if (inferred) {
          const mapped = { id: coerceIdentifier(normalized), label: inferred, aliases: [] };
          debugLog('Constructed synthetic option from string', mapped);
          return mapped;
        }
        return trimmed;
      }

      if (typeof item === 'number') {
        const idKey = String(item);
        if (byId.has(idKey)) return byId.get(idKey)!;
        const inferred = idLookup[idKey];
        if (inferred) {
          const mapped = { id: coerceIdentifier(idKey), label: inferred, aliases: [] };
          debugLog('Constructed synthetic option from number', mapped);
          return mapped;
        }
        return idKey;
      }

      return null;
    })
    .filter((value): value is TagValue => Boolean(value));
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
    if (Array.isArray(values.interests)) {
      setInterestsInput(values.interests.join(', '));
    } else if (typeof values.interests === 'string') {
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

  const partnerOptionList = partnerOptions ?? [];
  const parentOptionList = props.parentOptions ?? partnerOptionList;
  const childOptionList = props.childOptions ?? partnerOptionList;

  const partnerTagValue = React.useMemo(
    () => mapSelectionsToTagValues(values.partners, partnerOptionList, alterIdLookup),
    [values.partners, partnerOptionList, alterIdLookup],
  );

  const parentTagValue = React.useMemo(
    () => mapSelectionsToTagValues(values.parents, parentOptionList, alterIdLookup),
    [values.parents, parentOptionList, alterIdLookup],
  );

  const childTagValue = React.useMemo(
    () => mapSelectionsToTagValues(values.children, childOptionList, alterIdLookup),
    [values.children, childOptionList, alterIdLookup],
  );

  const relationshipFilter = React.useMemo(
    () =>
      createFilterOptions<RelationshipOption>({
        stringify: (option) =>
          [option.label, String(option.id), `#${option.id}`, ...(option.aliases ?? [])]
            .map((segment) => segment.trim().toLowerCase())
            .filter(Boolean)
            .join(' '),
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
        const idKey = String((item as RelationshipOption).id);
        const label = alterIdLookup[idKey] ?? (item as RelationshipOption).label;
        return stripTrailingId(label);
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
        const idKey = String((item as RelationshipOption).id);
        return userIdLookup[idKey] ?? (item as RelationshipOption).label;
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
    const from = Number(e.dataTransfer.getData('text/plain'));
    if (!Number.isNaN(from) && from !== idx && onReorderImages) onReorderImages(from, idx);
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
              return String(option.id) === String((value as RelationshipOption).id);
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
              return String(option.id) === String((value as RelationshipOption).id);
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
              return String(option.id) === String((value as RelationshipOption).id);
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
              ? values.affiliations.filter((value): value is number => typeof value === 'number')
              : []
          }
          routeUid={props.routeUid}
          onChange={async (v: number | number[] | null) => {
            try {
              if (!v || (Array.isArray(v) && v.length === 0)) {
                onChange('group', null);
                onChange('affiliations', []);
              } else {
                const ids = (Array.isArray(v) ? v : [v]).filter(
                  (value): value is number => typeof value === 'number' && Number.isFinite(value),
                );
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
          routeUid={props.routeUid}
          value={values.subsystem ?? null}
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
            onChange('interests', parseCommaSeparated(next));
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
