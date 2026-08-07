import handler from "vinext/server/app-router-entry";

interface Env {
  GOOGLE_SHEET_IMPORT_TOKEN?: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Content-Type, X-Teemon-Import-Token",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    }
  });
}

async function handleGoogleSheetImport(
  request: Request,
  env: Env
) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "Content-Type, X-Teemon-Import-Token",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      }
    });
  }

  if (request.method !== "POST") {
    return json(
      {
        success: false,
        error: "Method not allowed"
      },
      405
    );
  }

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

  const products = Array.isArray(body.products)
    ? body.products
    : [];

  return json({
    success: true,
    message: "Google Sheet import API is working.",
    source: body.source || "unknown",
    received_products: products.length
  });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: unknown
  ) {
    const url = new URL(request.url);

    if (
      url.pathname ===
      "/api/google-sheet/import-products"
    ) {
      return handleGoogleSheetImport(
        request,
        env
      );
    }

    return handler.fetch(
      request,
      env,
      ctx
    );
  }
};