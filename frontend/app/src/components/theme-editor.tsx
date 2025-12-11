"use client"

// Comprehensive Theme Editor
import { useState } from 'react'
import { useTheme, type ThemeTokens } from '@/context/theme'
import { AdvancedColorPicker } from './ui/advanced-color-picker'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Separator } from './ui/separator'
import { Badge } from './ui/badge'
import {
  Palette,
  Download,
  Upload,
  Undo,
  Redo,
  Eye,
  EyeOff,
  RefreshCw,
  Type,
  Move,
  Box,
  Zap,
  Monitor,
  Smartphone,
  Tablet
} from 'lucide-react'

const colorTokens = [
  // Core Colors
  { key: 'background', label: 'Background', category: 'Core' },
  { key: 'foreground', label: 'Foreground', category: 'Core' },
  { key: 'primary', label: 'Primary', category: 'Core' },
  { key: 'primary-foreground', label: 'Primary Foreground', category: 'Core' },
  { key: 'secondary', label: 'Secondary', category: 'Core' },
  { key: 'secondary-foreground', label: 'Secondary Foreground', category: 'Core' },
  { key: 'muted', label: 'Muted', category: 'Core' },
  { key: 'muted-foreground', label: 'Muted Foreground', category: 'Core' },
  { key: 'accent', label: 'Accent', category: 'Core' },
  { key: 'accent-foreground', label: 'Accent Foreground', category: 'Core' },
  { key: 'destructive', label: 'Destructive', category: 'Core' },
  { key: 'destructive-foreground', label: 'Destructive Foreground', category: 'Core' },
  { key: 'card', label: 'Card', category: 'Core' },
  { key: 'card-foreground', label: 'Card Foreground', category: 'Core' },
  { key: 'popover', label: 'Popover', category: 'Core' },
  { key: 'popover-foreground', label: 'Popover Foreground', category: 'Core' },
  { key: 'border', label: 'Border', category: 'Core' },
  { key: 'input', label: 'Input', category: 'Core' },
  { key: 'ring', label: 'Ring', category: 'Core' },
  // Gradients
  { key: 'gradient-primary', label: 'Primary Gradient', category: 'Gradients' },
  { key: 'gradient-secondary', label: 'Secondary Gradient', category: 'Gradients' },
]

const typographyTokens = [
  { key: 'font-family-sans', label: 'Sans Font Family', category: 'Typography' },
  { key: 'font-family-mono', label: 'Mono Font Family', category: 'Typography' },
  { key: 'font-size-xs', label: 'Extra Small', category: 'Typography' },
  { key: 'font-size-sm', label: 'Small', category: 'Typography' },
  { key: 'font-size-base', label: 'Base', category: 'Typography' },
  { key: 'font-size-lg', label: 'Large', category: 'Typography' },
  { key: 'font-size-xl', label: 'Extra Large', category: 'Typography' },
  { key: 'font-size-2xl', label: '2X Large', category: 'Typography' },
  { key: 'font-size-3xl', label: '3X Large', category: 'Typography' },
  { key: 'font-weight-normal', label: 'Normal Weight', category: 'Typography' },
  { key: 'font-weight-medium', label: 'Medium Weight', category: 'Typography' },
  { key: 'font-weight-semibold', label: 'Semibold Weight', category: 'Typography' },
  { key: 'font-weight-bold', label: 'Bold Weight', category: 'Typography' },
  { key: 'line-height-tight', label: 'Tight Line Height', category: 'Typography' },
  { key: 'line-height-snug', label: 'Snug Line Height', category: 'Typography' },
  { key: 'line-height-normal', label: 'Normal Line Height', category: 'Typography' },
  { key: 'line-height-relaxed', label: 'Relaxed Line Height', category: 'Typography' },
]

const spacingTokens = [
  { key: 'spacing-1', label: 'Spacing 1 (0.25rem)', category: 'Spacing' },
  { key: 'spacing-2', label: 'Spacing 2 (0.5rem)', category: 'Spacing' },
  { key: 'spacing-3', label: 'Spacing 3 (0.75rem)', category: 'Spacing' },
  { key: 'spacing-4', label: 'Spacing 4 (1rem)', category: 'Spacing' },
  { key: 'spacing-5', label: 'Spacing 5 (1.25rem)', category: 'Spacing' },
  { key: 'spacing-6', label: 'Spacing 6 (1.5rem)', category: 'Spacing' },
  { key: 'spacing-8', label: 'Spacing 8 (2rem)', category: 'Spacing' },
  { key: 'spacing-10', label: 'Spacing 10 (2.5rem)', category: 'Spacing' },
  { key: 'spacing-12', label: 'Spacing 12 (3rem)', category: 'Spacing' },
  { key: 'spacing-16', label: 'Spacing 16 (4rem)', category: 'Spacing' },
  { key: 'spacing-20', label: 'Spacing 20 (5rem)', category: 'Spacing' },
  { key: 'spacing-24', label: 'Spacing 24 (6rem)', category: 'Spacing' },
]

const borderRadiusTokens = [
  { key: 'radius-sm', label: 'Small Radius', category: 'Border Radius' },
  { key: 'radius-md', label: 'Medium Radius', category: 'Border Radius' },
  { key: 'radius-lg', label: 'Large Radius', category: 'Border Radius' },
  { key: 'radius-xl', label: 'Extra Large Radius', category: 'Border Radius' },
]

const shadowTokens = [
  { key: 'shadow-sm', label: 'Small Shadow', category: 'Shadows' },
  { key: 'shadow-md', label: 'Medium Shadow', category: 'Shadows' },
  { key: 'shadow-lg', label: 'Large Shadow', category: 'Shadows' },
  { key: 'shadow-xl', label: 'Extra Large Shadow', category: 'Shadows' },
]

const animationTokens = [
  { key: 'animation-duration-fast', label: 'Fast Duration', category: 'Animation' },
  { key: 'animation-duration-normal', label: 'Normal Duration', category: 'Animation' },
  { key: 'animation-duration-slow', label: 'Slow Duration', category: 'Animation' },
  { key: 'animation-easing', label: 'Easing Function', category: 'Animation' },
]

const fontFamilies = [
  'Inter, sans-serif',
  'Roboto, sans-serif',
  'Open Sans, sans-serif',
  'Lato, sans-serif',
  'Poppins, sans-serif',
  'Montserrat, sans-serif',
  'Nunito, sans-serif',
  'Fira Sans, sans-serif',
  'JetBrains Mono, monospace',
  'Fira Code, monospace',
  'Source Code Pro, monospace',
  'Roboto Mono, monospace',
]

const presetThemes = {
  'Default Light': {
    'background': '#ffffff',
    'foreground': '#000000',
    'primary': '#3b82f6',
    'primary-foreground': '#ffffff',
    'secondary': '#f1f5f9',
    'secondary-foreground': '#0f172a',
    'muted': '#f8fafc',
    'muted-foreground': '#64748b',
    'accent': '#f1f5f9',
    'accent-foreground': '#0f172a',
    'destructive': '#ef4444',
    'destructive-foreground': '#ffffff',
    'card': '#ffffff',
    'card-foreground': '#000000',
    'popover': '#ffffff',
    'popover-foreground': '#000000',
    'border': '#e2e8f0',
    'input': '#e2e8f0',
    'ring': '#3b82f6',
  },
  'Default Dark': {
    'background': '#0f172a',
    'foreground': '#f8fafc',
    'primary': '#3b82f6',
    'primary-foreground': '#ffffff',
    'secondary': '#1e293b',
    'secondary-foreground': '#f1f5f9',
    'muted': '#1e293b',
    'muted-foreground': '#94a3b8',
    'accent': '#1e293b',
    'accent-foreground': '#f1f5f9',
    'destructive': '#ef4444',
    'destructive-foreground': '#ffffff',
    'card': '#1e293b',
    'card-foreground': '#f8fafc',
    'popover': '#1e293b',
    'popover-foreground': '#f8fafc',
    'border': '#334155',
    'input': '#334155',
    'ring': '#3b82f6',
  },
  'Ocean Blue': {
    'background': '#0a1929',
    'foreground': '#e2e8f0',
    'primary': '#00d4ff',
    'primary-foreground': '#0a1929',
    'secondary': '#1e3a5f',
    'secondary-foreground': '#e2e8f0',
    'muted': '#1e3a5f',
    'muted-foreground': '#94a3b8',
    'accent': '#1e3a5f',
    'accent-foreground': '#e2e8f0',
    'destructive': '#ff6b6b',
    'destructive-foreground': '#ffffff',
    'card': '#1e3a5f',
    'card-foreground': '#e2e8f0',
    'popover': '#1e3a5f',
    'popover-foreground': '#e2e8f0',
    'border': '#334155',
    'input': '#334155',
    'ring': '#00d4ff',
  },
  'Forest Green': {
    'background': '#0a1f0f',
    'foreground': '#e6f7e6',
    'primary': '#22c55e',
    'primary-foreground': '#ffffff',
    'secondary': '#1a3d1a',
    'secondary-foreground': '#e6f7e6',
    'muted': '#1a3d1a',
    'muted-foreground': '#86ef86',
    'accent': '#1a3d1a',
    'accent-foreground': '#e6f7e6',
    'destructive': '#ef4444',
    'destructive-foreground': '#ffffff',
    'card': '#1a3d1a',
    'card-foreground': '#e6f7e6',
    'popover': '#1a3d1a',
    'popover-foreground': '#e6f7e6',
    'border': '#2d5a2d',
    'input': '#2d5a2d',
    'ring': '#22c55e',
  },
  'Sunset Orange': {
    'background': '#2d1810',
    'foreground': '#fef3e7',
    'primary': '#f97316',
    'primary-foreground': '#ffffff',
    'secondary': '#451a03',
    'secondary-foreground': '#fef3e7',
    'muted': '#451a03',
    'muted-foreground': '#fdba74',
    'accent': '#451a03',
    'accent-foreground': '#fef3e7',
    'destructive': '#ef4444',
    'destructive-foreground': '#ffffff',
    'card': '#451a03',
    'card-foreground': '#fef3e7',
    'popover': '#451a03',
    'popover-foreground': '#fef3e7',
    'border': '#9a3412',
    'input': '#9a3412',
    'ring': '#f97316',
  },
}

export default function ThemeEditor() {
  const {
    tokens,
    setToken,
    resetTokens,
    presets,
    savePreset,
    deletePreset,
    applyPreset,
    exportTheme,
    importTheme,
    undo,
    redo,
    canUndo,
    canRedo
  } = useTheme()

  const [activeSection, setActiveSection] = useState<'colors' | 'typography' | 'spacing' | 'effects' | 'preview'>('colors')
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [presetName, setPresetName] = useState('')
  const [showAccessibility, setShowAccessibility] = useState(true)

  const readToken = (key: string) => {
    return tokens?.[key as keyof ThemeTokens] || getComputedStyle(document.documentElement).getPropertyValue(`--${key}`).trim() || ''
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (e) => {
          const content = e.target?.result as string
          if (importTheme(content)) {
            alert('Theme imported successfully!')
          } else {
            alert('Failed to import theme. Invalid format.')
          }
        }
        reader.readAsText(file)
      }
    }
    input.click()
  }

  const handleExport = () => {
    const data = exportTheme()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'theme.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const applyPresetTheme = (themeName: string) => {
    const themeData = presetThemes[themeName as keyof typeof presetThemes]
    if (themeData) {
      Object.entries(themeData).forEach(([key, value]) => {
        setToken(key, value)
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Palette className="w-6 h-6 text-primary" />
          <h2 className="text-2xl font-bold">Theme Editor</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={undo}
            disabled={!canUndo}
          >
            <Undo className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={redo}
            disabled={!canRedo}
          >
            <Redo className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleImport}>
            <Upload className="w-4 h-4 mr-1" />
            Import
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-1" />
            Export
          </Button>
        </div>
      </div>

      {/* Section Navigation */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg">
        {[
          { id: 'colors', label: 'Colors', icon: Palette },
          { id: 'typography', label: 'Typography', icon: Type },
          { id: 'spacing', label: 'Spacing', icon: Move },
          { id: 'effects', label: 'Effects', icon: Box },
          { id: 'preview', label: 'Preview', icon: Eye },
        ].map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant={activeSection === id ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveSection(id as 'colors' | 'typography' | 'spacing' | 'effects' | 'preview')}
            className="flex-1"
          >
            <Icon className="w-4 h-4 mr-2" />
            {label}
          </Button>
        ))}
      </div>

      {/* Colors Section */}
      {activeSection === 'colors' && (
        <div className="space-y-6">
          {/* Preset Themes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Preset Themes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {Object.keys(presetThemes).map((themeName) => (
                  <Button
                    key={themeName}
                    variant="outline"
                    onClick={() => applyPresetTheme(themeName)}
                    className="h-auto p-3 flex flex-col items-center gap-2"
                  >
                    <div className="w-full h-8 rounded grid grid-cols-4 gap-0.5">
                      {Object.values(presetThemes[themeName as keyof typeof presetThemes]).slice(0, 4).map((color, i) => (
                        <div key={i} className="rounded-sm" style={{ backgroundColor: color }} />
                      ))}
                    </div>
                    <span className="text-xs text-center">{themeName}</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Color Tokens */}
          <div className="grid gap-6">
            {['Core', 'Gradients'].map((category) => (
              <Card key={category}>
                <CardHeader>
                  <CardTitle className="text-lg">{category} Colors</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {colorTokens.filter(token => token.category === category).map(({ key, label }) => (
                      <AdvancedColorPicker
                        key={key}
                        value={readToken(key)}
                        onChange={(value) => setToken(key, value)}
                        label={label}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Typography Section */}
      {activeSection === 'typography' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Typography</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Font Families */}
            <div>
              <Label className="text-sm font-medium mb-3 block">Font Families</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {typographyTokens.filter(token => token.key.includes('font-family')).map(({ key, label }) => (
                  <div key={key} className="space-y-2">
                    <Label className="text-xs">{label}</Label>
                    <Select value={readToken(key)} onValueChange={(e) => setToken(key, e)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select font family" />
                      </SelectTrigger>
                      <SelectContent>
                        {fontFamilies.map((font) => (
                          <SelectItem key={font} value={font}>
                            {font.split(',')[0]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Font Sizes */}
            <div>
              <Label className="text-sm font-medium mb-3 block">Font Sizes</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {typographyTokens.filter(token => token.key.includes('font-size')).map(({ key, label }) => (
                  <div key={key} className="space-y-2">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      value={readToken(key)}
                      onChange={(e) => setToken(key, e.target.value)}
                      placeholder="1rem"
                    />
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Font Weights and Line Heights */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-medium mb-3 block">Font Weights</Label>
                <div className="space-y-3">
                  {typographyTokens.filter(token => token.key.includes('font-weight')).map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-3">
                      <Label className="text-xs w-24">{label}</Label>
                      <Input
                        value={readToken(key)}
                        onChange={(e) => setToken(key, e.target.value)}
                        placeholder="400"
                        className="flex-1"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium mb-3 block">Line Heights</Label>
                <div className="space-y-3">
                  {typographyTokens.filter(token => token.key.includes('line-height')).map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-3">
                      <Label className="text-xs w-24">{label}</Label>
                      <Input
                        value={readToken(key)}
                        onChange={(e) => setToken(key, e.target.value)}
                        placeholder="1.5"
                        className="flex-1"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Spacing Section */}
      {activeSection === 'spacing' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Spacing & Layout</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Spacing Scale */}
            <div>
              <Label className="text-sm font-medium mb-3 block">Spacing Scale</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {spacingTokens.map(({ key, label }) => (
                  <div key={key} className="space-y-2">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      value={readToken(key)}
                      onChange={(e) => setToken(key, e.target.value)}
                      placeholder="1rem"
                    />
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Border Radius */}
            <div>
              <Label className="text-sm font-medium mb-3 block">Border Radius</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {borderRadiusTokens.map(({ key, label }) => (
                  <div key={key} className="space-y-2">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      value={readToken(key)}
                      onChange={(e) => setToken(key, e.target.value)}
                      placeholder="0.5rem"
                    />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Effects Section */}
      {activeSection === 'effects' && (
        <div className="space-y-6">
          {/* Shadows */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Shadows</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {shadowTokens.map(({ key, label }) => (
                  <div key={key} className="space-y-2">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      value={readToken(key)}
                      onChange={(e) => setToken(key, e.target.value)}
                      placeholder="0 1px 3px rgba(0,0,0,0.1)"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Animations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Animations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {animationTokens.map(({ key, label }) => (
                  <div key={key} className="space-y-2">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      value={readToken(key)}
                      onChange={(e) => setToken(key, e.target.value)}
                      placeholder={key.includes('duration') ? '200ms' : 'ease-out'}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Preview Section */}
      {activeSection === 'preview' && (
        <div className="space-y-6">
          {/* Preview Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Preview Controls</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant={previewDevice === 'desktop' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPreviewDevice('desktop')}
                  >
                    <Monitor className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={previewDevice === 'tablet' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPreviewDevice('tablet')}
                  >
                    <Tablet className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={previewDevice === 'mobile' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPreviewDevice('mobile')}
                  >
                    <Smartphone className="w-4 h-4" />
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAccessibility(!showAccessibility)}
                >
                  {showAccessibility ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  Accessibility
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Live Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Live Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`border rounded-lg p-4 bg-background text-foreground ${
                  previewDevice === 'mobile' ? 'max-w-sm' :
                  previewDevice === 'tablet' ? 'max-w-2xl' : 'w-full'
                } mx-auto`}
              >
                {/* Sample Components */}
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between p-4 border-b">
                    <h1 className="text-xl font-bold">Sample App</h1>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">Login</Button>
                      <Button size="sm">Sign Up</Button>
                    </div>
                  </div>

                  {/* Hero Section */}
                  <div className="text-center py-8">
                    <h2 className="text-3xl font-bold mb-4">Welcome to the Theme</h2>
                    <p className="text-muted-foreground mb-6">This is how your theme looks in action.</p>
                    <div className="flex justify-center gap-4">
                      <Button>Get Started</Button>
                      <Button variant="outline">Learn More</Button>
                    </div>
                  </div>

                  {/* Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                      <Card key={i}>
                        <CardHeader>
                          <CardTitle>Card {i}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">
                            This is a sample card to demonstrate how your theme colors work together.
                          </p>
                          <Button className="mt-3" size="sm">Action</Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Form Example */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Sample Form</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Name</Label>
                          <Input placeholder="Enter your name" />
                        </div>
                        <div>
                          <Label>Email</Label>
                          <Input type="email" placeholder="Enter your email" />
                        </div>
                      </div>
                      <Button className="w-full">Submit</Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Accessibility Checks */}
          {showAccessibility && <ContrastChecks />}
        </div>
      )}

      {/* Presets Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Custom Presets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Preset name"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={() => {
                  if (presetName.trim()) {
                    savePreset(presetName.trim())
                    setPresetName('')
                  }
                }}
                disabled={!presetName.trim()}
              >
                Save Preset
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.keys(presets || {}).map((name) => (
                <div key={name} className="flex items-center justify-between p-3 border rounded">
                  <span className="font-medium">{name}</span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => applyPreset(name)}
                    >
                      Apply
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deletePreset(name)}
                      className="text-destructive hover:text-destructive"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {Object.keys(presets || {}).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No custom presets saved yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Reset Button */}
      <div className="flex justify-center">
        <Button variant="destructive" onClick={resetTokens}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Reset All Tokens
        </Button>
      </div>
    </div>
  )
}

function ContrastChecks() {
  const { tokens } = useTheme()

  function parseHex(v: string) {
    try {
      const s = v.trim()
      if (!s.startsWith('#')) return null
      let hex = s
      if (hex.length === 4) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      return [r, g, b]
    } catch {
      return null
    }
  }

  function lum(rgb: number[]) {
    const srgb = rgb.map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2]
  }

  function contrast(a: string, b: string) {
    const A = parseHex(a)
    const B = parseHex(b)
    if (!A || !B) return NaN
    const ca = lum(A)
    const cb = lum(B)
    const L1 = Math.max(ca, cb)
    const L2 = Math.min(ca, cb)
    return (L1 + 0.05) / (L2 + 0.05)
  }

  const bg = tokens?.['background'] || getComputedStyle(document.documentElement).getPropertyValue('--background')
  const fg = tokens?.['foreground'] || getComputedStyle(document.documentElement).getPropertyValue('--foreground')
  const primary = tokens?.['primary'] || getComputedStyle(document.documentElement).getPropertyValue('--primary')
  const primaryFg = getComputedStyle(document.documentElement).getPropertyValue('--primary-foreground')

  const c1 = contrast(bg, fg)
  const c2 = contrast(primary, primaryFg)

  const checks = [
    { label: 'Background / Foreground', contrast: c1, required: 4.5 },
    { label: 'Primary / Primary Foreground', contrast: c2, required: 4.5 },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Zap className="w-5 h-5" />
          Accessibility Checks
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {checks.map(({ label, contrast: c, required }) => (
            <div key={label} className="flex items-center justify-between p-3 border rounded">
              <span className="text-sm">{label}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">
                  {isNaN(c) ? 'N/A' : `${c.toFixed(2)}:1`}
                </span>
                <Badge variant={c >= required ? 'default' : 'destructive'}>
                  {c >= required ? 'Pass' : 'Fail'}
                </Badge>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          WCAG AA requires a contrast ratio of at least 4.5:1 for normal text.
        </p>
      </CardContent>
    </Card>
  )
}
