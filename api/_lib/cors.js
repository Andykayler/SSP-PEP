// The parent app also runs in a browser (parents.acalinks.com), a different
// origin from the API, so the browser asks permission before it calls. Native
// builds ignore this. Auth is a bearer token, not cookies, so allowing any
// origin does not widen who can do what.
export function cors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}
