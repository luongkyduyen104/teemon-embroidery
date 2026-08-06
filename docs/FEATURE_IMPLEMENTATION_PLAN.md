# TEEMON Product Catalog - Feature Implementation Plan

Nguon chuan: `Product_Catalog_System_Specification_v1.pdf` (v1.0).

Muc dich cua file nay la chia du an thanh tung buoc nho, ghi ro phu thuoc, quyen,
du lieu va tieu chi hoan thanh. Khong trien khai buoc sau khi dieu kien cua buoc
truoc chua dat.

## 1. Nguyen tac khong duoc thay doi

- Category co dinh: Clothing, Home & Living, Accessories.
- Mot tai khoan co dung mot role: `sales`, `warehouse`, hoac `admin`.
- Root Admin khong phai role rieng: `role=admin` va `is_root_admin=true`.
- Regular Admin chi tao Sales/Warehouse. Chi Root Admin duoc tao/promote Admin.
- Root Admin khong duoc lock, deactivate hoac downgrade.
- SKU thuoc Variant, nhap thu cong, trim khoang trang va unique khong phan biet hoa/thuong.
- Variant = Product + Color + Size; sinh tu dong theo Color x Size.
- Fulfillment = Product + Size, khong phu thuoc Color.
- Weight dung gram. Tien dung USD va kieu decimal, khong dung float.
- Product/Variant khong hard delete trong v1.0.
- Moi mutation quan trong phai co Activity Log.
- Backend/database authorization la quyen chuan; an nut tren frontend khong du de bao mat.

## 2. Ma tran quyen

| Capability | Sales | Warehouse | Admin | Root Admin |
|---|---:|---:|---:|---:|
| Doc product/variant | Yes | Yes | Yes | Yes |
| Xem va export pricing | Yes | No | Yes | Yes |
| Cap nhat stock status | No | Yes | Yes | Yes |
| Tao/sua product | No | No | Yes | Yes |
| Quan ly images/specs/charts | No | No | Yes | Yes |
| Quan ly SKU/variant status | No | No | Yes | Yes |
| Quan ly fulfillment/pricing | No | No | Yes | Yes |
| Tao Sales/Warehouse | No | No | Yes | Yes |
| Tao/promote Admin | No | No | No | Yes |
| Sua/vo hieu hoa Root Admin | No | No | No | No |

Warehouse response/export tuyet doi khong chua base cost, shipping, currency.

## 3. Trang thai prototype hien tai

### Da co

- [x] Public landing page.
- [x] Public catalog prototype voi search/filter/sort.
- [x] Admin dashboard prototype.
- [x] Supabase email/password sign-in va sign-out.
- [x] Profiles voi Admin/Sales/Warehouse va Root Admin flag.
- [x] User page: admin profile, create staff, list staff, enable/disable.
- [x] Admin reset password staff.
- [x] Bat staff doi initial password o lan dang nhap ke tiep.
- [x] Edge Functions: `create-staff`, `manage-staff`.
- [x] Migrations: roles va password reset.

### Chua dat acceptance

- [ ] Root Admin tao Admin.
- [ ] Role change co revoke sessions.
- [ ] Lock/deactivate/password reset revoke tat ca sessions.
- [ ] Idle session timeout 8 gio va absolute lifetime 7 ngay.
- [ ] Login rate limit 5 lan/15 phut theo IP + email.
- [ ] Activity log bat bien cho user mutations.
- [ ] Backend permission tests cho Sales/Warehouse/Admin/Root Admin.
- [ ] CSRF/cookie session theo approved architecture.

## 4. Quyet dinh kien truc

Tai lieu phe duyet:

- Frontend: Next.js + TypeScript.
- Backend: NestJS + TypeScript.
- Database: PostgreSQL.
- Session store: Redis uu tien.
- Object storage: S3-compatible.
- Docker/Docker Compose.
- OpenAPI 3.x la API contract.

Quyet dinh da duoc chap thuan ngay 2026-07-29: tiep tuc voi Supabase.

- Supabase Auth thay cho authentication/session backend rieng.
- Supabase PostgreSQL + RLS la data va authorization layer.
- Supabase Edge Functions xu ly privileged server operations.
- Supabase Storage se dung cho images/charts.
- HTML/CSS/JavaScript prototype duoc tiep tuc; framework chi them khi co ly do.

Chi tiet va he qua bao mat nam tai `docs/DEC-001-SUPABASE-ARCHITECTURE.md`.

## 5. Lo trinh trien khai

## Phase 0 - Repository, environments va quality gates

### Chuc nang

- [ ] Chot monorepo structure.
- [ ] Dev, staging, production environments.
- [ ] Environment variables va secret management.
- [ ] Lint, typecheck, unit test, build pipeline.
- [ ] Migration runner va rollback strategy.
- [ ] Health endpoint va structured logging.
- [ ] Backup/restore procedure.

### Hoan thanh khi

- Moi schema change chay bang migration.
- Pull request gate: install, lint, typecheck, test, build, migration check, security scan.
- Khong secret nao nam trong browser source hoac Git.

## Phase 1 - Authentication, roles va Users

### Authentication

- [x] Login/logout.
- [x] Current profile.
- [x] Initial password va forced password change.
- [ ] Current user + effective permissions endpoint/service.
- [ ] Revoke current session va revoke all sessions.
- [ ] 8-hour idle timeout; 7-day absolute timeout.
- [ ] Rate limit va generic invalid-credential response.
- [ ] Permission guard dung chung cho moi trang/action.

### User Management

- [x] Root Admin bootstrap: Duyen Luong.
- [x] Create Sales/Warehouse.
- [x] Enable/disable Sales/Warehouse.
- [x] Reset staff password.
- [ ] Root Admin create Admin.
- [ ] User detail page.
- [ ] Change role theo restriction.
- [ ] Lock/unlock tach biet active/inactive.
- [ ] Revoke sessions khi reset/lock/deactivate/change role.
- [ ] Immutable user activity logs.

### Acceptance gate

- Root Admin tao duoc Admin.
- Regular Admin tao Sales/Warehouse nhung khong tao Admin.
- Root Admin khong the bi lock, deactivate, downgrade.
- Permission duoc kiem tra o server/database.

## Phase 2 - Master Data va Product Core

### Tables

- [ ] categories.
- [ ] colors.
- [ ] sizes.
- [ ] products.
- [ ] activity_logs.

### Master Data

- [ ] Category list (3 category co dinh).
- [ ] Color create/update/activate/deactivate.
- [ ] Size create/update/activate/deactivate.

### Product lifecycle

- [ ] Product list/search/filter/sort/pagination.
- [ ] Create Draft.
- [ ] Edit Basic Information.
- [ ] Publish readiness.
- [ ] Publish, Unpublish, Archive, Restore.
- [ ] Duplicate Product thanh Draft.
- [ ] Optimistic version conflict.

### Publish blockers

- Product name, active category, description.
- >=1 image va dung 1 thumbnail.
- >=1 ACTIVE variant.
- Moi ACTIVE variant co valid unique SKU.
- Color/Size reference active.
- Slug valid va unique.

### Warnings only

- Missing fulfillment/cost/shipping.
- Missing size/color chart.
- Missing keywords/specifications.
- Variant out of stock.

## Phase 3 - Images, Specifications, Keywords va Charts

- [ ] Toi da 3 product images.
- [ ] JPG/PNG/WEBP, toi da 10 MB.
- [ ] Server validation/compression.
- [ ] Thumbnail, alt text, reorder, replace, delete.
- [ ] Specifications CRUD/bulk replace.
- [ ] Keywords read/replace.
- [ ] Mot Size Chart va mot Color Chart moi Product.
- [ ] Storage cleanup/compensation khi transaction loi.

## Phase 4 - Variants va Warehouse stock workflow

### Tables

- [ ] product_variants.

### Chuc nang

- [ ] Select Colors/Sizes.
- [ ] Generate missing Color x Size combinations, khong duplicate.
- [ ] SKU manual va case-insensitive unique.
- [ ] Variant ACTIVE/INACTIVE.
- [ ] Stock: IN_STOCK/OUT_OF_STOCK.
- [ ] Bulk stock status.
- [ ] Bulk SKU va bulk variant status cho Admin.
- [ ] Bao ve Published Product khi remove Color/Size.

### Permission gate

- Warehouse chi update stock status.
- Warehouse khong update SKU/variant status.

## Phase 5 - Fulfillment va role-filtered pricing

### Table

- [ ] product_size_fulfillment.

### Fields/chuc nang

- [ ] Product + Size identity.
- [ ] Weight gram.
- [ ] Base cost USD decimal.
- [ ] Shipping fields USD decimal.
- [ ] Single va bulk update.
- [ ] Global fulfillment list.
- [ ] Missing fulfillment chi warning khi Publish.

### Data leakage gate

- Sales xem/export pricing.
- Warehouse chi xem weight.
- Warehouse response/export khong chua cost, shipping, currency.

## Phase 6 - Excel Import/Export

- [ ] Approved templates.
- [ ] Upload import job.
- [ ] Validate.
- [ ] Preview.
- [ ] Confirm.
- [ ] Job status va row-level error report.
- [ ] Idempotency-Key cho confirm.
- [ ] Export theo role; Warehouse khong nhan pricing.
- [ ] Reuse cung domain rules voi UI/API.

## Phase 7 - Public Catalog

- [ ] Chi PUBLISHED products.
- [ ] Chi ACTIVE variants.
- [ ] Public SKU va stock status.
- [ ] Khong lo internal price/shipping/weight/activity/user/version metadata.
- [ ] Search name, keyword, SKU theo specification.
- [ ] Product detail bang slug.
- [ ] Public categories.
- [ ] Cache va invalidation ngay sau publish/unpublish/archive.
- [ ] Responsive, accessible loading/empty/error states.

## Phase 8 - Activity Logs, security, testing va deployment

### Activity Logs

- [ ] Immutable.
- [ ] Actor, action, entity, before/after/context, timestamp.
- [ ] Representative actions: create/update/publish/archive product,
  stock update, import, create user, change role, set password, lock/unlock.

### Security

- [ ] AuthZ tests cho moi role.
- [ ] CSRF protection cho mutations neu dung cookie session.
- [ ] CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy.
- [ ] File validation.
- [ ] Rate limiting.
- [ ] Khong log password/token/secret.
- [ ] Security scan va role data-leak tests.

### Testing

- [ ] Unit: business rules, validation, permission filtering.
- [ ] Integration: API + DB + sessions + storage.
- [ ] E2E: full workflows tren staging.
- [ ] Conflict tests cho concurrent Product/Variant edits.
- [ ] Smoke tests sau deploy.

### Deployment

- [ ] Staging.
- [ ] Production.
- [ ] Backup truoc migration.
- [ ] Health check va rollback.
- [ ] Monitoring, logs va alerts.

## 6. Database target

Theo specification, migration target gom:

1. roles
2. users
3. activity_logs
4. categories
5. products
6. colors
7. sizes
8. product_variants
9. product_size_fulfillment
10. product_images
11. product_specifications
12. product_keywords
13. product_size_charts
14. product_color_charts
15. indexes_and_constraints
16. seed_master_data

Supabase `auth.users` co the thay the mot phan bang users neu kien truc Supabase
duoc chap thuan, nhung van can `profiles`, roles/flags, session revocation,
activity logs va permission policies.

## 7. Route target

- `/admin/login`
- `/admin/dashboard`
- `/admin/products`
- `/admin/products/new`
- `/admin/products/{id}`
- `/admin/products/{id}/edit`
- `/admin/products/{id}/preview`
- `/admin/variants`
- `/admin/fulfillment`
- `/admin/catalog/colors`
- `/admin/catalog/sizes`
- `/admin/catalog/categories`
- `/admin/import`
- `/admin/export`
- `/admin/users`
- `/admin/users/{id}`
- `/admin/activity-logs`

Prototype hien tai dung file `.html`; route mapping se duoc chuyen khi chot kien truc.

## 8. Thu tu lam viec tu bay gio

1. Hoan tat Phase 1 acceptance: user roles, Root Admin protection, session
   revocation, audit logs, auth tests.
2. Lap va chap thuan architecture DEC.
3. Tao schema/migration Phase 2.
4. Lam Master Data truoc Product Core.
5. Hoan tat Product lifecycle truoc images/variants/fulfillment.
6. Chi lam Import/Export sau khi domain rules on dinh.
7. Lam Public Catalog tu public-shaped API, khong doc truc tiep internal fields.
8. Cuoi cung moi hardening, staging, production.

## 9. Quy tac cap nhat file

- Chuyen `[ ]` thanh `[x]` chi sau khi acceptance/test tuong ung dat.
- Moi thay doi khac specification phai co DEC rieng.
- Moi schema change phai co migration.
- Moi endpoint/function phai ghi role duoc phep.
- Moi mutation quan trong phai ghi Activity Log.
- Khong bat dau phase sau neu acceptance gate phase truoc chua dat.
