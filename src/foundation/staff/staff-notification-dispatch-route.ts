type DispatchScope = {
  eventId?: string;
  staffId?: string;
};

type DispatchAuthorization =
  { ok: true } | { ok: false; status: number; error: string };

type DispatchRouteDependencies = {
  authorize: (request: Request) => DispatchAuthorization;
  deliver: (scope: DispatchScope) => Promise<unknown>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function validateTargetedBody(
  value: unknown,
): { ok: true; scope: Required<DispatchScope> } | { ok: false; error: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      ok: false,
      error: "A JSON object with eventId and staffId is required.",
    };
  }

  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.some((key) => key !== "eventId" && key !== "staffId")) {
    return { ok: false, error: "Only eventId and staffId are accepted." };
  }

  if (
    typeof body.eventId !== "string" ||
    !UUID_PATTERN.test(body.eventId.trim())
  ) {
    return { ok: false, error: "A valid eventId is required." };
  }
  if (
    typeof body.staffId !== "string" ||
    !UUID_PATTERN.test(body.staffId.trim())
  ) {
    return { ok: false, error: "A valid staffId is required." };
  }

  return {
    ok: true,
    scope: { eventId: body.eventId.trim(), staffId: body.staffId.trim() },
  };
}

export function createStaffNotificationDispatchRouteHandlers(
  dependencies: DispatchRouteDependencies,
) {
  return {
    async GET(request: Request): Promise<Response> {
      const authorization = dependencies.authorize(request);
      if (!authorization.ok) {
        return json({ error: authorization.error }, authorization.status);
      }

      const results = await dependencies.deliver({});
      return json({ ok: true, results });
    },

    async POST(request: Request): Promise<Response> {
      const authorization = dependencies.authorize(request);
      if (!authorization.ok) {
        return json({ error: authorization.error }, authorization.status);
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "Malformed JSON body." }, 400);
      }

      const validated = validateTargetedBody(body);
      if (!validated.ok) {
        return json({ error: validated.error }, 400);
      }

      const results = await dependencies.deliver(validated.scope);
      return json({ ok: true, results });
    },
  };
}
