// POST /api/search — the browser-facing half of running a query (T-0050,
// SPEC-0049 AC1).
//
// A plain form posts here and this route redirects onto the search page with
// the query in the URL, so a result page is linkable, reloadable and back-
// buttonable. The query itself runs server-side on that page.
import type { APIRoute } from 'astro';
import { SEARCH_MODES, type SearchMode } from '../../../lib/bff';

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return redirect('/search?search_outcome=refused', 303);
  }
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' ? value : '';
  };

  const query = field('q').trim();
  const mode = field('mode') as SearchMode;
  if (!query) return redirect('/search', 303);
  // A mode the contract does not name never becomes a request. The BFF would
  // refuse it as the same coarse 404 as a dead session, which tells the
  // person who typed it nothing.
  if (!SEARCH_MODES.includes(mode)) return redirect('/search?search_outcome=modeRefused', 303);

  return redirect(`/search?q=${encodeURIComponent(query)}&mode=${encodeURIComponent(mode)}`, 303);
};
