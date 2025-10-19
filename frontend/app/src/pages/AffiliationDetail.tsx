import { useState, useEffect, useRef, KeyboardEvent, RefObject } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Alter, User } from '@didhub/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ArrowLeft, Trash2, Pencil, Check, X, Users, Plus, Star, Upload } from 'lucide-react'
import { useToast } from '@/context/ToastContext'
import { useApi } from '@/context/ApiContext'
import { useAuth } from '@/context/AuthContext'
import { AlterSelectionTable } from '@/components/AlterSelectionTable'

interface Affiliation {
  id: string
  name: string
  description?: string
  sigil?: string
  systemId: string
  createdAt: string
}

interface AffiliationMember {
  alterId: string
  isLeader: boolean
  addedAt: string
}

type EditableField = 'name' | 'description'

interface EditableTextProps {
  field: EditableField
  label?: string
  value: string | undefined
  icon?: React.ReactNode
  placeholder?: string
  multiline?: boolean
  className?: string
  editingField: EditableField | null
  editValue: string
  saving: boolean
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>
  onEditValueChange: (value: string) => void
  onKeyDown: (e: KeyboardEvent) => void
  onSave: () => void
  onCancel: () => void
  onStartEditing: (field: EditableField) => void
  canEdit: boolean
}

function EditableText({
  field,
  label,
  value,
  icon,
  placeholder = 'Click to add...',
  multiline = false,
  className = '',
  editingField,
  editValue,
  saving,
  inputRef,
  onEditValueChange,
  onKeyDown,
  onSave,
  onCancel,
  onStartEditing,
  canEdit
}: EditableTextProps) {
  const isEditing = editingField === field

  if (isEditing) {
    return (
      <div className={`space-y-1 ${className}`}>
        {label && (
          <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
            {icon}
            {label}
          </div>
        )}
        <div className="flex items-start gap-2">
          {multiline ? (
            <Textarea
              ref={inputRef as RefObject<HTMLTextAreaElement>}
              value={editValue}
              onChange={(e) => onEditValueChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && onCancel()}
              className="min-h-[100px]"
              disabled={saving}
            />
          ) : (
            <Input
              ref={inputRef as RefObject<HTMLInputElement>}
              value={editValue}
              onChange={(e) => onEditValueChange(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={saving}
            />
          )}
          <Button size="sm" variant="ghost" onClick={onSave} disabled={saving}>
            <Check className="w-4 h-4 text-green-600" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
            <X className="w-4 h-4 text-red-600" />
          </Button>
        </div>
        {multiline && <p className="text-xs text-muted-foreground">Press Escape to cancel</p>}
      </div>
    )
  }

  return (
    <div
      className={`group ${canEdit ? 'cursor-pointer hover:bg-muted/50' : ''} rounded-md p-2 -m-2 transition-colors ${className}`}
      onClick={() => canEdit && onStartEditing(field)}
    >
      {label && (
        <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
          {icon}
          {label}
          {canEdit && <Pencil className="w-3 h-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />}
        </div>
      )}
      <div className={`mt-1 ${!value ? 'text-muted-foreground italic' : ''}`}>
        {value || placeholder}
      </div>
    </div>
  )
}

export default function AffiliationDetail() {
  const { affiliationId } = useParams<{ affiliationId: string }>()
  const navigate = useNavigate()
  const api = useApi()
  const { isAdmin } = useAuth()
  const { show: showToast } = useToast()

  const [affiliation, setAffiliation] = useState<Affiliation | null>(null)
  const [system, setSystem] = useState<User | null>(null)
  const [members, setMembers] = useState<AffiliationMember[]>([])
  const [memberAlters, setMemberAlters] = useState<Record<string, Alter>>({})
  const [loading, setLoading] = useState(true)
  const [sigilUrl, setSigilUrl] = useState<string | null>(null)
  const [uploadingSigil, setUploadingSigil] = useState(false)
  const sigilInputRef = useRef<HTMLInputElement>(null)
  
  // All alters from the same system (for member selection)
  const [systemAlters, setSystemAlters] = useState<Alter[]>([])
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false)
  const [selectedAlterIds, setSelectedAlterIds] = useState<string[]>([])
  const [addingMembers, setAddingMembers] = useState(false)
  
  // Inline editing state
  const [editingField, setEditingField] = useState<EditableField | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  // Get current user from auth context
  const { user: authUser } = useAuth()

  // Check if user can edit this affiliation (owner or admin)
  const canEdit = affiliation?.systemId === authUser?.id || isAdmin

  useEffect(() => {
    loadAffiliation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affiliationId])

  useEffect(() => {
    // Focus input when editing starts
    if (editingField && inputRef.current) {
      inputRef.current.focus()
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select()
      }
    }
  }, [editingField])

  const loadAffiliation = async () => {
    if (!affiliationId) return
    setLoading(true)
    try {
      const response = await api.getAffiliation({ path: { affiliationId } })
      const affiliationData = response.data as Affiliation
      setAffiliation(affiliationData)
      
      // Load system info
      if (affiliationData.systemId) {
        try {
          const systemResponse = await api.getUserById({ path: { id: affiliationData.systemId } })
          setSystem(systemResponse.data as User)
        } catch {
          // System user not available
        }
      }

      // Load sigil if available
      if ((affiliationData as any).sigil) {
        try {
          const fileResponse = await api.serveStoredFilesBatch({ query: { ids: [(affiliationData as any).sigil] } })
          const files = fileResponse.data as { id: string; url: string }[]
          if (files && files.length > 0 && files[0].url) {
            setSigilUrl(files[0].url)
          }
        } catch {
          // Sigil not available
        }
      }

      // Load members with the fresh affiliation data
      await loadMembers(affiliationData)
    } catch {
      showToast({ title: 'Error', description: 'Failed to load affiliation details', variant: 'error' })
      navigate('/system')
    } finally {
      setLoading(false)
    }
  }

  const loadMembers = async (affiliationData?: Affiliation) => {
    const aff = affiliationData || affiliation
    if (!affiliationId || !aff) return
    try {
      // Get members from the affiliation_members table
      const response = await api.listAffiliationMembers({ path: { affiliationId } })
      // Backend returns a plain array
      const memberList = Array.isArray(response.data) ? response.data : []
      setMembers(memberList as AffiliationMember[])
      
      // Now fetch alter details for each member
      const systemId = aff.systemId
      if (systemId && memberList.length > 0) {
        const altersResponse = await api.listAlters({ query: { systemId } })
        const data = altersResponse.data as Alter[] | { items: Alter[] }
        const alterList = Array.isArray(data) ? data : (data.items || [])
        
        // Build member map with only members
        const memberAlterIds = new Set(memberList.map((m: AffiliationMember) => m.alterId))
        const alterMap: Record<string, Alter> = {}
        alterList.forEach(alter => {
          if (memberAlterIds.has(alter.id)) {
            alterMap[alter.id] = alter
          }
        })
        setMemberAlters(alterMap)
      } else {
        setMemberAlters({})
      }
    } catch {
      // Members not available
    }
  }

  const loadSystemAlters = async (systemId: string) => {
    try {
      // Get all alters from the same system
      const response = await api.listAlters({ query: { systemId } })
      // Backend returns a plain array, not { items: [...] }
      const data = response.data as Alter[] | { items: Alter[] }
      const alterList = Array.isArray(data) ? data : (data.items || [])
      setSystemAlters(alterList)
    } catch {
      setSystemAlters([])
    }
  }

  const handleAddMembers = async () => {
    if (!affiliation || selectedAlterIds.length === 0) return
    
    setAddingMembers(true)
    try {
      // Add each selected alter as a member
      for (const alterId of selectedAlterIds) {
        await api.addAffiliationMember({
          path: { affiliationId: affiliation.id },
          body: { alterId }
        })
      }
      
      showToast({ title: 'Success', description: `Added ${selectedAlterIds.length} member(s) to affiliation` })
      setAddMemberDialogOpen(false)
      setSelectedAlterIds([])
      await loadMembers()
    } catch {
      showToast({ title: 'Error', description: 'Failed to add members', variant: 'error' })
    } finally {
      setAddingMembers(false)
    }
  }

  const handleRemoveMember = async (alterId: string) => {
    if (!affiliation) return
    if (!confirm('Are you sure you want to remove this member?')) return
    
    try {
      await api.removeAffiliationMember({
        path: { affiliationId: affiliation.id, memberId: alterId }
      })
      showToast({ title: 'Success', description: 'Member removed successfully' })
      await loadMembers()
    } catch {
      showToast({ title: 'Error', description: 'Failed to remove member', variant: 'error' })
    }
  }

  const handleToggleLeader = async (alterId: string, currentIsLeader: boolean) => {
    if (!affiliation) return
    
    try {
      await api.updateAffiliationMember({
        path: { affiliationId: affiliation.id, memberId: alterId },
        body: { isLeader: !currentIsLeader }
      })
      showToast({ 
        title: 'Success', 
        description: currentIsLeader ? 'Leader status removed' : 'Set as leader' 
      })
      await loadMembers()
    } catch {
      showToast({ title: 'Error', description: 'Failed to update leader status', variant: 'error' })
    }
  }

  const openAddMemberDialog = async () => {
    if (!affiliation) return
    await loadSystemAlters(affiliation.systemId)
    setSelectedAlterIds([])
    setAddMemberDialogOpen(true)
  }

  // Filter out alters that are already members
  const availableAlters = systemAlters.filter(
    alter => !members.some(m => m.alterId === alter.id)
  )

  const handleDelete = async () => {
    if (!affiliation) return
    if (!confirm('Are you sure you want to delete this affiliation?')) return
    
    try {
      await api.deleteAffiliation({ path: { affiliationId: affiliation.id } })
      showToast({ title: 'Success', description: 'Affiliation deleted successfully' })
      navigate(`/system/${affiliation.systemId}`)
    } catch {
      showToast({ title: 'Error', description: 'Failed to delete affiliation', variant: 'error' })
    }
  }

  const startEditing = (field: EditableField) => {
    if (!affiliation || !canEdit) return
    
    let initialValue = ''
    switch (field) {
      case 'name':
        initialValue = affiliation.name || ''
        break
      case 'description':
        initialValue = affiliation.description || ''
        break
    }
    
    setEditValue(initialValue)
    setEditingField(field)
  }

  const cancelEditing = () => {
    setEditingField(null)
    setEditValue('')
  }

  const handleSigilUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !affiliation) return

    if (!file.type.startsWith('image/')) {
      showToast({ title: 'Error', description: 'Please select an image file', variant: 'error' })
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast({ title: 'Error', description: 'Image must be less than 5MB', variant: 'error' })
      return
    }

    setUploadingSigil(true)
    try {
      const reader = new FileReader()
      reader.onload = async () => {
        const base64Content = reader.result as string
        try {
          await api.uploadAffiliationSigil({
            path: { affiliationId: affiliation.id },
            body: { filename: file.name, content: base64Content }
          })
          await loadAffiliation()
          showToast({ title: 'Success', description: 'Sigil uploaded successfully' })
        } catch {
          showToast({ title: 'Error', description: 'Failed to upload sigil', variant: 'error' })
        } finally {
          setUploadingSigil(false)
        }
      }
      reader.onerror = () => {
        showToast({ title: 'Error', description: 'Failed to read file', variant: 'error' })
        setUploadingSigil(false)
      }
      reader.readAsDataURL(file)
    } catch {
      showToast({ title: 'Error', description: 'Failed to process image', variant: 'error' })
      setUploadingSigil(false)
    }

    if (sigilInputRef.current) {
      sigilInputRef.current.value = ''
    }
  }

  const handleDeleteSigil = async () => {
    if (!affiliation || !(affiliation as any).sigil) return
    if (!confirm('Are you sure you want to remove this sigil?')) return

    try {
      await api.deleteAffiliationSigil({ path: { affiliationId: affiliation.id } })
      setSigilUrl(null)
      showToast({ title: 'Success', description: 'Sigil removed successfully' })
    } catch {
      showToast({ title: 'Error', description: 'Failed to remove sigil', variant: 'error' })
    }
  }

  const saveField = async () => {
    if (!affiliation || !editingField) return
    
    setSaving(true)
    try {
      const updatePayload: Record<string, unknown> = {}
      updatePayload[editingField] = editValue

      await api.updateAffiliation({
        path: { affiliationId: affiliation.id },
        body: updatePayload
      })
      
      // Update local state
      setAffiliation(prev => prev ? { ...prev, [editingField]: editValue } : null)
      showToast({ title: 'Success', description: 'Affiliation updated successfully' })
      cancelEditing()
    } catch {
      showToast({ title: 'Error', description: 'Failed to update affiliation', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      saveField()
    } else if (e.key === 'Escape') {
      cancelEditing()
    }
  }

  const getInitials = (name: string) => {
    if (!name) return ''
    return name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  }

  if (loading) {
    return <div className="p-6">Loading affiliation...</div>
  }

  if (!affiliation) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <h2 className="text-xl font-semibold mb-2">Affiliation not found</h2>
        <Button variant="outline" onClick={() => navigate('/system')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to System
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header with back button */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate(`/system/${affiliation.systemId}`)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to {system?.displayName || system?.username || 'System'}
        </Button>
        {canEdit && (
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        )}
      </div>

      {/* Main content */}
      <div className="bg-card rounded-lg shadow-sm p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start gap-6">
          {/* Sigil image with upload/delete controls */}
          <div className="relative group">
            {sigilUrl ? (
              <img
                src={sigilUrl}
                alt={`${affiliation.name} sigil`}
                className="h-24 w-24 rounded-lg object-cover"
              />
            ) : (
              <div className="h-24 w-24 rounded-lg bg-muted flex items-center justify-center text-2xl font-medium text-muted-foreground">
                <Users className="w-10 h-10" />
              </div>
            )}
            {canEdit && (
              <div className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <input
                  ref={sigilInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleSigilUpload}
                  className="hidden"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => sigilInputRef.current?.click()}
                  disabled={uploadingSigil}
                >
                  {uploadingSigil ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                </Button>
                {sigilUrl && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleDeleteSigil}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 space-y-4">
            <EditableText
              field="name"
              value={affiliation.name}
              placeholder="Add name..."
              editingField={editingField}
              editValue={editValue}
              saving={saving}
              inputRef={inputRef}
              onEditValueChange={setEditValue}
              onKeyDown={handleKeyDown}
              onSave={saveField}
              onCancel={cancelEditing}
              onStartEditing={startEditing}
              canEdit={canEdit}
              className="text-2xl font-bold"
            />

            <EditableText
              field="description"
              label="Description"
              value={affiliation.description}
              placeholder="Add description..."
              multiline
              editingField={editingField}
              editValue={editValue}
              saving={saving}
              inputRef={inputRef}
              onEditValueChange={setEditValue}
              onKeyDown={handleKeyDown}
              onSave={saveField}
              onCancel={cancelEditing}
              onStartEditing={startEditing}
              canEdit={canEdit}
            />

            <div className="text-sm text-muted-foreground">
              Created {new Date(affiliation.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Members section */}
        <div className="border-t pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Users className="w-5 h-5" />
              Members ({members.length})
            </h3>
            {canEdit && (
              <Dialog open={addMemberDialogOpen} onOpenChange={setAddMemberDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" onClick={openAddMemberDialog}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Members
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Add Members to Affiliation</DialogTitle>
                    <DialogDescription>
                      Select alters from this system to add to the affiliation.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    {availableAlters.length > 0 ? (
                      <AlterSelectionTable
                        alters={availableAlters}
                        selectedAlterIds={selectedAlterIds}
                        onSelectionChange={setSelectedAlterIds}
                      />
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        No more alters available to add. All alters from this system are already members.
                      </p>
                    )}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setAddMemberDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleAddMembers} 
                      disabled={selectedAlterIds.length === 0 || addingMembers}
                    >
                      {addingMembers ? 'Adding...' : `Add ${selectedAlterIds.length} Member(s)`}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {members.length > 0 ? (
            <ul className="space-y-3">
              {members.map((member) => {
                const alter = memberAlters[member.alterId]
                if (!alter) return null
                
                return (
                  <li key={member.alterId} className="flex items-center gap-3 p-3 bg-muted/50 rounded-md">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium relative">
                      {getInitials(alter.name)}
                      {member.isLeader && (
                        <Star className="w-4 h-4 absolute -top-1 -right-1 text-yellow-500 fill-yellow-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Link 
                          to={`/alter/${alter.id}`} 
                          className="font-medium text-primary hover:underline"
                        >
                          {alter.name}
                        </Link>
                        {member.isLeader && (
                          <span className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 px-2 py-0.5 rounded-full">
                            Leader
                          </span>
                        )}
                      </div>
                      {alter.pronouns && (
                        <div className="text-sm text-muted-foreground">{alter.pronouns}</div>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleLeader(member.alterId, member.isLeader)}
                          className={`h-8 w-8 p-0 ${member.isLeader ? 'text-yellow-500 hover:text-yellow-600' : 'text-muted-foreground hover:text-yellow-500'}`}
                          title={member.isLeader ? 'Remove leader status' : 'Set as leader'}
                        >
                          <Star className={`w-4 h-4 ${member.isLeader ? 'fill-yellow-500' : ''}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMember(member.alterId)}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No members in this affiliation yet.</p>
              {canEdit && (
                <Button variant="outline" className="mt-4" onClick={openAddMemberDialog}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Members
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
