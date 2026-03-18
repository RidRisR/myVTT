import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as Dialog from '@radix-ui/react-dialog'
import type { HandoutAsset } from '../stores/worldStore'
import { DialogContent } from '../ui/primitives/DialogContent'

interface HandoutEditModalProps {
  asset: HandoutAsset
  onSave: (id: string, updates: Partial<HandoutAsset>) => void
  onClose: () => void
}

export function HandoutEditModal({ asset, onSave, onClose }: HandoutEditModalProps) {
  const { t } = useTranslation('dock')
  const [title, setTitle] = useState(asset.title || '')
  const [description, setDescription] = useState(asset.description || '')

  const handleSave = () => {
    onSave(asset.id, {
      title: title || undefined,
      description: description || undefined,
    })
    onClose()
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="flex flex-col items-center gap-3 max-w-[70vw]">
        <Dialog.Title className="sr-only">{t('handout.add_title')}</Dialog.Title>

        {/* Image — matches FocusedCard layout */}
        <img
          src={asset.imageUrl}
          alt=""
          className="max-w-[55vw] max-h-[50vh] object-contain rounded shadow-[0_4px_24px_rgba(0,0,0,0.6)]"
        />

        {/* Editable title/description — WYSIWYG matching FocusedCard */}
        <div className="text-center max-w-[55vw] w-full">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
            }}
            placeholder={t('handout.add_title')}
            autoFocus
            className="w-full bg-transparent border-none outline-none text-text-primary font-sans text-center text-base font-semibold"
            style={{ textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}
          />
          <textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
            }}
            placeholder={t('handout.add_description')}
            rows={2}
            className="w-full bg-transparent border-none outline-none text-text-primary/70 font-sans text-center text-[13px] leading-normal mt-1 resize-none"
            style={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}
          />
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Dialog.Close asChild>
            <button className="px-4 py-1.5 border border-border-glass rounded-md text-xs font-medium cursor-pointer font-sans bg-surface text-text-primary/70 transition-colors duration-fast hover:bg-hover">
              {t('cancel', { ns: 'common' })}
            </button>
          </Dialog.Close>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 border-none rounded-md text-xs font-semibold cursor-pointer font-sans bg-accent text-deep transition-colors duration-fast hover:bg-accent-bold"
          >
            {t('save', { ns: 'common' })}
          </button>
        </div>
      </DialogContent>
    </Dialog.Root>
  )
}
