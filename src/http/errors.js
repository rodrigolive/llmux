export function httpError(status, detail) {
  const e = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  e.status = status;
  return e;
}