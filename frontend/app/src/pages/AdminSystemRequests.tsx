import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '@/context/ApiContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ArrowLeft, UserCheck, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react'
import { SystemRequest, SystemRequestListResponse, SystemRequestDecisionRequest } from '@didhub/api'

export default function AdminSystemRequests() {
  const client = useApi()
  const [systemRequests, setSystemRequests] = useState<SystemRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [deciding, setDeciding] = useState<string | null>(null)

  // Decision dialog state
  const [decisionDialogOpen, setDecisionDialogOpen] = useState(false)
  const [currentRequest, setCurrentRequest] = useState<SystemRequest | null>(null)
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve')
  const [decisionMessage, setDecisionMessage] = useState('')

  const loadSystemRequests = async () => {
    try {
      setLoading(true)
      const response = await client.listSystemRequests<SystemRequestListResponse>()
      setSystemRequests(response.data.items || [])
    } catch (error) {
      console.error('Failed to load system requests:', error)
    } finally {
      setLoading(false)
    }
  }

  const makeDecision = async () => {
    if (!currentRequest) return

    try {
      setDeciding(currentRequest.id)
      const request: SystemRequestDecisionRequest = {
        decision,
        message: decisionMessage.trim() || undefined
      }

      await client.decideSystemRequest({
        path: { requestId: currentRequest.id },
        body: request
      })

      setDecisionDialogOpen(false)
      setCurrentRequest(null)
      setDecisionMessage('')
      await loadSystemRequests()
    } catch (error) {
      console.error('Failed to make decision:', error)
    } finally {
      setDeciding(null)
    }
  }

  const openDecisionDialog = (request: SystemRequest, decisionType: 'approve' | 'reject') => {
    setCurrentRequest(request)
    setDecision(decisionType)
    setDecisionMessage('')
    setDecisionDialogOpen(true)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-600" />
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />
    }
  }

  const getStatusBadge = (status: string) => {
    const baseClasses = "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
    switch (status) {
      case 'approved':
        return `${baseClasses} bg-green-100 text-green-800`
      case 'rejected':
        return `${baseClasses} bg-red-100 text-red-800`
      default:
        return `${baseClasses} bg-yellow-100 text-yellow-800`
    }
  }

  const pendingRequests = systemRequests.filter(req => req.status === 'pending')

  useEffect(() => {
    loadSystemRequests()
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
            <h1 className="text-3xl font-bold">System Requests</h1>
            <p className="text-muted-foreground mt-2">
              Review and decide on system account requests
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Overview */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" />
                Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">{pendingRequests.length}</div>
                <div className="text-sm text-muted-foreground">Pending Requests</div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Approved:</span>
                  <span className="font-medium text-green-600">
                    {systemRequests.filter(req => req.status === 'approved').length}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Rejected:</span>
                  <span className="font-medium text-red-600">
                    {systemRequests.filter(req => req.status === 'rejected').length}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Total:</span>
                  <span className="font-medium">{systemRequests.length}</span>
                </div>
              </div>

              <Button variant="outline" onClick={loadSystemRequests} disabled={loading} className="w-full">
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Requests List */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>System Account Requests</CardTitle>
              <CardDescription>
                Users requesting to become system accounts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User ID</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Decided</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto" />
                          <div className="mt-2 text-muted-foreground">Loading requests...</div>
                        </TableCell>
                      </TableRow>
                    ) : systemRequests.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No system requests found
                        </TableCell>
                      </TableRow>
                    ) : (
                      systemRequests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell className="font-mono text-xs">
                            {request.userId}
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <div className="truncate" title={request.message || 'No message provided'}>
                              {request.message || <span className="text-muted-foreground italic">No message</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(request.status)}
                              <span className={getStatusBadge(request.status)}>
                                {request.status}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {new Date(request.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {request.decidedAt ? new Date(request.decidedAt).toLocaleString() : '-'}
                          </TableCell>
                          <TableCell>
                            {request.status === 'pending' && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => openDecisionDialog(request, 'approve')}
                                  disabled={deciding === request.id}
                                  className="bg-green-600 hover:bg-green-700"
                                >
                                  <CheckCircle className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => openDecisionDialog(request, 'reject')}
                                  disabled={deciding === request.id}
                                >
                                  <XCircle className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
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

      {/* Decision Dialog */}
      <Dialog open={decisionDialogOpen} onOpenChange={setDecisionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision === 'approve' ? 'Approve' : 'Reject'} System Request
            </DialogTitle>
            <DialogDescription>
              {decision === 'approve'
                ? 'Approve this user\'s request to become a system account.'
                : 'Reject this user\'s request to become a system account.'
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>User ID</Label>
              <div className="font-mono text-sm bg-gray-50 p-2 rounded">
                {currentRequest?.userId}
              </div>
            </div>

            {currentRequest?.message && (
              <div>
                <Label>Request Message</Label>
                <div className="bg-gray-50 p-2 rounded text-sm">
                  {currentRequest.message}
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="decisionMessage">
                Decision Message (Optional)
              </Label>
              <Textarea
                id="decisionMessage"
                value={decisionMessage}
                onChange={(e) => setDecisionMessage(e.target.value)}
                placeholder={`Add a message explaining your ${decision} decision...`}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={makeDecision}
              disabled={deciding === currentRequest?.id}
              variant={decision === 'approve' ? 'default' : 'destructive'}
            >
              {deciding === currentRequest?.id ? 'Processing...' : `${decision === 'approve' ? 'Approve' : 'Reject'} Request`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}