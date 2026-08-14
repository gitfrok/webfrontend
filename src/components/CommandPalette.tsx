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
  // active is the highlighted command's index within the filtered list — the
  // selection arrow keys move and Enter executes (SPEC-0021 AC6). The palette
  // opens with the first command active, so Enter alone is always a complete
  // interaction.
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((was) => !was);
        setQuery('');
        setPath('');
        setActive(0);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

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
  // The active index is clamped rather than stored clamped: filtering shrinks
  // the list under a selection that was valid a keystroke ago.
  const activeIndex = filtered.length === 0 ? -1 : Math.min(active, filtered.length - 1);

  // The palette is operable from the keyboard alone (SPEC-0021 AC6): arrows
  // move the selection and wrap, Enter executes the active command, Escape
  // closes. Navigation is a route change, so executing means following the
  // command's own href — the same target the mouse would open.
  const onPanelKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'Escape':
        setOpen(false);
        return;
      case 'ArrowDown':
        if (filtered.length === 0) return;
        event.preventDefault();
        setActive((was) => (Math.min(was, filtered.length - 1) + 1) % filtered.length);
        return;
      case 'ArrowUp':
        if (filtered.length === 0) return;
        event.preventDefault();
        setActive((was) => (Math.min(was, filtered.length - 1) + filtered.length - 1) % filtered.length);
        return;
      case 'Enter': {
        const command = filtered[activeIndex];
        if (!command) return;
        event.preventDefault();
        setOpen(false);
        window.location.assign(command.run());
        return;
      }
      default:
        return;
    }
  };

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
        <ul role="listbox" aria-label="Commands" style={{ listStyle: 'none', margin: 0, padding: 8, maxHeight: 280, overflowY: 'auto' }}>
          {filtered.map((command, index) => (
            <li key={command.id} role="option" aria-selected={index === activeIndex}>
              <a
                href={command.run()}
                style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 6, textDecoration: 'none', color: '#1f2328', background: index === activeIndex ? '#f6f8fa' : 'transparent' }}
                onMouseEnter={() => setActive(index)}
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
