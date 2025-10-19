"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Copy, Palette, Shuffle } from 'lucide-react'

interface AdvancedColorPickerProps {
  value: string
  onChange: (value: string) => void
  label: string
}

interface ColorHarmony {
  name: string
  colors: string[]
}

export function AdvancedColorPicker({
  value,
  onChange,
  label
}: AdvancedColorPickerProps) {
  const [activeTab, setActiveTab] = useState<'picker' | 'palette' | 'harmony'>('picker')

  const rgbToHex = (r: number, g: number, b: number): string => {
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
  }

  // Parse color and compute derived values synchronously (not in effect)
  const parseColor = (color: string): { hex: string; rgb: { r: number; g: number; b: number }; hsl: { h: number; s: number; l: number } } => {
    try {
      // Create a temporary element to parse the color
      const temp = document.createElement('div')
      temp.style.color = color
      document.body.appendChild(temp)
      const computed = getComputedStyle(temp).color
      document.body.removeChild(temp)

      // Parse RGB from computed style
      const rgbMatch = computed.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
      if (rgbMatch) {
        const r = parseInt(rgbMatch[1])
        const g = parseInt(rgbMatch[2])
        const b = parseInt(rgbMatch[3])

        // Convert RGB to HSL
        const rNorm = r / 255
        const gNorm = g / 255
        const bNorm = b / 255

        const max = Math.max(rNorm, gNorm, bNorm)
        const min = Math.min(rNorm, gNorm, bNorm)
        let h = 0, s = 0
        const l = (max + min) / 2

        if (max !== min) {
          const d = max - min
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

          switch (max) {
            case rNorm: h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0); break
            case gNorm: h = (bNorm - rNorm) / d + 2; break
            case bNorm: h = (rNorm - gNorm) / d + 4; break
          }
          h /= 6
        }

        const hex = color.startsWith('#') ? color : rgbToHex(r, g, b)
        return {
          hex,
          rgb: { r, g, b },
          hsl: { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
        }
      }
    } catch {
      // Fallback for invalid colors
    }
    return {
      hex: '#000000',
      rgb: { r: 0, g: 0, b: 0 },
      hsl: { h: 0, s: 0, l: 0 }
    }
  }

  // Compute derived values from the prop value
  const parsed = parseColor(value)
  const hexValue = parsed.hex
  const rgbValue = parsed.rgb
  const hslValue = parsed.hsl

  const hslToRgb = (h: number, s: number, l: number) => {
    h /= 360
    s /= 100
    l /= 100

    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1/6) return p + (q - p) * 6 * t
      if (t < 1/2) return q
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
      return p
    }

    let r, g, b
    if (s === 0) {
      r = g = b = l
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s
      const p = 2 * l - q
      r = hue2rgb(p, q, h + 1/3)
      g = hue2rgb(p, q, h)
      b = hue2rgb(p, q, h - 1/3)
    }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    }
  }

  const updateFromHex = (hex: string) => {
    if (/^#[0-9A-F]{6}$/i.test(hex)) {
      onChange(hex)
    }
  }

  const updateFromRgb = (component: 'r' | 'g' | 'b', val: number) => {
    const newRgb = { ...rgbValue, [component]: val }
    const hex = rgbToHex(newRgb.r, newRgb.g, newRgb.b)
    onChange(hex)
  }

  const updateFromHsl = (component: 'h' | 's' | 'l', val: number) => {
    const newHsl = { ...hslValue, [component]: val }
    const rgb = hslToRgb(newHsl.h, newHsl.s, newHsl.l)
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b)
    onChange(hex)
  }

  const generateHarmony = (baseColor: string): ColorHarmony[] => {
    // Parse base color to HSL
    const temp = document.createElement('div')
    temp.style.color = baseColor
    document.body.appendChild(temp)
    const computed = getComputedStyle(temp).color
    document.body.removeChild(temp)

    const rgbMatch = computed.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
    if (!rgbMatch) return []

    const r = parseInt(rgbMatch[1]) / 255
    const g = parseInt(rgbMatch[2]) / 255
    const b = parseInt(rgbMatch[3]) / 255

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    let h = 0, s = 0, l = (max + min) / 2

    if (max !== min) {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break
        case g: h = (b - r) / d + 2; break
        case b: h = (r - g) / d + 4; break
      }
      h /= 6
    }

    h *= 360
    s *= 100
    l *= 100

    const harmonies: ColorHarmony[] = [
      {
        name: 'Complementary',
        colors: [
          `hsl(${h}, ${s}%, ${l}%)`,
          `hsl(${(h + 180) % 360}, ${s}%, ${l}%)`
        ]
      },
      {
        name: 'Triadic',
        colors: [
          `hsl(${h}, ${s}%, ${l}%)`,
          `hsl(${(h + 120) % 360}, ${s}%, ${l}%)`,
          `hsl(${(h + 240) % 360}, ${s}%, ${l}%)`
        ]
      },
      {
        name: 'Analogous',
        colors: [
          `hsl(${(h - 30 + 360) % 360}, ${s}%, ${l}%)`,
          `hsl(${h}, ${s}%, ${l}%)`,
          `hsl(${(h + 30) % 360}, ${s}%, ${l}%)`
        ]
      },
      {
        name: 'Split Complementary',
        colors: [
          `hsl(${h}, ${s}%, ${l}%)`,
          `hsl(${(h + 150) % 360}, ${s}%, ${l}%)`,
          `hsl(${(h + 210) % 360}, ${s}%, ${l}%)`
        ]
      }
    ]

    return harmonies
  }

  const colorPalette = [
    '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff',
    '#800000', '#008000', '#000080', '#808000', '#800080', '#008080', '#808080',
    '#c0c0c0', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd', '#98d8c8'
  ]

  const harmonies = generateHarmony(value)

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Palette className="w-4 h-4" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-1 mb-4">
          <Button
            variant={activeTab === 'picker' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('picker')}
            className="flex-1"
          >
            Picker
          </Button>
          <Button
            variant={activeTab === 'palette' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('palette')}
            className="flex-1"
          >
            Palette
          </Button>
          <Button
            variant={activeTab === 'harmony' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('harmony')}
            className="flex-1"
          >
            Harmony
          </Button>
        </div>

        {activeTab === 'picker' && (
          <div className="space-y-4">
            {/* Color Preview */}
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-lg border-2 border-border"
                style={{ backgroundColor: value }}
              />
              <div className="flex-1">
                <Label htmlFor="hex-input" className="text-xs">HEX</Label>
                <Input
                  id="hex-input"
                  value={hexValue}
                  onChange={(e) => updateFromHex(e.target.value)}
                  className="font-mono text-sm"
                  placeholder="#000000"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(hexValue)}
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>

            {/* RGB Controls */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">R</Label>
                <Input
                  type="number"
                  min="0"
                  max="255"
                  value={rgbValue.r}
                  onChange={(e) => updateFromRgb('r', parseInt(e.target.value) || 0)}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">G</Label>
                <Input
                  type="number"
                  min="0"
                  max="255"
                  value={rgbValue.g}
                  onChange={(e) => updateFromRgb('g', parseInt(e.target.value) || 0)}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">B</Label>
                <Input
                  type="number"
                  min="0"
                  max="255"
                  value={rgbValue.b}
                  onChange={(e) => updateFromRgb('b', parseInt(e.target.value) || 0)}
                  className="text-sm"
                />
              </div>
            </div>

            {/* HSL Controls */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">H</Label>
                <Input
                  type="number"
                  min="0"
                  max="360"
                  value={hslValue.h}
                  onChange={(e) => updateFromHsl('h', parseInt(e.target.value) || 0)}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">S</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={hslValue.s}
                  onChange={(e) => updateFromHsl('s', parseInt(e.target.value) || 0)}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">L</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={hslValue.l}
                  onChange={(e) => updateFromHsl('l', parseInt(e.target.value) || 0)}
                  className="text-sm"
                />
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const randomColor = `#${Math.floor(Math.random()*16777215).toString(16)}`
                  updateFromHex(randomColor)
                }}
              >
                <Shuffle className="w-3 h-3 mr-1" />
                Random
              </Button>
            </div>
          </div>
        )}

        {activeTab === 'palette' && (
          <div className="space-y-4">
            <div className="grid grid-cols-8 gap-2">
              {colorPalette.map((color) => (
                <button
                  key={color}
                  className="w-8 h-8 rounded border-2 border-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  onClick={() => updateFromHex(color)}
                  title={color}
                />
              ))}
            </div>
          </div>
        )}

        {activeTab === 'harmony' && (
          <div className="space-y-4">
            {harmonies.map((harmony) => (
              <div key={harmony.name} className="space-y-2">
                <Label className="text-sm font-medium">{harmony.name}</Label>
                <div className="flex gap-2">
                  {harmony.colors.map((color, index) => (
                    <button
                      key={index}
                      className="w-8 h-8 rounded border-2 border-border hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                      onClick={() => onChange(color)}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}