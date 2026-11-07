// Application-level ACL for /rest/v1 — replaces Supabase RLS for the HTTP shim.

import type { RestActor } from "./rest-auth";

export type RestMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type AclDecision =
  | { allow: true; forceEq?: Record<string, string> }
  | { allow: false; status: number; message: string };

/** Catalog / CMS tables readable by anyone with the anon client. */
export const PUBLIC_READ = new Set([
  "products",
  "categories",
  "product_images",
  "product_variants",
  "banners",
  "store_modules",
  "cms_content",
  "site_settings",
  "reviews",
  "blog_posts",
  // coupons: staff-only — codes must not be enumerable by anon clients
  "pages",
  "navigation_menus",
  "navigation_items",
  "store_settings",
]);

/**
 * Tables guests may INSERT. Orders and order items are created only by the
 * server-side checkout (/api/storefront/checkout) and the admin POS, so they
 * are deliberately NOT listed here — a public insert would let anyone attach
 * arbitrary lines/prices to any order.
 */
const PUBLIC_INSERT = new Set([
  "reviews",
  "return_requests",
  "return_items",
  "support_tickets",
  "contact_submissions",
]);

/** Tables where INSERT requires a signed-in customer (rows are bound to their user id). */
const AUTH_INSERT = new Set(["reviews", "return_requests", "return_items", "addresses", "wishlist_items", "cart_items"]);

/** Authenticated GET: table → column forced to actor.userId. */
const USER_SCOPED_GET: Record<string, string> = {
  profiles: "id",
  orders: "user_id",
  support_tickets: "user_id",
  addresses: "user_id",
  wishlist_items: "user_id",
  cart_items: "user_id",
  notifications: "user_id",
  return_requests: "user_id",
};

/** Authenticated PATCH / DELETE: table → ownership column. */
const USER_SCOPED_WRITE: Record<string, string> = {
  profiles: "id",
  support_tickets: "user_id",
  addresses: "user_id",
  wishlist_items: "user_id",
  cart_items: "user_id",
  notifications: "user_id",
};

/** Columns a non-staff caller may never set or change, per table. */
const PROTECTED_COLUMNS: Record<string, string[]> = {
  profiles: ["role", "email", "id"],
  reviews: ["status", "verified_purchase", "helpful_votes", "user_id", "id", "created_at", "updated_at"],
  support_tickets: ["status", "priority", "assigned_to", "user_id", "id", "ticket_number", "created_at", "updated_at"],
  return_requests: ["status", "refund_amount", "refund_method", "admin_notes", "user_id", "id", "created_at", "updated_at"],
  return_items: ["id", "created_at"],
  contact_submissions: ["id", "status", "created_at"],
  addresses: ["user_id", "id", "created_at", "updated_at"],
  wishlist_items: ["user_id", "id", "created_at"],
  cart_items: ["user_id", "id", "created_at", "updated_at"],
  notifications: ["user_id", "id", "type", "title", "message", "data", "created_at"],
};

/** Embedded (joined) tables a non-staff caller may read through a public/owned root. */
const PUBLIC_EMBED = new Set([
  ...PUBLIC_READ,
  "review_images",
]);

/** RPCs callable without staff privileges. (Checkout runs server-side, so none today.) */
const PUBLIC_RPC = new Set<string>([]);

/** RPCs reserved for admin/staff/service_role. */
const STAFF_RPC = new Set([
  "mark_order_paid",
  "apply_order_payment",
  "update_customer_stats",
  "reduce_stock_on_order",
  "get_all_customer_emails",
  "get_all_customer_phones",
  "is_admin_or_staff",
  "upsert_customer_from_order",
]);

function deny(message: string, status = 403): AclDecision {
  return { allow: false, status, message };
}

function allow(forceEq?: Record<string, string>): AclDecision {
  return forceEq ? { allow: true, forceEq } : { allow: true };
}

export function authorizeRestTable(
  actor: RestActor,
  table: string,
  method: RestMethod
): AclDecision {
  const t = table.toLowerCase();

  // Supplier costs are admin-only, even for staff accounts, so margins never leak.
  if (t === "product_costs" && !actor.isServiceRole && actor.role !== "admin") {
    return deny("Admin access required");
  }

  if (actor.isServiceRole || actor.isStaff) {
    return allow();
  }

  if (method === "GET") {
    if (PUBLIC_READ.has(t)) return allow();

    const scopeCol = USER_SCOPED_GET[t];
    if (scopeCol) {
      if (!actor.userId) return deny("Authentication required", 401);
      return allow({ [scopeCol]: actor.userId });
    }

    if (t === "customers") {
      return deny("Admin access required");
    }

    if (t === "order_items") {
      // Direct listing blocked — access via orders embed after ownership filter.
      return deny("Direct order_items access is restricted");
    }

    // Default deny unknown tables
    return deny(`Access to table '${t}' is restricted`);
  }

  if (method === "POST") {
    if (AUTH_INSERT.has(t)) {
      if (!actor.userId) return deny("Authentication required", 401);
      return allow();
    }
    if (PUBLIC_INSERT.has(t)) return allow();
    if (t === "profiles" && actor.userId) return allow();
    return deny(`Insert on '${t}' is not allowed`);
  }

  if (method === "PATCH" || method === "PUT") {
    const scopeCol = USER_SCOPED_WRITE[t];
    if (scopeCol) {
      if (!actor.userId) return deny("Authentication required", 401);
      return allow({ [scopeCol]: actor.userId });
    }
    if (t === "orders") {
      // Customers may not freely patch orders (payment status etc.)
      return deny("Order updates require admin access");
    }
    return deny(`Update on '${t}' is not allowed`);
  }

  if (method === "DELETE") {
    if (t === "profiles") return deny("Delete on 'profiles' is not allowed");
    const scopeCol = USER_SCOPED_WRITE[t];
    if (scopeCol) {
      if (!actor.userId) return deny("Authentication required", 401);
      return allow({ [scopeCol]: actor.userId });
    }
    return deny(`Delete on '${t}' is not allowed`);
  }

  return deny("Method not allowed", 405);
}

/**
 * Strip columns a non-staff caller may not control and pin ownership columns
 * to the caller. Returns the sanitized row.
 */
export function sanitizeWriteRow(
  actor: RestActor,
  table: string,
  row: Record<string, unknown>,
  method: "POST" | "PATCH"
): Record<string, unknown> {
  if (actor.isServiceRole || actor.isStaff) return row;
  const t = table.toLowerCase();
  const out: Record<string, unknown> = { ...row };
  for (const col of PROTECTED_COLUMNS[t] || []) {
    delete out[col];
  }
  // Generic guard rails for anything we did not list explicitly.
  delete out.role;
  delete out.payment_status;
  delete out.total;

  if (method === "POST") {
    if (t === "profiles") {
      out.id = actor.userId;
      out.role = "customer";
      if (actor.email) out.email = actor.email;
    }
    if (t === "reviews") {
      out.user_id = actor.userId;
      out.status = "pending";
      out.helpful_votes = 0;
    }
    if (t === "support_tickets" || t === "return_requests" || t === "addresses" || t === "wishlist_items" || t === "cart_items") {
      out.user_id = actor.userId || null;
    }
    if (t === "support_tickets") {
      out.status = "open";
      out.priority = "medium";
      if (!out.email && actor.email) out.email = actor.email;
    }
    if (t === "return_requests") {
      out.status = "pending";
    }
  }
  return out;
}

/**
 * Validate the `select` string of a non-staff GET so embeds cannot be used to
 * walk from a public table into private ones (e.g. products → order_items → orders).
 */
export function authorizeEmbeds(
  actor: RestActor,
  rootTable: string,
  select: string | null
): AclDecision {
  if (actor.isServiceRole || actor.isStaff) return allow();
  if (!select) return allow();
  const root = rootTable.toLowerCase();
  const re = /([a-z_][a-z0-9_]*)(?:![a-z0-9_]+)?\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(select))) {
    const raw = m[1].toLowerCase();
    // alias:table(...) — the regex captures the part right before "(" which is
    // the table (or fk column) name; aliases are split off by the ':'.
    const name = raw.split(":").pop() as string;
    if (name === "and" || name === "or" || name === "not") continue;
    if (PUBLIC_EMBED.has(name)) continue;
    // fk-column form, e.g. category:category_id(...) → resolves to categories
    if (name === "category_id" || name === "product_id" || name === "variant_id" || name === "parent_id") continue;
    if (name === "order_items" && (root === "orders" || root === "return_requests") && actor.userId) continue;
    if (name === "orders" && root === "return_requests" && actor.userId) continue;
    if (name === "support_messages" && root === "support_tickets" && actor.userId) continue;
    return deny(`Embedding '${name}' is not allowed`);
  }
  return allow();
}

export function authorizeRpc(actor: RestActor, fn: string): AclDecision {
  const name = fn.toLowerCase();
  if (actor.isServiceRole || actor.isStaff) return allow();
  if (PUBLIC_RPC.has(name)) return allow();
  if (STAFF_RPC.has(name)) return deny(`RPC '${name}' requires admin access`);
  return deny(`RPC '${name}' is not allowed`);
}

export function authorizeStorageWrite(actor: RestActor): AclDecision {
  if (actor.isServiceRole || actor.isStaff) return allow();
  return deny("Storage uploads require admin access");
}
