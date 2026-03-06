import { useState, useEffect } from 'react'
import { useApi } from '@/context/ApiContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RefreshCw, Save, Terminal } from 'lucide-react'
import { useToast } from '@/context/ToastContext'

export function LoggingSettings() {
  const client = useApi()
  const toast = useToast()
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadConfig = async () => {
    try {
      setLoading(true)
      const response = await client.getLoggingConfig()
      setFilter(response.data.filter || 'info')
    } catch (error) {
      console.error('Failed to load logging config:', error)
      toast.show({
        title: 'Error',
        description: 'Failed to load logging configuration.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    try {
      setSaving(true)
      await client.setLoggingConfig({
        body: { filter }
      })
      toast.show({
        title: 'Success',
        description: 'Logging configuration updated and applied.',
        variant: 'success',
      })
    } catch (error) {
      console.error('Failed to save logging config:', error)
      toast.show({
        title: 'Error',
        description: 'Failed to update logging configuration.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    loadConfig()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin mr-2" />
        <span>Loading logging settings...</span>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Terminal className="h-5 w-5" />
          Logging Configuration
        </CardTitle>
        <CardDescription>
          Configure the backend log levels. Changes are applied immediately without restart.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="log-filter">Log Filter String</Label>
          <div className="flex gap-2">
            <Input
              id="log-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="e.g. info,didhub_backend=debug"
              className="font-mono"
            />
            <Button onClick={saveConfig} disabled={saving}>
              {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save & Apply
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Uses standard Rust tracing <code>EnvFilter</code> syntax. Examples: 
            <code className="mx-1 px-1 bg-muted rounded">info</code>, 
            <code className="mx-1 px-1 bg-muted rounded">debug,sqlx=warn</code>, 
            <code className="mx-1 px-1 bg-muted rounded">didhub_backend=trace</code>.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2">
          {['trace', 'debug', 'info', 'warn', 'error'].map((level) => (
            <Button
              key={level}
              variant="outline"
              size="sm"
              onClick={() => setFilter(level)}
              className={filter === level ? 'bg-primary text-primary-foreground' : ''}
            >
              Set Global {level.toUpperCase()}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
