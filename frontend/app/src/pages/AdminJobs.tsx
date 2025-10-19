import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '@/context/ApiContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, Play, Trash2, RefreshCw, CheckCircle, XCircle, Clock, Activity } from 'lucide-react'
import { JobRun, PaginatedJobRunResponse } from '@didhub/api'

export default function AdminJobs() {
  const client = useApi()
  const [jobRuns, setJobRuns] = useState<JobRun[]>([])
  const [loading, setLoading] = useState(true)
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set())
  const [clearing, setClearing] = useState(false)

  // Available jobs that can be run
  const availableJobs = [
    'cleanup-uploads',
    'backup-database',
    'update-check',
    'maintenance'
  ]

  const loadJobRuns = async () => {
    try {
      setLoading(true)
      const response = await client.listJobRuns() as { data: PaginatedJobRunResponse }
      setJobRuns(response.data.items || [])
    } catch (error) {
      console.error('Failed to load job runs:', error)
    } finally {
      setLoading(false)
    }
  }

  const runJob = async (jobName: string) => {
    try {
      setRunningJobs(prev => new Set(prev).add(jobName))
      await client.runJob({ path: { jobName } })
      // Reload job runs to show the new job
      await loadJobRuns()
    } catch (error) {
      console.error(`Failed to run job ${jobName}:`, error)
    } finally {
      setRunningJobs(prev => {
        const newSet = new Set(prev)
        newSet.delete(jobName)
        return newSet
      })
    }
  }

  const clearJobRuns = async () => {
    if (!window.confirm('Are you sure you want to clear all job run history? This action cannot be undone.')) {
      return
    }

    try {
      setClearing(true)
      await client.clearJobRuns()
      await loadJobRuns()
    } catch (error) {
      console.error('Failed to clear job runs:', error)
    } finally {
      setClearing(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'failed':
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />
      case 'running':
      case 'in_progress':
        return <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
      default:
        return <Clock className="h-4 w-4 text-gray-600" />
    }
  }

  const getStatusBadge = (status: string) => {
    const baseClasses = "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
    switch (status.toLowerCase()) {
      case 'completed':
      case 'success':
        return `${baseClasses} bg-green-100 text-green-800`
      case 'failed':
      case 'error':
        return `${baseClasses} bg-red-100 text-red-800`
      case 'running':
      case 'in_progress':
        return `${baseClasses} bg-blue-100 text-blue-800`
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`
    }
  }

  const formatDuration = (startedAt: string, finishedAt?: string) => {
    const start = new Date(startedAt)
    const end = finishedAt ? new Date(finishedAt) : new Date()
    const duration = end.getTime() - start.getTime()

    if (duration < 1000) return '< 1s'
    if (duration < 60000) return `${Math.round(duration / 1000)}s`
    if (duration < 3600000) return `${Math.round(duration / 60000)}m`
    return `${Math.round(duration / 3600000)}h`
  }

  useEffect(() => {
    loadJobRuns()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
            <h1 className="text-3xl font-bold">Job Management</h1>
            <p className="text-muted-foreground mt-2">
              Monitor and manage background jobs and tasks
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Job Controls */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Run Jobs
              </CardTitle>
              <CardDescription>
                Execute maintenance and utility jobs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {availableJobs.map((jobName) => (
                <Button
                  key={jobName}
                  onClick={() => runJob(jobName)}
                  disabled={runningJobs.has(jobName)}
                  className="w-full justify-start"
                  variant="outline"
                >
                  {runningJobs.has(jobName) ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  {jobName.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </Button>
              ))}

              <hr className="my-4" />

              <Button
                variant="destructive"
                onClick={clearJobRuns}
                disabled={clearing}
                className="w-full"
              >
                {clearing ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Clearing...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear History
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Job Runs History */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Job Run History
              </CardTitle>
              <CardDescription>
                Recent job executions and their status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm text-muted-foreground">
                  {jobRuns.length} job runs total
                </div>
                <Button variant="outline" onClick={loadJobRuns} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>

              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Finished</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto" />
                          <div className="mt-2 text-muted-foreground">Loading job runs...</div>
                        </TableCell>
                      </TableRow>
                    ) : jobRuns.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No job runs found
                        </TableCell>
                      </TableRow>
                    ) : (
                      jobRuns.map((jobRun) => (
                        <TableRow key={jobRun.id}>
                          <TableCell className="font-medium">
                            {jobRun.jobName.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(jobRun.status)}
                              <span className={getStatusBadge(jobRun.status)}>
                                {jobRun.status}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {new Date(jobRun.startedAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {formatDuration(jobRun.startedAt, jobRun.finishedAt)}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {jobRun.finishedAt ? new Date(jobRun.finishedAt).toLocaleString() : '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}