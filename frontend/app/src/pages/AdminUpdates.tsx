import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '@/context/ApiContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, RefreshCw, Download, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react'
import { UpdateCheckResponse, UpdateRunResponse } from '@didhub/api'

export default function AdminUpdates() {
  const client = useApi()
  const [updateStatus, setUpdateStatus] = useState<UpdateCheckResponse | null>(null)
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)

  const checkForUpdates = async () => {
    try {
      setChecking(true)
      setError(null)
      const response = await client.checkForUpdates() as { data: UpdateCheckResponse }
      setUpdateStatus(response.data)
    } catch (err) {
      console.error('Failed to check for updates:', err)
      setError(err instanceof Error ? err.message : 'Failed to check for updates')
    } finally {
      setChecking(false)
    }
  }

  const runUpdate = async () => {
    if (!updateStatus?.updateAvailable) return

    try {
      setUpdating(true)
      setUpdateError(null)
      await client.runUpdater() as { data: UpdateRunResponse }
      // This should not succeed - the backend always returns an error
    } catch (err) {
      console.error('Update failed (expected):', err)
      // Extract the error message - this is expected behavior
      const message = err instanceof Error ? err.message : 'Automatic updates are not supported'
      setUpdateError(message)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Link to="/admin">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin Panel
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">System Updates</h1>
            <p className="text-muted-foreground mt-2">
              Check for and manage system updates
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 max-w-2xl">
        {/* Update Check Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Version Information
            </CardTitle>
            <CardDescription>
              Check if a newer version is available
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {updateStatus ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground mb-1">Current Version</div>
                    <div className="text-2xl font-mono font-bold">{updateStatus.currentVersion}</div>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground mb-1">Latest Version</div>
                    <div className="text-2xl font-mono font-bold">{updateStatus.latestVersion}</div>
                  </div>
                </div>

                {updateStatus.updateAvailable ? (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-800 dark:text-amber-200">
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                    <span>A new version is available! Please update to get the latest features and security fixes.</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg text-green-800 dark:text-green-200">
                    <CheckCircle className="h-5 w-5 flex-shrink-0" />
                    <span>You are running the latest version.</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {error ? (
                  <div className="space-y-2">
                    <AlertCircle className="h-8 w-8 mx-auto text-red-500" />
                    <p className="text-red-600">{error}</p>
                  </div>
                ) : (
                  <p>Click the button below to check for updates</p>
                )}
              </div>
            )}

            <Button
              onClick={checkForUpdates}
              disabled={checking}
              className="w-full"
            >
              {checking ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Check for Updates
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Update Action Card */}
        {updateStatus?.updateAvailable && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Install Update
              </CardTitle>
              <CardDescription>
                Update to version {updateStatus.latestVersion}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Automatic updates are not currently supported. Please download and install the update manually.
              </p>

              {updateError && (
                <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-800 dark:text-red-200 text-sm">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>{updateError}</span>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Button
                  onClick={runUpdate}
                  disabled={updating}
                  variant="outline"
                >
                  {updating ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Attempting Update...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Attempt Automatic Update
                    </>
                  )}
                </Button>

                <a
                  href="https://github.com/Kusekushi/didhub/releases/latest"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 w-full"
                >
                  <Button variant="default" className="w-full">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Download from GitHub
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Help Card */}
        <Card>
          <CardHeader>
            <CardTitle>Update Instructions</CardTitle>
          </CardHeader>
          <CardContent className="prose dark:prose-invert prose-sm max-w-none">
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>Download the latest release from the GitHub releases page</li>
              <li>Stop the current DIDHub server</li>
              <li>Back up your configuration and database</li>
              <li>Replace the existing files with the new version</li>
              <li>Run any necessary database migrations</li>
              <li>Start the server with the updated binaries</li>
            </ol>
            <p className="mt-4 text-sm text-muted-foreground">
              For detailed upgrade instructions, please refer to the release notes on GitHub.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
