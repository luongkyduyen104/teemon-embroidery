# Supabase setup

1. Run `migrations/002_staff_roles.sql` in the Supabase SQL Editor.
2. Run `migrations/003_password_reset.sql` in the Supabase SQL Editor.
3. Run `migrations/004_activity_logs.sql` in the Supabase SQL Editor.
4. Run `migrations/005_activity_log_retention.sql` in the Supabase SQL Editor.
5. Run `migrations/006_product_core.sql` in the Supabase SQL Editor.
6. Run `migrations/007_repair_master_categories.sql` in the Supabase SQL Editor.
7. Run `migrations/008_fixed_category_product_rpcs.sql` in the Supabase SQL Editor.
8. Run `migrations/009_color_size_master_data.sql` in the Supabase SQL Editor.
9. Run `migrations/010_fix_product_read_policy.sql` in the Supabase SQL Editor.
10. Run `migrations/011_product_list_rpc.sql` in the Supabase SQL Editor.
11. In Supabase Dashboard, open Edge Functions and deploy `create-staff` using
   the contents of `functions/create-staff/index.ts`.
12. Deploy `manage-staff` using the contents of
   `functions/manage-staff/index.ts`.
13. Keep JWT verification enabled for both functions.

The service-role key is read only from Supabase's server environment and must
never be copied into browser code.

## Product activity logs

After a product or variant mutation succeeds, browser code can record the
authenticated actor without exposing a service-role key:

```js
import { activityActions, recordActivity } from "./js/activity.js";

await recordActivity({
  action: activityActions.UPDATE_PRODUCT,
  entityType: "product",
  entityId: product.id,
  before: previousProduct,
  after: updatedProduct,
  metadata: { source: "products_page" },
});
```

The Activity Logs UI supports `CREATE_PRODUCT`, `UPDATE_PRODUCT`,
`PUBLISH_PRODUCT`, `UNPUBLISH_PRODUCT`, `UPDATE_VARIANT`, and `UPDATE_STOCK`.
Never include passwords, access tokens, secret keys, or full sensitive payloads
in activity data.

## Activity log retention

Migration `005_activity_log_retention.sql` keeps only the latest six months of
activity logs. A Supabase Cron job runs at 02:00 UTC (09:00 Vietnam time) on
the first day of every month and permanently deletes older records. Admin users
cannot manually update or delete logs from the website.
Run `012_product_color_size_options.sql` after `011_product_list_rpc.sql`
to enable assigning multiple colors and sizes to each product.

Run `013_product_media_and_charts.sql` after `012_product_color_size_options.sql`
to enable Supabase Storage uploads, up to three product images, and chart links.

Run `014_product_publication_and_public_catalog.sql` after migration `013` to
enable Publish/Activate/Deactivate and the Supabase-backed public catalog.

Run `015_bulk_deactivate_products.sql` after migration `014` to enable selecting
multiple published products and removing them from the public catalog at once.

Run `016_public_product_detail.sql` after migration `015` to enable the public
product detail page addressed by the product URL slug.

Run `017_realtime_dashboard.sql` after migration `016` to replace dashboard
placeholders with live Supabase statistics and realtime change notifications.
