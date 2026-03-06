import { useState, useEffect } from 'react'
import { useApi } from '@/context/ApiContext'
import { useSettings, RelationshipType } from '@/context/SettingsContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Trash2, Plus } from 'lucide-react'

export function RelationshipTypeSettings() {
  const { client } = useApi()
  const { refresh } = useSettings()
  const [customTypes, setCustomTypes] = useState<RelationshipType[]>([])
  const [loading, setLoading] = useState(false)
  const [newType, setNewType] = useState<RelationshipType>({ value: '', label: '', color: '#3b82f6' })

  // Initialize customTypes from settings (excluding defaults)
  useEffect(() => {
    // Only fetch what's actually in the database for this specific key
    const fetchOnlyCustom = async () => {
      try {
        /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
        // @ts-expect-error - Codegen types are currently misaligned with the actual API client
        const response = await client.getInstanceSetting({
          path: { key: 'custom_relationship_types' }
        })
        // @ts-expect-error - Codegen types are currently misaligned with the actual API client
        if (response && response.data && response.data.value) {
          // @ts-expect-error - Codegen types are currently misaligned with the actual API client
          setCustomTypes(JSON.parse(response.data.value) as RelationshipType[])
        }
        /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
      } catch (e) {
        console.error('Failed to fetch custom relationship types', e)
      }
    }
    fetchOnlyCustom()
  }, [client])

  const saveTypes = async (types: RelationshipType[]) => {
    setLoading(true)
    try {
      /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
      // @ts-expect-error - Codegen types are currently misaligned with the actual API client
      await client.setInstanceSetting({
        path: { key: 'custom_relationship_types' },
        body: {
          value: JSON.stringify(types)
        }
      })
      /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
      setCustomTypes(types)
      await refresh()
    } catch (error) {
      console.error('Failed to save relationship types', error)
    } finally {
      setLoading(false)
    }
  }

  const addType = () => {
    if (!newType.value || !newType.label) return
    if (customTypes.find(t => t.value === newType.value)) {
      alert('A relationship type with this value already exists.')
      return
    }
    const updated = [...customTypes, newType]
    saveTypes(updated)
    setNewType({ value: '', label: '', color: '#3b82f6' })
  }

  const removeType = (value: string) => {
    const updated = customTypes.filter(t => t.value !== value)
    saveTypes(updated)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Register New Relationship Type</CardTitle>
          <CardDescription>
            Define custom relationship types that users can use to link alters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="type-value">Internal Value (e.g. 'protector')</Label>
              <Input 
                id="type-value"
                value={newType.value} 
                onChange={e => setNewType({...newType, value: e.target.value.toLowerCase().replace(/\s+/g, '_')})}
                placeholder="lowercase_no_spaces"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type-label">Display Label (e.g. 'Protector')</Label>
              <Input 
                id="type-label"
                value={newType.label} 
                onChange={e => setNewType({...newType, label: e.target.value})}
                placeholder="Protector"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type-color">Color</Label>
              <div className="flex gap-2">
                <Input 
                  id="type-color"
                  type="color"
                  className="w-12 h-10 p-1"
                  value={newType.color} 
                  onChange={e => setNewType({...newType, color: e.target.value})}
                />
                <Input 
                  value={newType.color} 
                  onChange={e => setNewType({...newType, color: e.target.value})}
                  className="flex-1"
                />
              </div>
            </div>
            <Button onClick={addType} disabled={loading || !newType.value || !newType.label}>
              <Plus className="w-4 h-4 mr-2" />
              Add Type
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom Relationship Types</CardTitle>
          <CardDescription>
            Manage your user-defined relationship types.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Color</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customTypes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No custom relationship types defined yet.
                  </TableCell>
                </TableRow>
              ) : (
                customTypes.map((type) => (
                  <TableRow key={type.value}>
                    <TableCell className="font-medium">{type.label}</TableCell>
                    <TableCell className="font-mono text-xs">{type.value}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: type.color }} />
                        <span>{type.color}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-destructive hover:text-destructive"
                        onClick={() => removeType(type.value)}
                        disabled={loading}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
