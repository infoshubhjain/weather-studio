// One place that turns thrown errors into JSON responses, so every route
// fails the same way instead of each one inventing its own shape.
export function fail(err) {
  const status = err?.status ?? 500;
  if (status >= 500) console.error('[api]', err);
  return Response.json(
    { error: err?.message ?? 'Unexpected server error.', field: err?.field, status },
    { status },
  );
}

export const ok = (data, init) => Response.json(data, init);
