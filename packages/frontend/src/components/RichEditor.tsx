import React, { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import TurndownService from 'turndown';

import logger from '../logger';

const td = new TurndownService();

export default function RichEditor({
  value,
  onChange,
  placeholder,
  uploadUrl,
}: {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  uploadUrl?: string;
}) {
  const [markdown, setMarkdown] = useState<string>('');
  const initialized = useRef(false);

  useEffect(() => {
    try {
      const mdText = value ? td.turndown(value) : '';
      setMarkdown(mdText);
    } catch (e) {
      setMarkdown('');
    }
    initialized.current = true;
  }, [value]);

  async function handleImageUpload(file: File) {
    if (!file) return null;
    if (uploadUrl) {
      try {
        const fd = new FormData();
        fd.append('file', file);
        const r = await fetch(uploadUrl, { method: 'POST', body: fd, credentials: 'include' });
        if (r.ok) {
          const j = await r.json();
          return j.url || j.thumb || null;
        }
      } catch (e) {
        logger.error('image upload failed', e);
      }
    } else {
      return await new Promise<string | ArrayBuffer | null>((res) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);
        reader.readAsDataURL(file);
      });
    }
    return null;
  }

  async function onImageSelected(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const url = await handleImageUpload(file);
    if (url) {
      const imgMd = `![image](${url})`;
      const next = (markdown ? markdown + '\n\n' : '') + imgMd;
      setMarkdown(next);
      onChange && onChange(next); // Pass markdown directly instead of HTML
    }
  }

  function onMdChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const m = e.target.value;
    setMarkdown(m);
    onChange && onChange(m); // Pass markdown directly instead of HTML
  }

  return (
    <div style={{ border: '1px solid #ccc', borderRadius: 6, display: 'flex', gap: 8 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <textarea
          value={markdown}
          onChange={onMdChange}
          placeholder={placeholder}
          style={{ minHeight: 200, padding: 8, resize: 'vertical', border: 'none', outline: 'none' }}
        />
        <div
          style={{
            padding: 8,
            borderTop: '1px solid #eee',
            background: '#fafafa',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <label style={{ cursor: 'pointer' }}>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onImageSelected} />
              Insert image
            </label>
          </div>
          <div style={{ color: '#666', fontSize: 12 }}>Markdown editor — live preview on the right</div>
        </div>
      </div>
      <div style={{ flex: 1, padding: 8, overflow: 'auto', background: '#fff', borderLeft: '1px solid #eee' }}>
        <div style={{ color: '#222' }}>
          <ReactMarkdown>{markdown}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
