function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Content-Type, X-Teemon-Import-Token",
      "Access-Control-Allow-Methods":
        "POST, OPTIONS"
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Content-Type, X-Teemon-Import-Token",
      "Access-Control-Allow-Methods":
        "POST, OPTIONS"
    }
  });
}

export async function onRequestPost(context: any) {
  const request: Request = context.request;
  const env = context.env;

  const expectedToken =
    env.GOOGLE_SHEET_IMPORT_TOKEN;

  const suppliedToken =
    request.headers.get(
      "X-Teemon-Import-Token"
    );

  if (
    !expectedToken ||
    !suppliedToken ||
    suppliedToken !== expectedToken
  ) {
    return json(
      {
        success: false,
        error: "Unauthorized"
      },
      401
    );
  }

  const body = await request
    .json()
    .catch(() => null) as {
      source?: string;
      products?: unknown[];
    } | null;

  if (!body) {
    return json(
      {
        success: false,
        error: "Invalid JSON body"
      },
      400
    );
  }

  const products =
    Array.isArray(body.products)
      ? body.products
      : [];

  return json({
    success: true,
    message:
      "Google Sheet Pages Function is working.",
    source:
      body.source || "unknown",
    received_products:
      products.length
  });
}