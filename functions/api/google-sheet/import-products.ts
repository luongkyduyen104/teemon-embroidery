type Env = {
  GOOGLE_SHEET_IMPORT_TOKEN?: string;
  GOOGLE_SHEET_USER_ID?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

type ImportProduct = {
  product_code?: string;
  product_name?: string;
  slug?: string;
  category_code?: string;
  short_description?: string | null;
  description?: string;
  keywords?: string[];
  colors?: string[];
  sizes?: string[];
  design_note?: string | null;
  size_chart_url?: string | null;
  color_chart_url?: string | null;
  mockup_urls?: string[];
  fulfillment?: unknown[];
};

type ImportRequest = {
  source?: string;
  products?: ImportProduct[];
};

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

export async function onRequestPost(context: {
  request: Request;
  env: Env;
}) {
  const request = context.request;
  const env = context.env;

  /*
   * 1. Authenticate Google Sheet integration.
   */
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
        error: "Unauthorized",

        // Temporary debug.
        // Does NOT expose the actual token.
        debug: {
          cloudflare_token_present:
            Boolean(expectedToken),

          cloudflare_token_length:
            expectedToken?.length ?? 0,

          supplied_token_present:
            Boolean(suppliedToken),

          supplied_token_length:
            suppliedToken?.length ?? 0,

          tokens_match:
            suppliedToken === expectedToken
        }
      },
      401
    );
  }

  /*
   * 2. Check server configuration.
   */
  if (
    !env.SUPABASE_URL ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    !env.GOOGLE_SHEET_USER_ID
  ) {
    return json(
      {
        success: false,
        error:
          "Cloudflare server configuration is incomplete",

        config: {
          supabase_url_present:
            Boolean(env.SUPABASE_URL),

          service_role_key_present:
            Boolean(
              env.SUPABASE_SERVICE_ROLE_KEY
            ),

          google_sheet_user_id_present:
            Boolean(
              env.GOOGLE_SHEET_USER_ID
            )
        }
      },
      500
    );
  }

  /*
   * 3. Read request body.
   */
  const body = await request
    .json()
    .catch(() => null) as ImportRequest | null;

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

  if (products.length === 0) {
    return json(
      {
        success: false,
        error: "No products supplied"
      },
      400
    );
  }

  if (products.length > 50) {
    return json(
      {
        success: false,
        error:
          "Maximum 50 products per request"
      },
      400
    );
  }

  /*
   * 4. Import products one by one.
   *
   * Each Supabase RPC call is transactional
   * for that product.
   */
  const results: Array<
    Record<string, unknown>
  > = [];

  for (const product of products) {
    const code = String(
      product?.product_code ?? ""
    ).trim();

    if (!code) {
      results.push({
        product_code: "",
        success: false,
        error: "Product code is required"
      });

      continue;
    }

    try {
      const rpcUrl =
        `${env.SUPABASE_URL}` +
        `/rest/v1/rpc/google_sheet_import_product`;

      const rpcResponse =
        await fetch(
          rpcUrl,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              apikey:
                env.SUPABASE_SERVICE_ROLE_KEY,

              Authorization:
                `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
            },

            body: JSON.stringify({
              p_actor_user_id:
                env.GOOGLE_SHEET_USER_ID,

              p_product: {
                product_code:
                  product.product_code,

                product_name:
                  product.product_name,

                slug:
                  product.slug,

                category_code:
                  product.category_code,

                short_description:
                  product.short_description ??
                  null,

                description:
                  product.description,

                keywords:
                  Array.isArray(
                    product.keywords
                  )
                    ? product.keywords
                    : [],

                colors:
                  Array.isArray(
                    product.colors
                  )
                    ? product.colors
                    : [],

                sizes:
                  Array.isArray(
                    product.sizes
                  )
                    ? product.sizes
                    : [],

                design_note:
                  product.design_note ??
                  null,

                size_chart_url:
                  product.size_chart_url ??
                  null,

                color_chart_url:
                  product.color_chart_url ??
                  null,

                mockup_urls:
                  Array.isArray(
                    product.mockup_urls
                  )
                    ? product.mockup_urls
                    : []
              },

              p_fulfillment:
                Array.isArray(
                  product.fulfillment
                )
                  ? product.fulfillment
                  : []
            })
          }
        );

      const responseText =
        await rpcResponse.text();

      let responseBody: unknown;

      try {
        responseBody =
          responseText
            ? JSON.parse(responseText)
            : null;
      } catch {
        responseBody =
          responseText;
      }

      if (!rpcResponse.ok) {
        let message =
          responseText ||
          "Supabase RPC failed";

        if (
          typeof responseBody === "object" &&
          responseBody !== null &&
          "message" in responseBody
        ) {
          message = String(
            (
              responseBody as {
                message?: unknown;
              }
            ).message
          );
        }

        results.push({
          product_code: code,
          success: false,
          error: message,
          http_status:
            rpcResponse.status
        });

        continue;
      }

      results.push({
        product_code: code,
        success: true,
        result: responseBody
      });

    } catch (error) {
      results.push({
        product_code: code,
        success: false,

        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
  }

  const succeeded =
    results.filter(
      item =>
        item.success === true
    ).length;

  const failed =
    results.length - succeeded;

  return json({
    success:
      failed === 0,

    source:
      body.source ||
      "google_sheets",

    processed:
      results.length,

    succeeded,

    failed,

    results
  });
}