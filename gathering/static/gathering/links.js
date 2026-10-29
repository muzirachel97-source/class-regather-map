const fields = {name: 60, student_code: 64, claim_code: 200, view_code: 200};

export function readEntryLink(href) {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const values = {};
  let consumed = false, fragmentChanged = false;
  for (const [key, maximum] of Object.entries(fields)) {
    const value = fragment.get(key) ?? url.searchParams.get(key);
    values[key] = value != null && value.length <= maximum ? value : '';
    if (fragment.has(key)) {fragment.delete(key); fragmentChanged = true;}
    if (url.searchParams.has(key) || value != null) consumed = true;
    url.searchParams.delete(key);
  }
  if (fragmentChanged) url.hash = fragment.toString();
  return {values, consumed, cleanUrl: url.pathname + url.search + url.hash};
}

export function buildEntryLink(href, values) {
  const url = new URL(href);
  url.search = ''; url.hash = '';
  const fragment = new URLSearchParams();
  for (const key of Object.keys(fields)) {
    if (typeof values[key] === 'string' && values[key]) fragment.set(key, values[key]);
  }
  url.hash = fragment.toString();
  return url.href;
}
