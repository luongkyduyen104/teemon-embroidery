import { env } from "cloudflare:workers";

type ImportRequest = {
  source?: string;
  products?: unknown[];
};

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

export async function OPTIONS() {
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

export async function POST(request: Request) {
  const expectedToken =
    env.GOOGLE_SHEET_IMPORT_TOKEN as string | undefined;

  const suppliedToken =
    request.headers.get("X-Teemon-Import-Token");

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

  const body = (await request
    .json()
    .catch(() => null)) as ImportRequest | null;

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