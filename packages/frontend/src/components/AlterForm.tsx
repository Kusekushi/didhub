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
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import RichEditor from './RichEditor';
import GroupPicker from './GroupPicker';
import SubsystemPicker from './SubsystemPicker';
import { apiClient, type Alter } from '@didhub/api-client';
import { StackItem } from './StackItem';

export interface AlterFormFieldsProps {
  values: Partial<Alter> & { _files?: File[] };
  errors: Record<string, string>;
  partnerOptions: string[];
  partnerMap?: Record<string, number | string>;
  parentOptions?: string[];
  parentMap?: Record<string, number | string>;
  childOptions?: string[];
  childMap?: Record<string, number | string>;
  userPartnerOptions?: string[];
  userPartnerMap?: Record<string, number | string>;
  userParentOptions?: string[];
  userParentMap?: Record<string, number | string>;
  userChildOptions?: string[];
  userChildMap?: Record<string, number | string>;
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
        <Autocomplete
          multiple
          freeSolo
          options={partnerOptions}
          value={(() => {
            const vals = (values.partners && Array.isArray(values.partners) ? values.partners : []) as any[];
            const idToName: Record<string, string> = {};
            if (props.partnerMap) {
              Object.keys(props.partnerMap).forEach((name) => {
                const id = String((props.partnerMap as any)[name]);
                idToName[id] = name;
              });
            }
            return vals.map((v) =>
              v == null
                ? ''
                : typeof v === 'string' || typeof v === 'number'
                  ? idToName[String(v)] || String(v)
                  : String(v),
            );
          })()}
          onChange={(e: React.SyntheticEvent, v: string[] | null) => {
            const names = v || [];
            const map = props.partnerMap || {};
            const converted = names.map((n) => {
              const id = map[String(n).toLowerCase()];
              return typeof id !== 'undefined' ? id : n;
            });
            onChange('partners', converted);
          }}
          renderInput={(params) => (
            <TextField {...params} label={partnerLabel || 'Partner(s)'} placeholder="Add partner(s)" />
          )}
          fullWidth
        />
      </StackItem>

      <StackItem>
        <Autocomplete
          multiple
          freeSolo
          options={props.parentOptions || partnerOptions}
          value={(() => {
            const vals = (values.parents && Array.isArray(values.parents) ? values.parents : []) as any[];
            const idToName: Record<string, string> = {};
            if (props.parentMap) {
              Object.keys(props.parentMap).forEach((name) => {
                const id = String((props.parentMap as any)[name]);
                idToName[id] = name;
              });
            }
            return vals.map((v) =>
              v == null
                ? ''
                : typeof v === 'string' || typeof v === 'number'
                  ? idToName[String(v)] || String(v)
                  : String(v),
            );
          })()}
          onChange={(e: React.SyntheticEvent, v: string[] | null) => {
            const names = v || [];
            const map = props.parentMap || {};
            const converted = names.map((n) => {
              const id = map[String(n).toLowerCase()];
              return typeof id !== 'undefined' ? id : n;
            });
            onChange('parents', converted);
          }}
          renderInput={(params) => <TextField {...params} label={'Parent(s)'} placeholder="Add parent(s)" />}
          fullWidth
        />
      </StackItem>

      <StackItem>
        <Autocomplete
          multiple
          freeSolo
          options={props.childOptions || partnerOptions}
          value={(() => {
            const vals = (values.children && Array.isArray(values.children) ? values.children : []) as any[];
            const idToName: Record<string, string> = {};
            if (props.childMap) {
              Object.keys(props.childMap).forEach((name) => {
                const id = String((props.childMap as any)[name]);
                idToName[id] = name;
              });
            }
            return vals.map((v) =>
              v == null
                ? ''
                : typeof v === 'string' || typeof v === 'number'
                  ? idToName[String(v)] || String(v)
                  : String(v),
            );
          })()}
          onChange={(e: React.SyntheticEvent, v: string[] | null) => {
            const names = v || [];
            const map = props.childMap || {};
            const converted = names.map((n) => {
              const id = map[String(n).toLowerCase()];
              return typeof id !== 'undefined' ? id : n;
            });
            onChange('children', converted);
          }}
          renderInput={(params) => <TextField {...params} label={'Child(ren)'} placeholder="Add child(ren)" />}
          fullWidth
        />
      </StackItem>

      <StackItem>
        <Autocomplete
          multiple
          freeSolo={false}
          options={props.userPartnerOptions || []}
          value={(() => {
            const vals = (
              values.user_partners && Array.isArray(values.user_partners) ? values.user_partners : []
            ) as any[];
            console.log('User partners values:', vals);
            const idToName: Record<string, string> = {};
            if (props.userPartnerMap) {
              Object.keys(props.userPartnerMap).forEach((name) => {
                const id = String((props.userPartnerMap as any)[name]);
                idToName[id] = name;
              });
            }
            const result = vals.map((v) =>
              v == null
                ? ''
                : typeof v === 'string' || typeof v === 'number'
                  ? idToName[String(v)] || String(v)
                  : String(v),
            );
            console.log('User partners display value:', result);
            return result;
          })()}
          onChange={(e: React.SyntheticEvent, v: string[] | null) => {
            const names = v || [];
            const map = props.userPartnerMap || {};
            const converted = names.map((n) => {
              const id = map[n];
              console.log('Converting user partner name:', n, 'to ID:', id);
              return typeof id !== 'undefined' ? id : n;
            });
            console.log('Setting user_partners to:', converted);
            onChange('user_partners', converted);
          }}
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
          value={(() => {
            const vals = (
              values.user_parents && Array.isArray(values.user_parents) ? values.user_parents : []
            ) as any[];
            const idToName: Record<string, string> = {};
            if (props.userParentMap) {
              Object.keys(props.userParentMap).forEach((name) => {
                const id = String((props.userParentMap as any)[name]);
                idToName[id] = name;
              });
            }
            return vals.map((v) =>
              v == null
                ? ''
                : typeof v === 'string' || typeof v === 'number'
                  ? idToName[String(v)] || String(v)
                  : String(v),
            );
          })()}
          onChange={(e: React.SyntheticEvent, v: string[] | null) => {
            const names = v || [];
            const map = props.userParentMap || {};
            const converted = names.map((n) => {
              const id = map[n];
              return typeof id !== 'undefined' ? id : n;
            });
            onChange('user_parents', converted);
          }}
          renderInput={(params) => <TextField {...params} label={'User Parent(s)'} placeholder="Add user parent(s)" />}
          fullWidth
        />
      </StackItem>

      <StackItem>
        <Autocomplete
          multiple
          freeSolo={false}
          options={props.userChildOptions || []}
          value={(() => {
            const vals = (
              values.user_children && Array.isArray(values.user_children) ? values.user_children : []
            ) as any[];
            const idToName: Record<string, string> = {};
            if (props.userChildMap) {
              Object.keys(props.userChildMap).forEach((name) => {
                const id = String((props.userChildMap as any)[name]);
                idToName[id] = name;
              });
            }
            return vals.map((v) =>
              v == null
                ? ''
                : typeof v === 'string' || typeof v === 'number'
                  ? idToName[String(v)] || String(v)
                  : String(v),
            );
          })()}
          onChange={(e: React.SyntheticEvent, v: string[] | null) => {
            const names = v || [];
            const map = props.userChildMap || {};
            const converted = names.map((n) => {
              const id = map[n];
              return typeof id !== 'undefined' ? id : n;
            });
            onChange('user_children', converted);
          }}
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
            (Array.isArray(values.affiliation) && values.affiliation.length
              ? values.affiliation
              : Array.isArray(values.group)
                ? (values.group as any)
                : values.affiliation || values.group || []) as any
          }
          onChange={async (v: number | string | (number | string)[] | null) => {
            onChange('group', v);
            try {
              if (!v || !(Array.isArray(v) ? v.length : true)) {
                onChange('affiliation', []);
              } else {
                const ids: Array<number | string> = [];
                const arr = Array.isArray(v) ? v : [v];
                for (const item of arr) {
                  if (typeof item === 'number') {
                    ids.push(item);
                  } else if (typeof item === 'string') {
                    // try to resolve a group by name to get its id
                    try {
                      const groups = await apiClient.groups.list({ query: String(item) || '' });
                      const found = groups.find(
                        (it) => it && it.name && String(it.name).toLowerCase() === String(item).toLowerCase(),
                      );
                      if (found && typeof found.id !== 'undefined') ids.push(found.id as number | string);
                      else ids.push(item);
                    } catch (e) {
                      // fallback to pushing the raw string
                      ids.push(item);
                    }
                  }
                }
                onChange('affiliation', ids);
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
          value={values.subsystem || ''}
          onChange={(v: number | string | null) => onChange('subsystem', v)}
        />
      </StackItem>

      <StackItem>
        <TextField
          label="Soul songs (comma separated)"
          value={
            values.soul_songs && Array.isArray(values.soul_songs)
              ? values.soul_songs.join(', ')
              : values.soul_songs || ''
          }
          onChange={(e) => onChange('soul_songs', e.target.value)}
          error={!!errors.soul_songs}
          helperText={errors.soul_songs}
          fullWidth
        />
      </StackItem>

      <StackItem>
        <TextField
          label="Interests (comma separated)"
          value={
            values.interests && Array.isArray(values.interests) ? values.interests.join(', ') : values.interests || ''
          }
          onChange={(e) => onChange('interests', e.target.value)}
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
