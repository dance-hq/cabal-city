'use client'

import { useState } from 'react'
import { TeamImageCropper } from '@/components/cabal/team-image-cropper'

export default function CropTest() {
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<'banner' | 'logo'>('banner')
  async function open(k: 'banner' | 'logo') {
    const blob = await (await fetch('/__crop-test.png')).blob()
    setKind(k)
    setFile(new File([blob], 'test.png', { type: 'image/png' }))
  }
  return (
    <main className="flex gap-2 p-6">
      <button className="rounded border px-3 py-1" onClick={() => open('banner')}>open banner</button>
      <button className="rounded border px-3 py-1" onClick={() => open('logo')}>open logo</button>
      <TeamImageCropper
        file={file}
        kind={kind}
        teamName="Dance Technologies"
        busy={false}
        onCancel={() => setFile(null)}
        onSave={(c) => console.log('saved', JSON.stringify(c))}
      />
    </main>
  )
}
