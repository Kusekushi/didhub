import React from 'react'
import ThemeEditor from '@/components/theme-editor'

const SettingsPage: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Settings</h1>
      <section className="bg-card p-4 rounded-md shadow-sm">
        <h2 className="text-lg font-medium mb-2">Appearance</h2>
        <ThemeEditor />
      </section>
    </div>
  )
}

export default SettingsPage
