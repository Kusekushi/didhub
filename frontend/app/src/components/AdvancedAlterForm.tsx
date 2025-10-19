import * as React from 'react'
import { Alter, User } from '@didhub/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectLabel, SelectItem } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

type FormData = {
  id?: string
  name: string
  pronouns?: string
  description?: string
  age?: string
  gender?: string
  birthday?: string
  sexuality?: string
  species?: string
  alterType?: string
  job?: string
  weapon?: string
  systemRoles?: string[]
  isSystemHost?: boolean
  isDormant?: boolean
  isMerged?: boolean
  soulSongs?: string[]
  interests?: string[]
  triggers?: string[]
  notes?: string
  systemId?: string
  createdAt?: string
  updatedAt?: string
}

type SaveData = {
  name: string
  pronouns?: string
  description?: string
  age?: string
  gender?: string
  birthday?: string
  sexuality?: string
  species?: string
  alterType?: string
  job?: string
  weapon?: string
  systemRoles?: string[]
  isSystemHost?: boolean
  isDormant?: boolean
  isMerged?: boolean
  soulSongs?: string[]
  interests?: string[]
  triggers?: string[]
  notes?: string
  systemId?: string
}

type Props = {
  initial?: Alter | null
  mode?: 'create' | 'edit'
  systems?: User[]
  selectedSystemId?: string
  onSave: (data: SaveData) => Promise<void>
  onCancel?: () => void
  className?: string
}

export default function AdvancedAlterForm({ initial, mode = 'create', systems, selectedSystemId, onSave, onCancel, className }: Props) {
  const [form, setForm] = React.useState<FormData>({
    id: initial?.id,
    name: initial?.name || '',
    pronouns: initial?.pronouns || '',
    description: initial?.description || '',
    age: initial?.age || '',
    gender: initial?.gender || '',
    birthday: initial?.birthday || '',
    sexuality: initial?.sexuality || '',
    species: initial?.species || '',
    alterType: initial?.alterType || '',
    job: initial?.job || '',
    weapon: initial?.weapon || '',
    systemRoles: initial?.systemRoles || [],
    isSystemHost: initial?.isSystemHost || false,
    isDormant: initial?.isDormant || false,
    isMerged: initial?.isMerged || false,
    soulSongs: initial?.soulSongs || [],
    interests: initial?.interests || [],
    triggers: initial?.triggers || [],
    notes: initial?.notes || '',
    systemId: initial?.systemId || selectedSystemId || systems?.[0]?.id || '',
    createdAt: initial?.createdAt,
    updatedAt: initial?.updatedAt,
  })

  const [loading, setLoading] = React.useState(false)

  // Helper to convert comma-separated string to array
  const parseArrayField = (value: string): string[] => {
    return value.split(',').map(s => s.trim()).filter(s => s.length > 0)
  }

  // Helper to convert array to comma-separated string for display
  const arrayToString = (arr?: string[]): string => {
    return arr?.join(', ') || ''
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setLoading(true)
    try {
      await onSave({
        name: form.name,
        pronouns: form.pronouns,
        description: form.description,
        age: form.age,
        gender: form.gender,
        birthday: form.birthday,
        sexuality: form.sexuality,
        species: form.species,
        alterType: form.alterType,
        job: form.job,
        weapon: form.weapon,
        systemRoles: form.systemRoles,
        isSystemHost: form.isSystemHost,
        isDormant: form.isDormant,
        isMerged: form.isMerged,
        soulSongs: form.soulSongs,
        interests: form.interests,
        triggers: form.triggers,
        notes: form.notes,
        systemId: form.systemId,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={cn('space-y-4', className)}>
      {mode === 'edit' && form.id && (
        <div>
          <Label>Alter ID</Label>
          <Input value={form.id} readOnly />
        </div>
      )}

      {/* Basic Information */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="adv-alter-name">Name *</Label>
          <Input id="adv-alter-name" value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} />
        </div>
        <div>
          <Label htmlFor="adv-alter-pronouns">Pronouns</Label>
          <Input id="adv-alter-pronouns" value={form.pronouns} onChange={(e) => setForm(prev => ({ ...prev, pronouns: e.target.value }))} placeholder="e.g., she/her, he/him, they/them" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="adv-alter-age">Age</Label>
          <Input id="adv-alter-age" value={form.age} onChange={(e) => setForm(prev => ({ ...prev, age: e.target.value }))} placeholder="e.g., 25, ageless" />
        </div>
        <div>
          <Label htmlFor="adv-alter-gender">Gender</Label>
          <Input id="adv-alter-gender" value={form.gender} onChange={(e) => setForm(prev => ({ ...prev, gender: e.target.value }))} placeholder="e.g., female, non-binary" />
        </div>
        <div>
          <Label htmlFor="adv-alter-birthday">Birthday</Label>
          <Input id="adv-alter-birthday" value={form.birthday} onChange={(e) => setForm(prev => ({ ...prev, birthday: e.target.value }))} placeholder="e.g., March 15" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="adv-alter-sexuality">Sexuality</Label>
          <Input id="adv-alter-sexuality" value={form.sexuality} onChange={(e) => setForm(prev => ({ ...prev, sexuality: e.target.value }))} placeholder="e.g., bisexual, asexual" />
        </div>
        <div>
          <Label htmlFor="adv-alter-species">Species</Label>
          <Input id="adv-alter-species" value={form.species} onChange={(e) => setForm(prev => ({ ...prev, species: e.target.value }))} placeholder="e.g., human, dragon" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="adv-alter-type">Type</Label>
          <Input id="adv-alter-type" value={form.alterType} onChange={(e) => setForm(prev => ({ ...prev, alterType: e.target.value }))} placeholder="e.g., fictive, introject" />
        </div>
        <div>
          <Label htmlFor="adv-alter-job">Job</Label>
          <Input id="adv-alter-job" value={form.job} onChange={(e) => setForm(prev => ({ ...prev, job: e.target.value }))} placeholder="e.g., protector, caretaker" />
        </div>
      </div>

      <div>
        <Label htmlFor="adv-alter-weapon">Weapon</Label>
        <Input id="adv-alter-weapon" value={form.weapon} onChange={(e) => setForm(prev => ({ ...prev, weapon: e.target.value }))} placeholder="e.g., sword, magic" />
      </div>

      <div>
        <Label htmlFor="adv-alter-description">Description</Label>
        <Textarea id="adv-alter-description" rows={3} value={form.description} onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Brief description of this alter" />
      </div>

      {/* System Status */}
      <div className="space-y-3 p-4 border rounded-lg">
        <h3 className="font-medium">System Status</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-center space-x-2">
            <Switch id="adv-alter-host" checked={form.isSystemHost} onCheckedChange={(checked) => setForm(prev => ({ ...prev, isSystemHost: checked }))} />
            <Label htmlFor="adv-alter-host">System Host</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch id="adv-alter-dormant" checked={form.isDormant} onCheckedChange={(checked) => setForm(prev => ({ ...prev, isDormant: checked }))} />
            <Label htmlFor="adv-alter-dormant">Dormant/Dead</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch id="adv-alter-merged" checked={form.isMerged} onCheckedChange={(checked) => setForm(prev => ({ ...prev, isMerged: checked }))} />
            <Label htmlFor="adv-alter-merged">Merged</Label>
          </div>
        </div>
      </div>

      {/* Roles and Interests */}
      <div>
        <Label htmlFor="adv-alter-roles">Roles (comma-separated)</Label>
        <Input id="adv-alter-roles" value={arrayToString(form.systemRoles)} onChange={(e) => setForm(prev => ({ ...prev, systemRoles: parseArrayField(e.target.value) }))} placeholder="e.g., protector, gatekeeper, host" />
      </div>

      <div>
        <Label htmlFor="adv-alter-interests">Interests (comma-separated)</Label>
        <Input id="adv-alter-interests" value={arrayToString(form.interests)} onChange={(e) => setForm(prev => ({ ...prev, interests: parseArrayField(e.target.value) }))} placeholder="e.g., music, art, gaming" />
      </div>

      <div>
        <Label htmlFor="adv-alter-songs">Soul Songs (comma-separated)</Label>
        <Input id="adv-alter-songs" value={arrayToString(form.soulSongs)} onChange={(e) => setForm(prev => ({ ...prev, soulSongs: parseArrayField(e.target.value) }))} placeholder="e.g., Song Title - Artist" />
      </div>

      <div>
        <Label htmlFor="adv-alter-triggers">Triggers (comma-separated)</Label>
        <Input id="adv-alter-triggers" value={arrayToString(form.triggers)} onChange={(e) => setForm(prev => ({ ...prev, triggers: parseArrayField(e.target.value) }))} placeholder="e.g., loud noises, specific topics" />
      </div>

      <div>
        <Label htmlFor="adv-alter-notes">Notes</Label>
        <Textarea id="adv-alter-notes" rows={5} value={form.notes} onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))} placeholder="Additional notes about this alter..." />
      </div>

      {/* System Selection */}
      <div>
        <Label htmlFor="adv-alter-system">System</Label>
        {systems && systems.length > 0 ? (
          <Select value={form.systemId} onValueChange={(v) => setForm(prev => ({ ...prev, systemId: v }))}>
            <SelectTrigger id="adv-alter-system">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>DID-System</SelectLabel>
                {systems.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.username}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : (
          <Input id="adv-alter-system" value={form.systemId} onChange={(e) => setForm(prev => ({ ...prev, systemId: e.target.value }))} />
        )}
      </div>

      {mode === 'edit' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Created At</Label>
            <Input readOnly value={form.createdAt ?? ''} />
          </div>
          <div>
            <Label>Updated At</Label>
            <Input readOnly value={form.updatedAt ?? ''} />
          </div>
        </div>
      )}

      <div className="flex justify-end space-x-2">
        <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button onClick={handleSave} disabled={loading || !form.name.trim()}>
          {loading ? (mode === 'create' ? 'Creating...' : 'Saving...') : (mode === 'create' ? 'Create' : 'Save')}
        </Button>
      </div>
    </div>
  )
}

export { AdvancedAlterForm }
