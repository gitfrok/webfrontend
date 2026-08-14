// SPEC-0021 AC6 / SPEC-0008 AC2: the palette is operable from the keyboard
// alone. Ctrl+K and Cmd+K open and close it, arrows move the selection and
// wrap, Enter executes the active command, and Escape closes without
// navigating. These are the three v0 commands (ADR-0015) and nothing else:
// every command changes only the browser route.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CommandPalette from '../src/components/CommandPalette';

const assign = vi.fn();

beforeEach(() => {
  assign.mockReset();
  // jsdom refuses a real navigation; the route the palette would open is the
  // observable behaviour, so the assignment itself is what the test reads.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { assign, href: 'http://app.gitsaas.test/repos/repo-1/tree/main' },
  });
});

afterEach(cleanup);

function palette() {
  return render(<CommandPalette repositoryID="repo-1" revision="main" />);
}

async function open(user: ReturnType<typeof userEvent.setup>, key = '{Control>}k{/Control}') {
  await user.keyboard(key);
  return screen.getByRole('dialog', { name: 'Command palette' });
}

function selected() {
  const active = screen.getAllByRole('option').find((option) => option.getAttribute('aria-selected') === 'true');
  return active?.textContent ?? '';
}

describe('command palette keyboard operation', () => {
  it('opens on Ctrl+K and on Cmd+K, and closes on the same chord', async () => {
    const user = userEvent.setup();
    palette();
    expect(screen.queryByRole('dialog')).toBeNull();

    await open(user);
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeTruthy();
    await user.keyboard('{Control>}k{/Control}');
    expect(screen.queryByRole('dialog')).toBeNull();

    await open(user, '{Meta>}k{/Meta}');
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeTruthy();
  });

  it('offers exactly the three v0 commands, with the first one active', async () => {
    const user = userEvent.setup();
    palette();
    await open(user);

    expect(screen.getAllByRole('option').map((option) => option.textContent?.split('List')[0].split('Enter')[0].split('View')[0].split('Diff')[0]))
      .toEqual(['Browse tree', 'Open file', 'Compare revisions']);
    expect(selected()).toContain('Browse tree');
  });

  it('moves the selection with the arrows and wraps at both ends', async () => {
    const user = userEvent.setup();
    palette();
    await open(user);

    await user.keyboard('{ArrowDown}');
    expect(selected()).toContain('Open file');
    await user.keyboard('{ArrowDown}');
    expect(selected()).toContain('Compare revisions');
    // Past the end, back to the top.
    await user.keyboard('{ArrowDown}');
    expect(selected()).toContain('Browse tree');
    // And backwards past the top, to the end.
    await user.keyboard('{ArrowUp}');
    expect(selected()).toContain('Compare revisions');
  });

  it('executes the active command on Enter, navigating to its route', async () => {
    const user = userEvent.setup();
    palette();
    await open(user);

    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('/repos/repo-1/diff/main');
    // Executing closes the palette.
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('encodes a revision that would otherwise reshape the route', async () => {
    const user = userEvent.setup();
    render(<CommandPalette repositoryID="repo-1" revision="feature/one two" />);
    await open(user);

    await user.keyboard('{Enter}');

    expect(assign).toHaveBeenCalledWith('/repos/repo-1/tree/feature%2Fone%20two');
  });

  it('closes on Escape without navigating', async () => {
    const user = userEvent.setup();
    palette();
    await open(user);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it('narrows to the typed query, and Enter cannot execute what is not listed', async () => {
    const user = userEvent.setup();
    palette();
    await open(user);

    await user.keyboard('compare');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect(assign).toHaveBeenCalledWith('/repos/repo-1/diff/main');

    // A query matching nothing leaves Enter inert rather than executing a
    // command the user cannot see.
    assign.mockReset();
    await open(user);
    await user.keyboard('nothing matches this{Enter}');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(assign).not.toHaveBeenCalled();
  });
});
