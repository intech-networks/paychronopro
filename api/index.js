import app from '../server/src/index.js';

export default function handler(request, response) {
  const requestedPath = Array.isArray(request.query.path)
    ? request.query.path.join('/')
    : String(request.query.path || '');
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(request.query)) {
    if (key === 'path') continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) search.append(key, String(item));
    }
  }

  request.url = `/api/${requestedPath}${search.size ? `?${search}` : ''}`;
  return app(request, response);
}
