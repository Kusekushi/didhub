import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

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

  useEffect(() => {
    setMarkdown(value || '');
  }, [value]);

  function onMdChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const m = e.target.value;
    setMarkdown(m);
    onChange && onChange(m);
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
          <div style={{ color: '#666', fontSize: 12 }}>Markdown editor — live preview on the right</div>
        </div>
      </div>
      <div style={{ flex: 1, padding: 8, overflow: 'auto', background: '#fff', borderLeft: '1px solid #eee' }}>
        <div style={{ color: '#222' }}>
          <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{markdown}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
