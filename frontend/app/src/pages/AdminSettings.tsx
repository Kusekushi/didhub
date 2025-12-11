import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '@/context/ApiContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ArrowLeft, RefreshCw, Plus, Search, Edit, Check, X, Trash2 } from 'lucide-react'
import { InstanceSetting, InstanceSettingsResponse } from '@didhub/api'

interface EditableSetting extends InstanceSetting {
  isEditing?: boolean
  originalValue?: string
  valueType?: string
}

export default function AdminSettings() {
  const client = useApi()
  const [settings, setSettings] = useState<EditableSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [newSettingKey, setNewSettingKey] = useState('')
  const [newSettingValue, setNewSettingValue] = useState('')
  const [newSettingType, setNewSettingType] = useState<'bool' | 'number' | 'string'>('string')
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)

  const loadSettings = async () => {
    try {
      setLoading(true)
      const response = await client.listInstanceSettings() as { data: InstanceSettingsResponse }
      setSettings(response.data.items || [])
    } catch (error) {
      console.error('Failed to load settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSettingChange = (key: string, value: string) => {
    setSettings(prev => prev.map(setting =>
      setting.key === key ? { ...setting, value } : setting
    ))
  }

  const handleSettingTypeChange = (key: string, valueType: 'bool' | 'number' | 'string') => {
    setSettings(prev => prev.map(setting =>
      setting.key === key ? { ...setting, valueType } : setting
    ))
  }

  const startEditing = (key: string) => {
    setSettings(prev => prev.map(setting =>
      setting.key === key
        ? { ...setting, isEditing: true, originalValue: setting.value }
        : setting
    ))
  }

  const cancelEditing = (key: string) => {
    setSettings(prev => prev.map(setting =>
      setting.key === key
        ? { ...setting, isEditing: false, value: setting.originalValue || setting.value }
        : setting
    ))
  }

  const saveEditing = async (key: string) => {
    try {
      const setting = settings.find(s => s.key === key)
      if (!setting) return

      await client.bulkSetInstanceSettings({
        body: {
          items: [{
            key: setting.key,
            value: setting.value,
            value_type: setting.valueType
          }]
        }
      })

      setSettings(prev => prev.map(s =>
        s.key === key ? { ...s, isEditing: false } : s
      ))

      // Reload to get updated timestamp
      await loadSettings()
    } catch (error) {
      console.error('Failed to save setting:', error)
    }
  }

  const deleteSetting = async (key: string) => {
    if (!confirm(`Are you sure you want to delete the setting "${key}"?`)) {
      return
    }

    try {
      await client.deleteInstanceSetting({
        path: { key }
      })

      // Remove from local state
      setSettings(prev => prev.filter(s => s.key !== key))
    } catch (error) {
      console.error('Failed to delete setting:', error)
    }
  }

  const addNewSetting = async () => {
    if (!newSettingKey.trim()) return

    try {
      const updates = [{
        key: newSettingKey.trim(),
        value: newSettingValue,
        value_type: newSettingType
      }]

      await client.bulkSetInstanceSettings({
        body: { items: updates }
      })

      setNewSettingKey('')
      setNewSettingValue('')
      setNewSettingType('string')
      setIsAddDialogOpen(false)
      await loadSettings()
    } catch (error) {
      console.error('Failed to add setting:', error)
    }
  }

  const filteredSettings = useMemo(() => {
    return settings.filter(setting => {
      const matchesSearch = setting.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           setting.value.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesType = filterType === 'all' || setting.valueType === filterType
      return matchesSearch && matchesType
    })
  }, [settings, searchQuery, filterType])

  const renderValueInput = (setting: EditableSetting) => {
    if (!setting.isEditing) {
      return (
        <div className="flex items-center gap-2">
          {setting.valueType === 'bool' ? (
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              setting.value === 'true' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            }`}>
              {setting.value === 'true' ? 'true' : 'false'}
            </span>
          ) : (
            <span className="font-mono text-sm">{setting.value}</span>
          )}
        </div>
      )
    }

    switch (setting.valueType) {
      case 'bool':
        return (
          <select
            value={setting.value}
            onChange={(e) => handleSettingChange(setting.key, e.target.value)}
            className="px-2 py-1 border rounded text-sm w-24"
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        )
      case 'number':
        return (
          <Input
            type="number"
            value={setting.value}
            onChange={(e) => handleSettingChange(setting.key, e.target.value)}
            className="w-32"
          />
        )
      default:
        return (
          <Input
            value={setting.value}
            onChange={(e) => handleSettingChange(setting.key, e.target.value)}
            className="min-w-48"
          />
        )
    }
  }

  const renderTypeSelector = (setting: EditableSetting) => {
    if (!setting.isEditing) {
      return <span className="text-sm text-muted-foreground">{setting.valueType}</span>
    }

    return (
      <select
        value={setting.valueType}
        onChange={(e) => handleSettingTypeChange(setting.key, e.target.value as 'bool' | 'number' | 'string')}
        className="px-2 py-1 border rounded text-sm w-24"
      >
        <option value="string">string</option>
        <option value="number">number</option>
        <option value="bool">bool</option>
      </select>
    )
  }

  useEffect(() => {
    loadSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Link to="/admin">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Admin Panel
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold">Instance Settings</h1>
              <p className="text-muted-foreground mt-2">
                Advanced configuration editor - {settings.length} settings
              </p>
            </div>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Setting
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Setting</DialogTitle>
                <DialogDescription>
                  Create a new instance setting with the specified key, value, and type.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="new-key">Key</Label>
                  <Input
                    id="new-key"
                    value={newSettingKey}
                    onChange={(e) => setNewSettingKey(e.target.value)}
                    placeholder="setting.key.name"
                  />
                </div>
                <div>
                  <Label htmlFor="new-type">Type</Label>
                  <select
                    id="new-type"
                    value={newSettingType}
                    onChange={(e) => setNewSettingType(e.target.value as 'bool' | 'number' | 'string')}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="string">String</option>
                    <option value="number">Number</option>
                    <option value="bool">Boolean</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="new-value">Value</Label>
                  {newSettingType === 'bool' ? (
                    <select
                      id="new-value"
                      value={newSettingValue}
                      onChange={(e) => setNewSettingValue(e.target.value)}
                      className="w-full px-3 py-2 border rounded"
                    >
                      <option value="">Select value</option>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : (
                    <Input
                      id="new-value"
                      type={newSettingType === 'number' ? 'number' : 'text'}
                      value={newSettingValue}
                      onChange={(e) => setNewSettingValue(e.target.value)}
                      placeholder={newSettingType === 'number' ? '0' : 'value'}
                    />
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={addNewSetting} disabled={!newSettingKey.trim()}>
                  Add Setting
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search and Filter Controls */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search settings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2 border rounded w-40"
          >
            <option value="all">All Types</option>
            <option value="string">String</option>
            <option value="number">Number</option>
            <option value="bool">Boolean</option>
          </select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Settings ({filteredSettings.length})</CardTitle>
          <CardDescription>
            Edit instance-wide configuration settings. Changes are saved immediately when confirmed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSettings.map((setting) => (
                  <TableRow key={setting.key}>
                    <TableCell className="font-mono text-sm">{setting.key}</TableCell>
                    <TableCell>{renderTypeSelector(setting)}</TableCell>
                    <TableCell>{renderValueInput(setting)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {setting.updatedAt ? new Date(setting.updatedAt).toLocaleString() : 'Never'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {setting.isEditing ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => saveEditing(setting.key)}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => cancelEditing(setting.key)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => startEditing(setting.key)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteSetting(setting.key)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex gap-4 pt-4">
            <Button variant="outline" onClick={loadSettings} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}