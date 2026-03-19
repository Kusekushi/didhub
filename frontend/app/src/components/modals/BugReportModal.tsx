import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { AlertTriangleIcon, CopyIcon, CheckIcon } from 'lucide-react'
import type { NormalizedError } from '@/lib/errors'
import { formatErrorForReport } from '@/lib/errors'

interface BugReportModalProps {
  error: NormalizedError
  onClose: () => void
}

export function BugReportModal({ error, onClose }: BugReportModalProps) {
  const [copied, setCopied] = useState(false)

  const handleCopyReport = async () => {
    const report = formatErrorForReport(error)
    await navigator.clipboard.writeText(report)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const reportText = formatErrorForReport(error)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangleIcon className="size-5" />
            {error.title}
          </DialogTitle>
          <DialogDescription>
            An unexpected error occurred. Please copy the details below and report
            this bug.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted rounded-md p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-muted-foreground">
                Error ID
              </span>
              <span className="font-mono text-sm">{error.id}</span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Category: </span>
              <span className="capitalize">{error.category.replace('_', ' ')}</span>
            </div>
            <div className="text-sm mt-1">
              <span className="text-muted-foreground">Time: </span>
              <span>{error.timestamp.toLocaleString()}</span>
            </div>
            {error.context && (
              <div className="text-sm mt-1">
                <span className="text-muted-foreground">Context: </span>
                <span>{error.context}</span>
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">
              Error Details
            </label>
            <div className="bg-muted rounded-md p-3 font-mono text-xs whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
              {error.message}
              {error.stack && (
                <>
                  {'\n\n'}
                  {error.stack}
                </>
              )}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">
              Full Report (for bug reports)
            </label>
            <Textarea
              value={reportText}
              readOnly
              className="font-mono text-xs h-32 resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Dismiss
          </Button>
          <Button onClick={handleCopyReport} variant="default">
            {copied ? (
              <>
                <CheckIcon className="size-4" />
                Copied!
              </>
            ) : (
              <>
                <CopyIcon className="size-4" />
                Copy Report
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
