// A stand-in for the BFF, for the browse → file → diff end-to-end run
// (SPEC-0021 AC6, AC4). It answers exactly the three SPEC-0021 read endpoints
// and nothing else, so a request the SSR layer invents shows up as a 404 in the
// test rather than passing silently.
//
// It is deliberately dumb: no policy, no tenancy, no streaming subtleties. The
// contract under test here is the browser's path through the SSR routes, not
// the BFF's own behaviour — that has its own suite in bff/internal/browser.
import { createServer } from 'node:http';

const port = Number(process.env.STUB_BFF_PORT ?? 4321);

// The session cookie the SSR layer forwards. A request arriving without it is
// refused the same coarse way the real BFF refuses one (SPEC-0001), which is
// what lets the E2E assert that identity travels in the cookie and nowhere else.
const sessionCookie = '__Host-gitfrok_session';

const treeView = {
  entries: [
    { path: 'src', kind: 2, sizeBytes: '0' },
    { path: 'README.md', kind: 1, sizeBytes: '31' },
  ],
  nextPageToken: '',
};

const fileBody = '# gitfrok\n\nBrowsed through the BFF.\n';

const patch = `diff --git a/README.md b/README.md
index 1111111..2222222 100644
--- a/README.md
+++ b/README.md
@@ -1,2 +1,3 @@
 # gitfrok
+Browsed through the BFF.
`;

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://localhost:${port}`);
  const cookies = request.headers.cookie ?? '';
  if (!cookies.includes(`${sessionCookie}=`)) {
    response.writeHead(404, { 'cache-control': 'private, no-store' });
    response.end();
    return;
  }

  const [, , , repositoryID, view] = url.pathname.split('/');
  if (!repositoryID || repositoryID === 'unknown-repo') {
    response.writeHead(404, { 'cache-control': 'private, no-store' });
    response.end();
    return;
  }

  const headers = { 'cache-control': 'private, no-store' };
  switch (view) {
    case 'tree':
      response.writeHead(200, { ...headers, 'content-type': 'application/json' });
      response.end(JSON.stringify(treeView));
      return;
    case 'file':
      response.writeHead(200, {
        ...headers,
        'content-type': 'application/octet-stream',
        'x-gitfrok-file-metadata': JSON.stringify({
          path: url.searchParams.get('path'),
          sizeBytes: String(fileBody.length),
        }),
      });
      response.end(fileBody);
      return;
    case 'diff':
      response.writeHead(200, { ...headers, 'content-type': 'text/plain' });
      response.end(patch);
      return;
    default:
      response.writeHead(404, headers);
      response.end();
  }
});

server.listen(port, () => {
  process.stdout.write(`stub bff listening on ${port}\n`);
});
