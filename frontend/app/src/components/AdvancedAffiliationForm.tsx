import * as React from 'react'
import { Affiliation as AffiliationType, User } from '@didhub/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectLabel, SelectItem } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type FormData = {
  id?: string
  name: string
  description?: string
  systemId?: string
  createdAt?: string
}

type Props = {
  initial?: AffiliationType | null
  mode?: 'create' | 'edit'
  systems?: User[]
  selectedSystemId?: string
  onSave: (data: { name: string; description?: string; systemId?: string }) => Promise<void>
  onCancel?: () => void
  className?: string
}

export default function AdvancedAffiliationForm({ initial, mode = 'create', systems, selectedSystemId, onSave, onCancel, className }: Props) {
  const initialSystemId = (initial as AffiliationType & { systemId?: string })?.systemId ?? selectedSystemId ?? systems?.[0]?.id ?? ''

  const [form, setForm] = React.useState<FormData>({
    id: initial?.id,
    name: initial?.name || '',
    description: initial?.description || '',
    systemId: initialSystemId,
    createdAt: initial?.createdAt,
  })

  const [loading, setLoading] = React.useState(false)

  const handleSave = async () => {
    if (!form.name.trim()) return
    setLoading(true)
    try {
      await onSave({ name: form.name, description: form.description, systemId: form.systemId })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={cn('space-y-4', className)}>
      {mode === 'edit' && form.id && (
        <div>
          <Label>Affiliation ID</Label>
          <Input value={form.id} readOnly />
        </div>
      )}

      <div>
        <Label htmlFor="adv-aff-name">Name</Label>
        <Input id="adv-aff-name" value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} />
      </div>

      <div>
        <Label htmlFor="adv-aff-description">Description</Label>
        <Textarea id="adv-aff-description" rows={3} value={form.description} onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))} />
      </div>

      <div>
        <Label htmlFor="adv-aff-system">System ID</Label>
        {systems && systems.length > 0 ? (
          <Select value={form.systemId} onValueChange={(v) => setForm(prev => ({ ...prev, systemId: v }))}>
            <SelectTrigger id="adv-aff-system">
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
          <Input id="adv-aff-system" value={form.systemId} onChange={(e) => setForm(prev => ({ ...prev, systemId: e.target.value }))} />
        )}
      </div>

      {mode === 'edit' && (
        <div>
          <Label>Created At</Label>
          <Input readOnly value={form.createdAt ?? ''} />
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

export { AdvancedAffiliationForm }
