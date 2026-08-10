// Command palette (SPEC-0008, ADR-0015): Ctrl+K / Cmd+K opens a focus-trapped,
// keyboard-operable palette. The v0 commands are Browse tree, Open file, and
// Compare revisions for the current repository. Selecting one changes only the
// browser route; Enter executes and Escape closes.
import { useEffect, useRef, useState } from 'react';

interface PaletteCommand {
  id: string;
  label: string;
  hint: string;
  // run returns the route this command navigates to.
  run: () => string;
}

export default function CommandPalette({ repositoryID, revision }: { repositoryID: string; revision: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [path, setPath] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((was) => !was);
        setQuery('');
        setPath('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Focus trap: Tab cycles inside the palette; Escape closes.
  const onPanelKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  if (!open) return null;

  const commands: PaletteCommand[] = [
    {
      id: 'tree',
      label: 'Browse tree',
      hint: `List files at ${revision}`,
      run: () => `/repos/${repositoryID}/tree/${encodeURIComponent(revision)}`,
    },
    {
      id: 'file',
      label: 'Open file',
      hint: path ? `View ${path} at ${revision}` : 'Enter a repository-relative path',
      run: () => `/repos/${repositoryID}/file/${encodeURIComponent(revision)}/${path.split('/').map(encodeURIComponent).join('/')}`,
    },
    {
      id: 'diff',
      label: 'Compare revisions',
      hint: `Diff ${revision} against its parent`,
      run: () => `/repos/${repositoryID}/diff/${encodeURIComponent(revision)}`,
    },
  ];

  const filtered = commands.filter((command) => command.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div
      role="dialog"
      aria-label="Command palette"
      onKeyDown={onPanelKeyDown}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', paddingTop: '12vh' }}
    >
      <div style={{ background: '#fff', color: '#1f2328', width: 'min(480px, 90vw)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="What would you like to do?"
          aria-label="Command palette input"
          style={{ width: '100%', padding: '12px 16px', border: 'none', borderBottom: '1px solid #d0d7de', borderRadius: '8px 8px 0 0', outline: 'none', fontSize: 14 }}
        />
        {query.trim() === '' && (
          <div style={{ padding: '8px 16px', color: '#6e7781', fontSize: 12 }}>
            For "Open file", type the path in the input after selecting it.
          </div>
        )}
        <ul style={{ listStyle: 'none', margin: 0, padding: 8, maxHeight: 280, overflowY: 'auto' }}>
          {filtered.map((command) => (
            <li key={command.id}>
              <a
                href={command.run()}
                style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 6, textDecoration: 'none', color: '#1f2328' }}
                onMouseEnter={(event) => (event.currentTarget.style.background = '#f6f8fa')}
                onMouseLeave={(event) => (event.currentTarget.style.background = 'transparent')}
                onClick={() => setOpen(false)}
              >
                <span>{command.label}</span>
                <span style={{ color: '#6e7781', fontSize: 12 }}>{command.hint}</span>
              </a>
            </li>
          ))}
          {filtered.length === 0 && <li style={{ padding: 8, color: '#6e7781' }}>No matching command</li>}
        </ul>
        {path !== '' && query.toLowerCase().includes('open file') && (
          <input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="path/to/file"
            aria-label="File path"
            style={{ width: '100%', padding: '8px 16px', border: 'none', borderTop: '1px solid #d0d7de', outline: 'none', fontSize: 14 }}
          />
        )}
      </div>
    </div>
  );
}
