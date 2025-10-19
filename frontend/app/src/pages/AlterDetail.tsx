import { useState, useEffect, useRef, KeyboardEvent, ChangeEvent, RefObject } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Alter, User, Relationship, Affiliation, Subsystem } from '@didhub/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { ArrowLeft, Trash2, Calendar, Briefcase, Heart, Music, Star, AlertTriangle, StickyNote, Pencil, Check, X, Plus, Upload, GripVertical, ArrowUpDown, Expand } from 'lucide-react'
import { useToast } from '@/context/ToastContext'
import { useApi } from '@/context/ApiContext'
import SoulSongPlayer from '@/components/SoulSongPlayer'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel'
import React from 'react'

type EditableField = 
  | 'name' | 'pronouns' | 'description' | 'age' | 'gender' | 'birthday' 
  | 'sexuality' | 'species' | 'alterType' | 'job' | 'weapon' | 'notes'
  | 'systemRoles' | 'soulSongs' | 'interests' | 'triggers'

// Props for editable components - defined outside to prevent recreation
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
}

// Editable text field component - defined outside to maintain stable identity
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
  onStartEditing
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
      className={`group cursor-pointer hover:bg-muted/50 rounded-md p-2 -m-2 transition-colors ${className}`}
      onClick={() => onStartEditing(field)}
    >
      {label && (
        <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
          {icon}
          {label}
          <Pencil className="w-3 h-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      )}
      <div className={`mt-1 ${!value ? 'text-muted-foreground italic' : ''}`}>
        {value || placeholder}
      </div>
    </div>
  )
}

interface EditableArrayFieldProps {
  field: EditableField
  label: string
  items: string[] | undefined
  icon: React.ReactNode
  editingField: EditableField | null
  editValue: string
  saving: boolean
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>
  onEditValueChange: (value: string) => void
  onKeyDown: (e: KeyboardEvent) => void
  onSave: () => void
  onCancel: () => void
  onStartEditing: (field: EditableField) => void
}

// Editable array field component - defined outside to maintain stable identity
function EditableArrayField({
  field,
  label,
  items,
  icon,
  editingField,
  editValue,
  saving,
  inputRef,
  onEditValueChange,
  onKeyDown,
  onSave,
  onCancel,
  onStartEditing
}: EditableArrayFieldProps) {
  const isEditing = editingField === field
  const hasItems = items && items.length > 0

  if (isEditing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="flex items-start gap-2">
          <Input
            ref={inputRef as RefObject<HTMLInputElement>}
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Comma-separated values..."
            disabled={saving}
            className="flex-1"
          />
          <Button size="sm" variant="ghost" onClick={onSave} disabled={saving}>
            <Check className="w-4 h-4 text-green-600" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
            <X className="w-4 h-4 text-red-600" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Separate items with commas, press Enter to save</p>
      </div>
    )
  }

  return (
    <div
      className="group cursor-pointer hover:bg-muted/50 rounded-md p-2 -m-2 transition-colors"
      onClick={() => onStartEditing(field)}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {icon}
        {label}
        <Pencil className="w-3 h-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      {hasItems ? (
        <div className="flex flex-wrap gap-2 mt-2">
          {items.map((item, idx) => (
            <span key={idx} className="px-2 py-1 bg-muted rounded-md text-sm">
              {item}
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-muted-foreground italic flex items-center gap-1">
          <Plus className="w-3 h-3" />
          Click to add {label.toLowerCase()}...
        </div>
      )}
    </div>
  )
}

interface EditableDateProps {
  field: EditableField
  label: string
  value: string | undefined
  icon: React.ReactNode
  editingField: EditableField | null
  editValue: string
  saving: boolean
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>
  onEditValueChange: (value: string) => void
  onKeyDown: (e: KeyboardEvent) => void
  onSave: () => void
  onCancel: () => void
  onStartEditing: (field: EditableField) => void
}

// Editable date field component - defined outside to maintain stable identity
function EditableDate({
  field,
  label,
  value,
  icon,
  editingField,
  editValue,
  saving,
  inputRef,
  onEditValueChange,
  onKeyDown,
  onSave,
  onCancel,
  onStartEditing
}: EditableDateProps) {
  const isEditing = editingField === field

  // Parse the date value to get month and day (ignore year)
  const parseDate = (dateStr: string | undefined): { month: string; day: string } => {
    if (!dateStr) return { month: '', day: '' }
    try {
      const date = new Date(dateStr)
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return { month, day }
    } catch {
      return { month: '', day: '' }
    }
  }

  const [selectedMonth, setSelectedMonth] = React.useState(() => {
    const { month } = parseDate(isEditing ? editValue : value)
    return month
  })
  
  const [selectedDay, setSelectedDay] = React.useState(() => {
    const { day } = parseDate(isEditing ? editValue : value)
    return day
  })

  // Update local state when editValue changes
  React.useEffect(() => {
    if (isEditing) {
      const { month, day } = parseDate(editValue)
      setSelectedMonth(month)
      setSelectedDay(day)
    }
  }, [editValue, isEditing])

  const handleMonthDayChange = (newMonth: string, newDay: string) => {
    setSelectedMonth(newMonth)
    setSelectedDay(newDay)
    
    // Use year 2000 as a placeholder (birthdays don't need real year)
    if (newMonth && newDay) {
      const dateStr = `2000-${newMonth.padStart(2, '0')}-${newDay.padStart(2, '0')}`
      onEditValueChange(dateStr)
    }
  }

  const months = [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ]

  const getDaysInMonth = (month: string): number => {
    if (!month) return 31
    const monthNum = parseInt(month, 10)
    // Use 2000 as leap year to allow Feb 29
    return new Date(2000, monthNum, 0).getDate()
  }

  const daysInMonth = getDaysInMonth(selectedMonth)
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1
    return { value: String(day).padStart(2, '0'), label: String(day) }
  })

  if (isEditing) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="flex items-start gap-2">
          <select
            value={selectedMonth}
            onChange={(e) => handleMonthDayChange(e.target.value, selectedDay)}
            disabled={saving}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Month</option>
            {months.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <select
            value={selectedDay}
            onChange={(e) => handleMonthDayChange(selectedMonth, e.target.value)}
            disabled={saving || !selectedMonth}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Day</option>
            {days.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          <Button size="sm" variant="ghost" onClick={onSave} disabled={saving || !selectedMonth || !selectedDay}>
            <Check className="w-4 h-4 text-green-600" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
            <X className="w-4 h-4 text-red-600" />
          </Button>
        </div>
      </div>
    )
  }

  // Format date for display (month and day only)
  const formattedDate = value ? (() => {
    try {
      const date = new Date(value)
      return date.toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric'
      })
    } catch {
      return null
    }
  })() : null

  return (
    <div
      className="group cursor-pointer hover:bg-muted/50 rounded-md p-2 -m-2 transition-colors"
      onClick={() => onStartEditing(field)}
    >
      <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
        {icon}
        {label}
        <Pencil className="w-3 h-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className={`mt-1 ${!value ? 'text-muted-foreground italic' : ''}`}>
        {formattedDate || 'Add birthday...'}
      </div>
    </div>
  )
}

export default function AlterDetail() {
  const { alterId } = useParams<{ alterId: string }>()
  const navigate = useNavigate()
  const api = useApi()
  const { show: showToast } = useToast()

  const [alter, setAlter] = useState<Alter | null>(null)
  const [system, setSystem] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [allImages, setAllImages] = useState<{ id: string; url: string }[]>([])
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [loadingRelationships, setLoadingRelationships] = useState(false)
  const [relatedAlters, setRelatedAlters] = useState<Record<string, Alter>>({})
  const [relatedUsers, setRelatedUsers] = useState<Record<string, User>>({})
  const [affiliations, setAffiliations] = useState<Affiliation[]>([])
  const [loadingAffiliations, setLoadingAffiliations] = useState(false)
  const [subsystem, setSubsystem] = useState<Subsystem | null>(null)
  const [loadingSubsystem, setLoadingSubsystem] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>('')
  const [reorderDialogOpen, setReorderDialogOpen] = useState(false)
  const [reorderImages, setReorderImages] = useState<{ id: string; url: string }[]>([])
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Inline editing state
  const [editingField, setEditingField] = useState<EditableField | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    loadAlter()
    loadRelationships()
    loadAffiliations()
    loadSubsystem()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alterId])

  useEffect(() => {
    // Focus input when editing starts
    if (editingField && inputRef.current) {
      inputRef.current.focus()
      // For text inputs, select all text
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select()
      }
    }
  }, [editingField])

  const loadAlter = async () => {
    if (!alterId) return
    setLoading(true)
    try {
      const response = await api.getAlter({ path: { alterId } })
      const alterData = response.data as Alter
      setAlter(alterData)
      
      // Load system info
      if (alterData.systemId) {
        try {
          const systemResponse = await api.getUserById({ path: { id: alterData.systemId } })
          setSystem(systemResponse.data as User)
        } catch {
          // System user not available
        }
      }

      // Load primary image if available
      if (alterData.primaryUploadId) {
        try {
          const fileResponse = await api.serveStoredFilesBatch({ 
            query: { ids: alterData.primaryUploadId } 
          })
          const files = fileResponse.data as { id: string; url: string }[]
          if (files && files.length > 0 && files[0].url) {
            setImageUrl(files[0].url)
          }
        } catch {
          // Image not available
        }
      }

      // Load all images from the images array
      if ((alterData as any).images) {
        try {
          const imagesArray = typeof (alterData as any).images === 'string' 
            ? JSON.parse((alterData as any).images) 
            : (alterData as any).images
          
          if (Array.isArray(imagesArray) && imagesArray.length > 0) {
            // Convert array to comma-separated string as expected by the API
            const idsString = imagesArray.join(',')
            const fileResponse = await api.serveStoredFilesBatch({ query: { ids: idsString } })
            const files = fileResponse.data as Array<{ file_id: string; url: string }>
            if (files && files.length > 0) {
              // Map file_id to id for consistency
              const mappedFiles = files.map(f => ({ id: f.file_id, url: f.url }))
              setAllImages(mappedFiles)
              // Set primary image if not already set from above
              if (!imageUrl && mappedFiles[0].url) {
                setImageUrl(mappedFiles[0].url)
              }
            }
          }
        } catch (err) {
          console.error('Failed to load images:', err)
          // Images not available
        }
      }
    } catch {
      showToast({ title: 'Error', description: 'Failed to load alter details', variant: 'error' })
      navigate('/system')
    } finally {
      setLoading(false)
    }
  }

  const loadRelationships = async () => {
    if (!alterId) return
    setLoadingRelationships(true)
    try {
      const response = await api.listRelationships({ 
        query: { alterId, perPage: 100 } 
      })
      // Response is either an array directly or wrapped in data/items
      const data = response.data
      let relationshipList: Relationship[] = []
      if (Array.isArray(data)) {
        relationshipList = data
      } else if ((data as any).items) {
        relationshipList = (data as any).items || []
      } else if ((data as any).data) {
        relationshipList = (data as any).data || []
      }
      setRelationships(relationshipList)

      // Fetch related alter and user details
      const alterIds = new Set<string>()
      const userIds = new Set<string>()
      
      relationshipList.forEach(rel => {
        if (rel.sideAAlterId && rel.sideAAlterId !== alterId) alterIds.add(rel.sideAAlterId)
        if (rel.sideBAlterId && rel.sideBAlterId !== alterId) alterIds.add(rel.sideBAlterId)
        if (rel.sideAUserId) userIds.add(rel.sideAUserId)
        if (rel.sideBUserId) userIds.add(rel.sideBUserId)
      })

      // Fetch alters
      if (alterIds.size > 0) {
        const alterMap: Record<string, Alter> = {}
        for (const id of alterIds) {
          try {
            const alterResponse = await api.getAlter({ path: { alterId: id } })
            alterMap[id] = alterResponse.data as Alter
          } catch {
            // Skip if alter not accessible
          }
        }
        setRelatedAlters(alterMap)
      }

      // Fetch users
      if (userIds.size > 0) {
        const userMap: Record<string, User> = {}
        for (const id of userIds) {
          try {
            const userResponse = await api.getUserById({ path: { id } })
            userMap[id] = userResponse.data as User
          } catch {
            // Skip if user not accessible
          }
        }
        setRelatedUsers(userMap)
      }
    } catch (err) {
      console.error('Failed to load relationships:', err)
      // Don't show error toast - relationships are optional
    } finally {
      setLoadingRelationships(false)
    }
  }

  const loadAffiliations = async () => {
    if (!alterId) return
    setLoadingAffiliations(true)
    try {
      const response = await api.getAlterAffiliations({ 
        path: { alterId } 
      })
      const data = response.data as { data: Affiliation[]; total: number }
      setAffiliations(data.data || [])
    } catch (err) {
      console.error('Failed to load affiliations:', err)
      // Don't show error toast - affiliations are optional
    } finally {
      setLoadingAffiliations(false)
    }
  }

  const loadSubsystem = async () => {
    if (!alterId) return
    setLoadingSubsystem(true)
    try {
      const response = await api.getAlterSubsystem({ 
        path: { alterId } 
      })
      setSubsystem(response.data as Subsystem)
    } catch (err) {
      // Not an error if no subsystem - it's optional
      setSubsystem(null)
    } finally {
      setLoadingSubsystem(false)
    }
  }

  const handleDelete = async () => {
    if (!alter) return
    if (!confirm('Are you sure you want to delete this alter?')) return
    
    try {
      await api.deleteAlter({ path: { alterId: alter.id } })
      showToast({ title: 'Success', description: 'Alter deleted successfully' })
      navigate(`/system/${alter.systemId}`)
    } catch {
      showToast({ title: 'Error', description: 'Failed to delete alter', variant: 'error' })
    }
  }

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !alter) return

    // Validate all files
    const validFiles: File[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!file.type.startsWith('image/')) {
        showToast({ title: 'Error', description: `${file.name} is not an image file`, variant: 'error' })
        continue
      }
      if (file.size > 5 * 1024 * 1024) {
        showToast({ title: 'Error', description: `${file.name} must be less than 5MB`, variant: 'error' })
        continue
      }
      validFiles.push(file)
    }

    if (validFiles.length === 0) return

    setUploadingImage(true)
    setUploadProgress(`Processing ${validFiles.length} image(s)...`)

    try {
      // Convert all files to base64
      const imagePromises = validFiles.map(file => {
        return new Promise<{ filename: string; content: string }>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve({ filename: file.name, content: reader.result as string })
          reader.onerror = () => reject(new Error(`Failed to read ${file.name}`))
          reader.readAsDataURL(file)
        })
      })

      const images = await Promise.all(imagePromises)
      setUploadProgress('Uploading...')

      // Upload all images
      const response = await api.uploadAlterImage({
        path: { alterId: alter.id },
        body: { images }
      })
      
      const data = response.data as { uploadedIds: string[]; primaryUploadId?: string }
      if (data.primaryUploadId) {
        setAlter(prev => prev ? { ...prev, primaryUploadId: data.primaryUploadId } : null)
      }
      
      // Reload to get new image URLs
      await loadAlter()
      showToast({ 
        title: 'Success', 
        description: `${validFiles.length} image(s) uploaded successfully` 
      })
    } catch (error) {
      console.error('Upload error:', error)
      showToast({ title: 'Error', description: 'Failed to upload images', variant: 'error' })
    } finally {
      setUploadingImage(false)
      setUploadProgress('')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDeleteImage = async () => {
    if (!alter || !alter.primaryUploadId) return
    if (!confirm('Are you sure you want to remove ALL images?')) return

    try {
      await api.deleteAlterImage({ path: { alterId: alter.id } })
      setAlter(prev => prev ? { ...prev, primaryUploadId: undefined } : null)
      setImageUrl(null)
      setAllImages([])
      showToast({ title: 'Success', description: 'All images removed successfully' })
    } catch {
      showToast({ title: 'Error', description: 'Failed to remove images', variant: 'error' })
    }
  }

  const handleDeleteSingleImage = async (imageId: string) => {
    if (!alter) return
    if (!confirm('Remove this image?')) return

    try {
      await api.deleteAlterImageById({ path: { alterId: alter.id, imageId } })
      // Reload to update images
      await loadAlter()
      showToast({ title: 'Success', description: 'Image removed' })
    } catch {
      showToast({ title: 'Error', description: 'Failed to remove image', variant: 'error' })
    }
  }

  const handleSetAsPrimary = async (imageId: string) => {
    if (!alter) return

    try {
      // Move the selected image to the front
      const currentImages = allImages.map(img => img.id)
      const newOrder = [imageId, ...currentImages.filter(id => id !== imageId)]
      
      await api.reorderAlterImages({
        path: { alterId: alter.id },
        body: { imageIds: newOrder }
      })
      
      // Reload to show new order
      await loadAlter()
      showToast({ title: 'Success', description: 'Primary image updated' })
    } catch {
      showToast({ title: 'Error', description: 'Failed to update primary image', variant: 'error' })
    }
  }

  const openReorderDialog = () => {
    setReorderImages([...allImages])
    setReorderDialogOpen(true)
  }

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return

    const newImages = [...reorderImages]
    const draggedImage = newImages[draggedIndex]
    newImages.splice(draggedIndex, 1)
    newImages.splice(index, 0, draggedImage)
    setReorderImages(newImages)
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  const saveReorder = async () => {
    if (!alter) return

    try {
      const newOrder = reorderImages.map(img => img.id)
      await api.reorderAlterImages({
        path: { alterId: alter.id },
        body: { imageIds: newOrder }
      })
      
      setReorderDialogOpen(false)
      await loadAlter()
      showToast({ title: 'Success', description: 'Images reordered successfully' })
    } catch {
      showToast({ title: 'Error', description: 'Failed to reorder images', variant: 'error' })
    }
  }

  const startEditing = (field: EditableField) => {
    if (!alter) return
    
    // Get current value
    let currentValue = ''
    if (field === 'systemRoles' || field === 'soulSongs' || field === 'interests' || field === 'triggers') {
      const arr = alter[field] as string[] | undefined
      currentValue = arr?.join(', ') || ''
    } else {
      currentValue = (alter[field] as string) || ''
    }
    
    setEditValue(currentValue)
    setEditingField(field)
  }

  const cancelEditing = () => {
    setEditingField(null)
    setEditValue('')
  }

  const saveField = async () => {
    if (!alter || !editingField) return
    
    setSaving(true)
    try {
      const updateData: Record<string, unknown> = {}
      
      // Handle array fields
      if (editingField === 'systemRoles' || editingField === 'soulSongs' || editingField === 'interests' || editingField === 'triggers') {
        const arr = editValue.split(',').map(s => s.trim()).filter(Boolean)
        updateData[editingField] = arr
      } else {
        updateData[editingField] = editValue || null
      }
      
      await api.updateAlter({ path: { alterId: alter.id }, body: updateData })
      
      // Update local state
      setAlter(prev => prev ? { ...prev, ...updateData } as Alter : null)
      setEditingField(null)
      setEditValue('')
      showToast({ title: 'Saved', description: `Updated successfully` })
    } catch {
      showToast({ title: 'Error', description: 'Failed to save changes', variant: 'error' })
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

  const toggleBooleanField = async (field: 'isSystemHost' | 'isDormant' | 'isMerged') => {
    if (!alter) return
    
    const newValue = !alter[field]
    try {
      await api.updateAlter({ path: { alterId: alter.id }, body: { [field]: newValue } })
      setAlter(prev => prev ? { ...prev, [field]: newValue } : null)
      showToast({ title: 'Saved', description: `Updated successfully` })
    } catch {
      showToast({ title: 'Error', description: 'Failed to save changes', variant: 'error' })
    }
  }

  const getInitials = (name: string) => {
    if (!name) return ''
    return name.split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  }

  // Helper functions for relationship display
  const getRelationshipPartner = (rel: Relationship): { type: 'alter' | 'user', id: string } | null => {
    if (!alter) return null
    
    // Determine which side is the current alter and which is the partner
    if (rel.sideAAlterId === alter.id) {
      // Current alter is on side A, partner is on side B
      if (rel.sideBAlterId) return { type: 'alter', id: rel.sideBAlterId }
      if (rel.sideBUserId) return { type: 'user', id: rel.sideBUserId }
    } else if (rel.sideBAlterId === alter.id) {
      // Current alter is on side B, partner is on side A
      if (rel.sideAAlterId) return { type: 'alter', id: rel.sideAAlterId }
      if (rel.sideAUserId) return { type: 'user', id: rel.sideAUserId }
    }
    return null
  }

  const getRelationshipDirection = (rel: Relationship): 'outgoing' | 'incoming' => {
    if (!alter) return 'outgoing'
    // If current alter is on side A, relationship goes from A to B
    return rel.sideAAlterId === alter.id ? 'outgoing' : 'incoming'
  }

  const formatRelationshipType = (relType: string, direction: 'outgoing' | 'incoming'): string => {
    // For symmetrical relationships, return as-is
    const symmetrical = ['friend', 'sibling', 'spouse', 'partner']
    if (symmetrical.includes(relType.toLowerCase())) {
      return relType
    }
    
    // For parent/child, adjust based on direction
    if (relType.toLowerCase() === 'parent') {
      return direction === 'outgoing' ? 'child of' : 'parent of'
    }
    if (relType.toLowerCase() === 'child') {
      return direction === 'outgoing' ? 'parent of' : 'child of'
    }
    
    return relType
  }

  // Common props for editable components
  const editableProps = {
    editingField,
    editValue,
    saving,
    inputRef,
    onEditValueChange: setEditValue,
    onKeyDown: handleKeyDown,
    onSave: saveField,
    onCancel: cancelEditing,
    onStartEditing: startEditing
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!alter) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold mb-2">Alter not found</h2>
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
        <Button variant="ghost" onClick={() => navigate(`/system/${alter.systemId}`)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to {system?.displayName || system?.username || 'System'}
        </Button>
        <Button variant="destructive" onClick={handleDelete}>
          <Trash2 className="w-4 h-4 mr-2" />
          Delete
        </Button>
      </div>

      {/* Main content */}
      <div className="bg-card rounded-lg shadow-sm p-6 space-y-6">
        {/* Profile header */}
        <div className="flex items-start gap-6">
          {/* Image section with upload/delete controls */}
          <div className="relative group">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={`${alter.name} image`}
                className="h-32 w-32 rounded-lg object-cover"
              />
            ) : (
              <div className="h-32 w-32 rounded-lg bg-muted flex items-center justify-center text-2xl font-medium text-muted-foreground">
                {getInitials(alter.name)}
              </div>
            )}
            {/* Image controls overlay */}
            <div className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                title="Upload image(s)"
              >
                {uploadingImage ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
              </Button>
              {alter.primaryUploadId && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleDeleteImage}
                  disabled={uploadingImage}
                  title="Delete all images"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
            {/* Upload progress indicator */}
            {uploadingImage && uploadProgress && (
              <div className="absolute -bottom-6 left-0 right-0 text-xs text-center text-muted-foreground">
                {uploadProgress}
              </div>
            )}
          </div>
          <div className="flex-1 space-y-2">{/* Name - large editable */}
            {editingField === 'name' ? (
              <div className="flex items-center gap-2">
                <Input
                  ref={inputRef as RefObject<HTMLInputElement>}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="text-3xl font-bold h-auto py-1"
                  disabled={saving}
                />
                <Button size="sm" variant="ghost" onClick={saveField} disabled={saving}>
                  <Check className="w-4 h-4 text-green-600" />
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelEditing} disabled={saving}>
                  <X className="w-4 h-4 text-red-600" />
                </Button>
              </div>
            ) : (
              <h1 
                className="text-3xl font-bold group cursor-pointer hover:bg-muted/50 rounded-md px-2 py-1 -mx-2 -my-1 inline-flex items-center gap-2"
                onClick={() => startEditing('name')}
              >
                {alter.name}
                <Pencil className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
              </h1>
            )}

            {/* Pronouns */}
            <EditableText 
              field="pronouns" 
              value={alter.pronouns} 
              placeholder="Add pronouns..."
              className="text-lg text-muted-foreground"
              {...editableProps}
            />

            {/* Description */}
            <EditableText 
              field="description" 
              value={alter.description} 
              placeholder="Add a description..."
              multiline
              className="text-muted-foreground"
              {...editableProps}
            />
            
            {/* Status badges - toggleable */}
            <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t">
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch 
                  checked={alter.isSystemHost || false} 
                  onCheckedChange={() => toggleBooleanField('isSystemHost')}
                />
                <span className={`text-sm font-medium ${alter.isSystemHost ? 'text-primary' : 'text-muted-foreground'}`}>
                  System Host
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch 
                  checked={alter.isDormant || false} 
                  onCheckedChange={() => toggleBooleanField('isDormant')}
                />
                <span className={`text-sm font-medium ${alter.isDormant ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                  Dormant
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch 
                  checked={alter.isMerged || false} 
                  onCheckedChange={() => toggleBooleanField('isMerged')}
                />
                <span className={`text-sm font-medium ${alter.isMerged ? 'text-purple-600' : 'text-muted-foreground'}`}>
                  Merged
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Image Carousel - Show all uploaded images */}
        {allImages.length > 0 && (
          <div className="pt-6 border-t">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Image Gallery ({allImages.length} {allImages.length === 1 ? 'image' : 'images'})
              </h3>
              {allImages.length > 1 && (
                <Dialog open={reorderDialogOpen} onOpenChange={setReorderDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" onClick={openReorderDialog}>
                      <ArrowUpDown className="w-4 h-4 mr-2" />
                      Reorder
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Reorder Images</DialogTitle>
                      <DialogDescription>
                        Drag images to reorder. The first image will be the primary image.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 mt-4">
                      {reorderImages.map((image, index) => (
                        <div
                          key={image.id}
                          draggable
                          onDragStart={() => handleDragStart(index)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDragEnd={handleDragEnd}
                          className={`flex items-center gap-3 p-3 border rounded-lg cursor-move hover:bg-muted/50 transition-colors ${
                            draggedIndex === index ? 'opacity-50' : ''
                          }`}
                        >
                          <GripVertical className="w-5 h-5 text-muted-foreground" />
                          <img
                            src={image.url}
                            alt={`Image ${index + 1}`}
                            className="w-16 h-16 rounded object-cover"
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium">
                              Image {index + 1}
                              {index === 0 && (
                                <span className="ml-2 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
                                  Primary
                                </span>
                              )}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const newImages = reorderImages.filter((_, i) => i !== index)
                              setReorderImages(newImages)
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                      <Button variant="outline" onClick={() => setReorderDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={saveReorder}>
                        Save Order
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
            
            {/* Carousel */}
            <Carousel className="w-full max-w-2xl mx-auto">
              <CarouselContent>
                {allImages.map((image, index) => (
                  <CarouselItem key={image.id} className="md:basis-1/2 lg:basis-1/3">
                    <div className="p-1">
                      <ContextMenu>
                        <ContextMenuTrigger>
                          <div className="relative rounded-lg overflow-hidden border-2 border-border cursor-pointer">
                            <img
                              src={`${image.url}?w=400&h=400`}
                              alt={`${alter.name} - Image ${index + 1}`}
                              className="w-full aspect-square object-cover"
                            />
                            {index === 0 && (
                              <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded font-medium shadow-lg">
                                Primary
                              </div>
                            )}
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem
                            onClick={() => window.open(`/api/files/content/${image.id}`, '_blank')}
                          >
                            <Expand className="w-4 h-4 mr-2" />
                            View Full Size
                          </ContextMenuItem>
                          <ContextMenuItem
                            onClick={() => handleDeleteSingleImage(image.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Image
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              {allImages.length > 1 && (
                <>
                  <CarouselPrevious />
                  <CarouselNext />
                </>
              )}
            </Carousel>
          </div>
        )}

        {/* Basic info grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-6 border-t">
          <EditableText field="age" label="Age" value={alter.age} placeholder="Add age..." {...editableProps} />
          <EditableText field="gender" label="Gender" value={alter.gender} placeholder="Add gender..." {...editableProps} />
          <EditableDate field="birthday" label="Birthday" value={alter.birthday} icon={<Calendar className="w-4 h-4" />} {...editableProps} />
          <EditableText field="sexuality" label="Sexuality" value={alter.sexuality} icon={<Heart className="w-4 h-4" />} placeholder="Add sexuality..." {...editableProps} />
          <EditableText field="species" label="Species" value={alter.species} placeholder="Add species..." {...editableProps} />
          <EditableText field="alterType" label="Type" value={alter.alterType} placeholder="Add type..." {...editableProps} />
          <EditableText field="job" label="Job" value={alter.job} icon={<Briefcase className="w-4 h-4" />} placeholder="Add job..." {...editableProps} />
          <EditableText field="weapon" label="Weapon" value={alter.weapon} placeholder="Add weapon..." {...editableProps} />
        </div>

        {/* Array fields */}
        <div className="space-y-6 pt-6 border-t">
          <EditableArrayField field="systemRoles" label="System Roles" items={alter.systemRoles} icon={<Star className="w-4 h-4" />} {...editableProps} />
          <div>
            <EditableArrayField field="soulSongs" label="Soul Songs" items={alter.soulSongs} icon={<Music className="w-4 h-4" />} {...editableProps} />
            <SoulSongPlayer songs={alter.soulSongs} />
          </div>
          <EditableArrayField field="interests" label="Interests" items={alter.interests} icon={<Heart className="w-4 h-4" />} {...editableProps} />
          <EditableArrayField field="triggers" label="Triggers" items={alter.triggers} icon={<AlertTriangle className="w-4 h-4" />} {...editableProps} />
        </div>

        {/* Notes */}
        <div className="pt-6 border-t">
          <EditableText 
            field="notes" 
            label="Notes" 
            value={alter.notes} 
            icon={<StickyNote className="w-4 h-4" />}
            placeholder="Add notes..."
            multiline
            {...editableProps}
          />
        </div>

        {/* Relationships */}
        <div className="pt-6 border-t">
          <div className="flex items-center gap-2 mb-4">
            <Heart className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold">Relationships</h2>
          </div>
          
          {loadingRelationships ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : relationships.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No relationships yet</p>
              <p className="text-sm mt-1">Add relationships from the System view</p>
            </div>
          ) : (
            <div className="space-y-3">
              {relationships.map((rel) => {
                const partner = getRelationshipPartner(rel)
                const direction = getRelationshipDirection(rel)
                const formattedType = formatRelationshipType(rel.relationType, direction)
                
                return (
                  <div 
                    key={rel.id} 
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium capitalize">{formattedType}</span>
                        {rel.pastLife && (
                          <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded">
                            Past Life
                          </span>
                        )}
                      </div>
                      <span className="text-muted-foreground">·</span>
                      {partner ? (
                        partner.type === 'alter' ? (
                          relatedAlters[partner.id] ? (
                            <Link 
                              to={`/alter/${partner.id}`}
                              className="text-primary hover:underline font-medium"
                            >
                              {relatedAlters[partner.id].name}
                              {system && (
                                <span className="text-muted-foreground ml-1">
                                  ({system.displayName || system.username})
                                </span>
                              )}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">Loading...</span>
                          )
                        ) : (
                          relatedUsers[partner.id] ? (
                            <Link 
                              to={`/system/${partner.id}`}
                              className="text-primary hover:underline font-medium"
                            >
                              {relatedUsers[partner.id].displayName || relatedUsers[partner.id].username}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">Loading...</span>
                          )
                        )
                      ) : (
                        <span className="text-muted-foreground">Unknown</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(rel.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Affiliations */}
        <div className="pt-6 border-t">
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold">Affiliations</h2>
          </div>
          
          {loadingAffiliations ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : affiliations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No affiliations yet</p>
              <p className="text-sm mt-1">Add affiliations from the System view</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {affiliations.map((aff) => (
                <Link
                  key={aff.id}
                  to={`/affiliation/${aff.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                    {aff.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{aff.name}</div>
                    {aff.description && (
                      <div className="text-xs text-muted-foreground truncate">
                        {aff.description}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Subsystem */}
        <div className="pt-6 border-t">
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold">Subsystem</h2>
          </div>
          
          {loadingSubsystem ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : !subsystem ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Not part of a subsystem</p>
              <p className="text-sm mt-1">Subsystems can be managed from the System view</p>
            </div>
          ) : (
            <Link
              to={`/subsystem/${subsystem.id}`}
              className="flex items-center gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
            >
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-lg">
                {subsystem.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-lg">{subsystem.name}</div>
                {subsystem.description && (
                  <div className="text-sm text-muted-foreground mt-1">
                    {subsystem.description}
                  </div>
                )}
              </div>
            </Link>
          )}
        </div>

        {/* Metadata */}
        <div className="pt-6 border-t text-sm text-muted-foreground">
          <p>Created: {new Date(alter.createdAt).toLocaleString()}</p>
          <p>Updated: {new Date(alter.updatedAt).toLocaleString()}</p>
          {system && (
            <p className="mt-2">
              Part of system:{' '}
              <Link to={`/system/${system.id}`} className="text-primary hover:underline">
                {system.displayName || system.username}
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
