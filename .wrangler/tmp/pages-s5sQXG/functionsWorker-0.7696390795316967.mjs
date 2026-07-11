var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// lib/session.ts
var SESSION_DURATION_SECONDS = 8 * 60 * 60;
var SESSION_TOKEN_BYTES = 32;
var SESSION_COOKIE_NAME = "pc_tech_session";
function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(bytesToBase64Url, "bytesToBase64Url");
function generateSessionToken() {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(SESSION_TOKEN_BYTES));
  return bytesToBase64Url(tokenBytes);
}
__name(generateSessionToken, "generateSessionToken");
async function hashSessionToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return bytesToBase64Url(new Uint8Array(digest));
}
__name(hashSessionToken, "hashSessionToken");
function getSessionExpiry() {
  return new Date(Date.now() + SESSION_DURATION_SECONDS * 1e3).toISOString();
}
__name(getSessionExpiry, "getSessionExpiry");
function buildSessionCookie(token, secure = true) {
  const secureAttribute = secure ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${token}; HttpOnly${secureAttribute}; SameSite=Strict; Path=/; Max-Age=${SESSION_DURATION_SECONDS}`;
}
__name(buildSessionCookie, "buildSessionCookie");
function buildExpiredSessionCookie(secure = true) {
  const secureAttribute = secure ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=; HttpOnly${secureAttribute}; SameSite=Strict; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
__name(buildExpiredSessionCookie, "buildExpiredSessionCookie");
function parseCookieHeader(cookieHeader) {
  if (!cookieHeader) return {};
  try {
    const cookies = {};
    for (const cookiePart of cookieHeader.split(";")) {
      const separatorIndex = cookiePart.indexOf("=");
      if (separatorIndex < 0) continue;
      const name = decodeURIComponent(cookiePart.slice(0, separatorIndex).trim());
      const value = decodeURIComponent(cookiePart.slice(separatorIndex + 1).trim());
      if (!name || Object.prototype.hasOwnProperty.call(cookies, name)) return {};
      cookies[name] = value;
    }
    return cookies;
  } catch {
    return {};
  }
}
__name(parseCookieHeader, "parseCookieHeader");
function getSessionTokenFromRequest(request) {
  const token = parseCookieHeader(request.headers.get("Cookie"))[SESSION_COOKIE_NAME];
  return token || null;
}
__name(getSessionTokenFromRequest, "getSessionTokenFromRequest");

// api/auth/access/[roleId]/[menuKey].ts
var ALLOWED_MENU_KEYS = /* @__PURE__ */ new Set([
  "corrugated-box-price",
  "coc",
  "packing-slip",
  "coa",
  "admin-configurations"
]);
var PERMISSION_COLUMNS = {
  full: "can_full",
  view: "can_view",
  create: "can_create",
  edit: "can_edit",
  delete: "can_delete",
  approve: "can_approve"
};
function json(payload, status, headers) {
  return Response.json(payload, { status, headers });
}
__name(json, "json");
function authenticationRequired() {
  return json({ success: false, error: "Authentication required" }, 401);
}
__name(authenticationRequired, "authenticationRequired");
async function requireSuperadmin(context) {
  const sessionToken = getSessionTokenFromRequest(context.request);
  if (!sessionToken) return authenticationRequired();
  const tokenHash = await hashSessionToken(sessionToken);
  const session = await context.env.DB.prepare(
    `SELECT
      s.id AS session_id,
      s.expires_at AS session_expires_at,
      s.revoked_at AS session_revoked_at,
      s.session_version AS session_session_version,
      u.status AS user_status,
      u.session_version AS user_session_version,
      r.name AS role_name,
      r.is_active AS role_is_active
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    INNER JOIN roles r ON r.id = u.role_id
    WHERE s.token_hash = ?
    LIMIT 1`
  ).bind(tokenHash).first();
  if (!session) return authenticationRequired();
  const expiresAt = Date.parse(session.session_expires_at);
  if (session.session_revoked_at !== null || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || session.session_session_version !== session.user_session_version) {
    return authenticationRequired();
  }
  if (session.user_status !== "ACTIVE") {
    return json({ success: false, error: "User account is inactive" }, 403);
  }
  if (session.role_is_active !== 1) {
    return json({ success: false, error: "User role is inactive" }, 403);
  }
  if (session.role_name !== "SUPERADMIN") {
    return json({ success: false, error: "SUPERADMIN access required" }, 403);
  }
  await context.env.DB.prepare(
    "UPDATE sessions SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(session.session_id).run();
  return null;
}
__name(requireSuperadmin, "requireSuperadmin");
function mapPermission(row) {
  return {
    menuKey: row.menu_key,
    full: row.can_full === 1,
    view: row.can_view === 1,
    create: row.can_create === 1,
    edit: row.can_edit === 1,
    delete: row.can_delete === 1,
    approve: row.can_approve === 1
  };
}
__name(mapPermission, "mapPermission");
function isPermissionName(value) {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PERMISSION_COLUMNS, value);
}
__name(isPermissionName, "isPermissionName");
async function onRequest(context) {
  if (context.request.method !== "PATCH") {
    return json({ success: false, error: "Method not allowed" }, 405, { Allow: "PATCH" });
  }
  try {
    const authError = await requireSuperadmin(context);
    if (authError) return authError;
    const roleIdParam = Array.isArray(context.params.roleId) ? context.params.roleId[0] : context.params.roleId;
    const menuKeyParam = Array.isArray(context.params.menuKey) ? context.params.menuKey[0] : context.params.menuKey;
    const roleId = Number(roleIdParam);
    const menuKey = typeof menuKeyParam === "string" ? menuKeyParam : "";
    if (!Number.isInteger(roleId) || roleId <= 0) {
      return json({ success: false, error: "Role id is invalid" }, 400);
    }
    if (!ALLOWED_MENU_KEYS.has(menuKey)) {
      return json({ success: false, error: "Menu key is invalid" }, 400);
    }
    let body;
    try {
      const parsedBody = await context.request.json();
      body = parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody) ? parsedBody : {};
    } catch {
      return json({ success: false, error: "Request body must be valid JSON" }, 400);
    }
    if (typeof body.access !== "boolean") {
      if (!isPermissionName(body.permission)) {
        return json({ success: false, error: "Permission is invalid" }, 400);
      }
      if (typeof body.value !== "boolean") {
        return json({ success: false, error: "Permission value must be true or false" }, 400);
      }
    }
    const role = await context.env.DB.prepare(
      "SELECT id, name FROM roles WHERE id = ? LIMIT 1"
    ).bind(roleId).first();
    if (!role) {
      return json({ success: false, error: "Role not found" }, 404);
    }
    if (role.name === "SUPERADMIN" && (body.access === false || body.value === false)) {
      return json({ success: false, error: "SUPERADMIN access cannot be revoked" }, 400);
    }
    if (typeof body.access === "boolean") {
      const accessValue = body.access ? 1 : 0;
      const updated2 = await context.env.DB.prepare(
        `INSERT INTO role_menu_permissions (
          role_id,
          menu_key,
          can_full,
          can_view,
          can_create,
          can_edit,
          can_delete,
          can_approve,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(role_id, menu_key) DO UPDATE SET
          can_full = excluded.can_full,
          can_view = excluded.can_view,
          can_create = excluded.can_create,
          can_edit = excluded.can_edit,
          can_delete = excluded.can_delete,
          can_approve = excluded.can_approve,
          updated_at = CURRENT_TIMESTAMP
        RETURNING
          menu_key,
          can_full,
          can_view,
          can_create,
          can_edit,
          can_delete,
          can_approve`
      ).bind(
        roleId,
        menuKey,
        accessValue,
        accessValue,
        accessValue,
        accessValue,
        accessValue,
        accessValue
      ).first();
      if (!updated2) {
        throw new Error("Access update did not return a record");
      }
      return json({ success: true, access: mapPermission(updated2) }, 200);
    }
    const permission = body.permission;
    const column = PERMISSION_COLUMNS[permission];
    const permissionValue = body.value ? 1 : 0;
    const updated = await context.env.DB.prepare(
      `INSERT INTO role_menu_permissions (
        role_id,
        menu_key,
        ${column},
        created_at,
        updated_at
      ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(role_id, menu_key) DO UPDATE SET
        ${column} = excluded.${column},
        updated_at = CURRENT_TIMESTAMP
      RETURNING
        menu_key,
        can_full,
        can_view,
        can_create,
        can_edit,
        can_delete,
        can_approve`
    ).bind(roleId, menuKey, permissionValue).first();
    if (!updated) {
      throw new Error("Permission update did not return a record");
    }
    return json({ success: true, access: mapPermission(updated) }, 200);
  } catch {
    console.error("[admin-access-update] Unable to update access");
    return json({ success: false, error: "Unable to update access" }, 500);
  }
}
__name(onRequest, "onRequest");

// api/auth/roles/[id].ts
var ROLE_NAME_PATTERN = /^[A-Z][A-Z0-9_]{1,49}$/;
function json2(payload, status, headers) {
  return Response.json(payload, { status, headers });
}
__name(json2, "json");
function authenticationRequired2() {
  return json2({ success: false, error: "Authentication required" }, 401);
}
__name(authenticationRequired2, "authenticationRequired");
function mapRole(role) {
  return {
    id: role.id,
    name: role.name,
    description: role.description ?? "",
    status: role.is_active === 1 ? "ACTIVE" : "INACTIVE",
    createdAt: role.created_at,
    updatedAt: role.updated_at
  };
}
__name(mapRole, "mapRole");
async function requireSuperadmin2(context) {
  const sessionToken = getSessionTokenFromRequest(context.request);
  if (!sessionToken) return authenticationRequired2();
  const tokenHash = await hashSessionToken(sessionToken);
  const session = await context.env.DB.prepare(
    `SELECT
      s.id AS session_id,
      s.expires_at AS session_expires_at,
      s.revoked_at AS session_revoked_at,
      s.session_version AS session_session_version,
      u.status AS user_status,
      u.session_version AS user_session_version,
      r.name AS role_name,
      r.is_active AS role_is_active
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    INNER JOIN roles r ON r.id = u.role_id
    WHERE s.token_hash = ?
    LIMIT 1`
  ).bind(tokenHash).first();
  if (!session) return authenticationRequired2();
  const expiresAt = Date.parse(session.session_expires_at);
  if (session.session_revoked_at !== null || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || session.session_session_version !== session.user_session_version) {
    return authenticationRequired2();
  }
  if (session.user_status !== "ACTIVE") {
    return json2({ success: false, error: "User account is inactive" }, 403);
  }
  if (session.role_is_active !== 1) {
    return json2({ success: false, error: "User role is inactive" }, 403);
  }
  if (session.role_name !== "SUPERADMIN") {
    return json2({ success: false, error: "SUPERADMIN access required" }, 403);
  }
  await context.env.DB.prepare(
    "UPDATE sessions SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(session.session_id).run();
  return null;
}
__name(requireSuperadmin2, "requireSuperadmin");
async function onRequest2(context) {
  if (context.request.method !== "PATCH") {
    return json2({ success: false, error: "Method not allowed" }, 405, { Allow: "PATCH" });
  }
  try {
    const authError = await requireSuperadmin2(context);
    if (authError) return authError;
    const idParam = Array.isArray(context.params.id) ? context.params.id[0] : context.params.id;
    const roleId = Number(idParam);
    if (!Number.isInteger(roleId) || roleId <= 0) {
      return json2({ success: false, error: "Role id is invalid" }, 400);
    }
    let body;
    try {
      const parsedBody = await context.request.json();
      body = parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody) ? parsedBody : {};
    } catch {
      return json2({ success: false, error: "Request body must be valid JSON" }, 400);
    }
    const existingRole = await context.env.DB.prepare(
      "SELECT id, name, description, is_active, created_at, updated_at FROM roles WHERE id = ? LIMIT 1"
    ).bind(roleId).first();
    if (!existingRole) {
      return json2({ success: false, error: "Role not found" }, 404);
    }
    const nextName = typeof body.name === "string" ? body.name.trim().toUpperCase() : existingRole.name;
    const nextDescription = typeof body.description === "string" ? body.description.trim() : existingRole.description ?? "";
    const nextIsActive = typeof body.isActive === "boolean" ? body.isActive ? 1 : 0 : existingRole.is_active;
    if (!ROLE_NAME_PATTERN.test(nextName)) {
      return json2({
        success: false,
        error: "Role name must use uppercase letters, numbers or underscore and be at least 2 characters"
      }, 400);
    }
    if (nextDescription.length > 300) {
      return json2({ success: false, error: "Role description must be 300 characters or fewer" }, 400);
    }
    if (existingRole.name === "SUPERADMIN" && nextName !== "SUPERADMIN") {
      return json2({ success: false, error: "SUPERADMIN role cannot be renamed" }, 400);
    }
    if (existingRole.name === "SUPERADMIN" && nextIsActive !== 1) {
      return json2({ success: false, error: "SUPERADMIN role cannot be deactivated" }, 400);
    }
    const updatedRole = await context.env.DB.prepare(
      `UPDATE roles
      SET name = ?, description = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING id, name, description, is_active, created_at, updated_at`
    ).bind(nextName, nextDescription, nextIsActive, roleId).first();
    if (!updatedRole) {
      throw new Error("Role update did not return a record");
    }
    return json2({ success: true, role: mapRole(updatedRole) }, 200);
  } catch {
    console.error("[admin-role-update] Unable to update role");
    return json2({ success: false, error: "Unable to update role" }, 500);
  }
}
__name(onRequest2, "onRequest");

// api/auth/users/[id].ts
var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function json3(payload, status, headers) {
  return Response.json(payload, { status, headers });
}
__name(json3, "json");
function authenticationRequired3() {
  return json3({ success: false, error: "Authentication required" }, 401);
}
__name(authenticationRequired3, "authenticationRequired");
function mapUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role_name,
    status: user.status,
    sessionVersion: user.session_version,
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
}
__name(mapUser, "mapUser");
async function requireSuperadmin3(context) {
  const sessionToken = getSessionTokenFromRequest(context.request);
  if (!sessionToken) return authenticationRequired3();
  const tokenHash = await hashSessionToken(sessionToken);
  const session = await context.env.DB.prepare(
    `SELECT
      s.id AS session_id,
      s.expires_at AS session_expires_at,
      s.revoked_at AS session_revoked_at,
      s.session_version AS session_session_version,
      u.status AS user_status,
      u.session_version AS user_session_version,
      r.name AS role_name,
      r.is_active AS role_is_active
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    INNER JOIN roles r ON r.id = u.role_id
    WHERE s.token_hash = ?
    LIMIT 1`
  ).bind(tokenHash).first();
  if (!session) return authenticationRequired3();
  const expiresAt = Date.parse(session.session_expires_at);
  if (session.session_revoked_at !== null || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || session.session_session_version !== session.user_session_version) {
    return authenticationRequired3();
  }
  if (session.user_status !== "ACTIVE") {
    return json3({ success: false, error: "User account is inactive" }, 403);
  }
  if (session.role_is_active !== 1) {
    return json3({ success: false, error: "User role is inactive" }, 403);
  }
  if (session.role_name !== "SUPERADMIN") {
    return json3({ success: false, error: "SUPERADMIN access required" }, 403);
  }
  await context.env.DB.prepare(
    "UPDATE sessions SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(session.session_id).run();
  return null;
}
__name(requireSuperadmin3, "requireSuperadmin");
async function onRequest3(context) {
  if (context.request.method !== "PATCH") {
    return json3({ success: false, error: "Method not allowed" }, 405, { Allow: "PATCH" });
  }
  try {
    const authError = await requireSuperadmin3(context);
    if (authError) return authError;
    const idParam = Array.isArray(context.params.id) ? context.params.id[0] : context.params.id;
    const userId = Number(idParam);
    if (!Number.isInteger(userId) || userId <= 0) {
      return json3({ success: false, error: "User id is invalid" }, 400);
    }
    let body;
    try {
      const parsedBody = await context.request.json();
      body = parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody) ? parsedBody : {};
    } catch {
      return json3({ success: false, error: "Request body must be valid JSON" }, 400);
    }
    const existingUser = await context.env.DB.prepare(
      `SELECT
        u.id,
        u.email,
        u.full_name,
        u.role_id,
        r.name AS role_name,
        u.status,
        u.session_version,
        u.created_at,
        u.updated_at
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
      LIMIT 1`
    ).bind(userId).first();
    if (!existingUser) {
      return json3({ success: false, error: "User not found" }, 404);
    }
    const nextEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : existingUser.email;
    const nextFullName = typeof body.fullName === "string" ? body.fullName.trim() : existingUser.full_name;
    const nextRoleName = typeof body.role === "string" ? body.role.trim().toUpperCase() : existingUser.role_name;
    const nextStatus = typeof body.status === "string" ? body.status.trim().toUpperCase() : existingUser.status;
    if (!EMAIL_PATTERN.test(nextEmail)) {
      return json3({ success: false, error: "Email must be a valid email address" }, 400);
    }
    if (!nextFullName) {
      return json3({ success: false, error: "Full name is required" }, 400);
    }
    if (nextStatus !== "ACTIVE" && nextStatus !== "INACTIVE") {
      return json3({ success: false, error: "Status must be ACTIVE or INACTIVE" }, 400);
    }
    const nextRole = await context.env.DB.prepare(
      "SELECT id, name, is_active FROM roles WHERE name = ? LIMIT 1"
    ).bind(nextRoleName).first();
    if (!nextRole) {
      return json3({ success: false, error: "Role not found" }, 400);
    }
    if (nextRole.is_active !== 1) {
      return json3({ success: false, error: "Cannot assign an inactive role" }, 400);
    }
    if (existingUser.role_name === "SUPERADMIN" && nextStatus !== "ACTIVE") {
      return json3({ success: false, error: "SUPERADMIN user cannot be deactivated" }, 400);
    }
    if (existingUser.role_name === "SUPERADMIN" && nextRole.name !== "SUPERADMIN") {
      return json3({ success: false, error: "SUPERADMIN user role cannot be changed" }, 400);
    }
    const duplicateEmail = await context.env.DB.prepare(
      "SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1"
    ).bind(nextEmail, userId).first();
    if (duplicateEmail) {
      return json3({ success: false, error: "A user with this email already exists" }, 409);
    }
    const securityChanged = nextRole.id !== existingUser.role_id || nextStatus !== existingUser.status;
    const nextSessionVersion = securityChanged ? existingUser.session_version + 1 : existingUser.session_version;
    const updatedUser = await context.env.DB.prepare(
      `UPDATE users
      SET email = ?,
        full_name = ?,
        role_id = ?,
        status = ?,
        session_version = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING
        id,
        email,
        full_name,
        role_id,
        ? AS role_name,
        status,
        session_version,
        created_at,
        updated_at`
    ).bind(
      nextEmail,
      nextFullName,
      nextRole.id,
      nextStatus,
      nextSessionVersion,
      userId,
      nextRole.name
    ).first();
    if (!updatedUser) {
      throw new Error("User update did not return a record");
    }
    return json3({ success: true, user: mapUser(updatedUser) }, 200);
  } catch {
    console.error("[admin-user-update] Unable to update user");
    return json3({ success: false, error: "Unable to update user" }, 500);
  }
}
__name(onRequest3, "onRequest");

// api/auth/access.ts
function json4(payload, status, headers) {
  return Response.json(payload, { status, headers });
}
__name(json4, "json");
function authenticationRequired4() {
  return json4({ success: false, error: "Authentication required" }, 401);
}
__name(authenticationRequired4, "authenticationRequired");
async function requireSuperadmin4(context) {
  const sessionToken = getSessionTokenFromRequest(context.request);
  if (!sessionToken) return authenticationRequired4();
  const tokenHash = await hashSessionToken(sessionToken);
  const session = await context.env.DB.prepare(
    `SELECT
      s.id AS session_id,
      s.expires_at AS session_expires_at,
      s.revoked_at AS session_revoked_at,
      s.session_version AS session_session_version,
      u.status AS user_status,
      u.session_version AS user_session_version,
      r.name AS role_name,
      r.is_active AS role_is_active
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    INNER JOIN roles r ON r.id = u.role_id
    WHERE s.token_hash = ?
    LIMIT 1`
  ).bind(tokenHash).first();
  if (!session) return authenticationRequired4();
  const expiresAt = Date.parse(session.session_expires_at);
  if (session.session_revoked_at !== null || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || session.session_session_version !== session.user_session_version) {
    return authenticationRequired4();
  }
  if (session.user_status !== "ACTIVE") {
    return json4({ success: false, error: "User account is inactive" }, 403);
  }
  if (session.role_is_active !== 1) {
    return json4({ success: false, error: "User role is inactive" }, 403);
  }
  if (session.role_name !== "SUPERADMIN") {
    return json4({ success: false, error: "SUPERADMIN access required" }, 403);
  }
  await context.env.DB.prepare(
    "UPDATE sessions SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(session.session_id).run();
  return null;
}
__name(requireSuperadmin4, "requireSuperadmin");
function mapPermission2(row) {
  return {
    menuKey: row.menu_key,
    full: row.can_full === 1,
    view: row.can_view === 1,
    create: row.can_create === 1,
    edit: row.can_edit === 1,
    delete: row.can_delete === 1,
    approve: row.can_approve === 1
  };
}
__name(mapPermission2, "mapPermission");
async function onRequest4(context) {
  if (context.request.method !== "GET") {
    return json4({ success: false, error: "Method not allowed" }, 405, { Allow: "GET" });
  }
  try {
    const authError = await requireSuperadmin4(context);
    if (authError) return authError;
    const url = new URL(context.request.url);
    const roleId = Number(url.searchParams.get("role_id"));
    if (!Number.isInteger(roleId) || roleId <= 0) {
      return json4({ success: false, error: "Role id is required" }, 400);
    }
    const result = await context.env.DB.prepare(
      `SELECT
        menu_key,
        can_full,
        can_view,
        can_create,
        can_edit,
        can_delete,
        can_approve
      FROM role_menu_permissions
      WHERE role_id = ?
      ORDER BY menu_key ASC`
    ).bind(roleId).all();
    if (!result.success) {
      throw new Error("Access list query failed");
    }
    return json4({
      success: true,
      access: result.results.map(mapPermission2)
    }, 200);
  } catch {
    console.error("[admin-access] Unable to load access");
    return json4({ success: false, error: "Unable to load access" }, 500);
  }
}
__name(onRequest4, "onRequest");

// lib/password.ts
var PBKDF2_ITERATIONS = 1e5;
var SALT_BYTES = 16;
var HASH_BYTES = 32;
function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
__name(bytesToBase64, "bytesToBase64");
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: PBKDF2_ITERATIONS
    },
    passwordKey,
    HASH_BYTES * 8
  );
  return {
    hash: bytesToBase64(new Uint8Array(derivedBits)),
    salt: bytesToBase64(salt)
  };
}
__name(hashPassword, "hashPassword");
function base64ToBytes(value) {
  const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
  if (!value || value.length % 4 !== 0 || !base64Pattern.test(value)) {
    return null;
  }
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytesToBase64(bytes) === value ? bytes : null;
  } catch {
    return null;
  }
}
__name(base64ToBytes, "base64ToBytes");
function constantTimeEqual(left, right) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}
__name(constantTimeEqual, "constantTimeEqual");
async function verifyPassword(password, storedHash, storedSalt) {
  const expectedHash = base64ToBytes(storedHash);
  const salt = base64ToBytes(storedSalt);
  if (!expectedHash || expectedHash.length !== HASH_BYTES || !salt || salt.length !== SALT_BYTES) {
    return false;
  }
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: PBKDF2_ITERATIONS
    },
    passwordKey,
    HASH_BYTES * 8
  );
  return constantTimeEqual(new Uint8Array(derivedBits), expectedHash);
}
__name(verifyPassword, "verifyPassword");

// api/auth/bootstrap-superadmin.ts
var EMAIL_PATTERN2 = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var COMMON_PASSWORDS = /* @__PURE__ */ new Set([
  "1234567890",
  "password123",
  "qwerty12345",
  "letmein1234",
  "superadmin"
]);
function json5(payload, status) {
  return Response.json(payload, { status });
}
__name(json5, "json");
function secretsMatch(submitted, expected) {
  if (!submitted || !expected) return false;
  const submittedBytes = new TextEncoder().encode(submitted);
  const expectedBytes = new TextEncoder().encode(expected);
  let difference = submittedBytes.length ^ expectedBytes.length;
  const length = Math.max(submittedBytes.length, expectedBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (submittedBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
  }
  return difference === 0;
}
__name(secretsMatch, "secretsMatch");
function validatePassword(password) {
  if (password.length < 10) return "Password must be at least 10 characters";
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return "Password is too weak";
  const characterGroups = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/];
  const groupsPresent = characterGroups.filter((pattern) => pattern.test(password)).length;
  return groupsPresent >= 2 ? null : "Password must include characters from at least two of these groups: lowercase, uppercase, numbers, symbols";
}
__name(validatePassword, "validatePassword");
async function onRequest5(context) {
  if (context.request.method !== "POST") {
    return json5({ success: false, error: "Method not allowed" }, 405);
  }
  const submittedSecret = context.request.headers.get("X-Bootstrap-Secret");
  if (!secretsMatch(submittedSecret, context.env.BOOTSTRAP_SECRET)) {
    return json5({ success: false, error: "Forbidden" }, 403);
  }
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json5({ success: false, error: "Request body must be valid JSON" }, 400);
  }
  const errors = {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email) errors.email = "Email is required";
  else if (!EMAIL_PATTERN2.test(email)) errors.email = "Email must be a valid email address";
  if (!fullName) errors.fullName = "Full name is required";
  if (!password) errors.password = "Password is required";
  else {
    const passwordError = validatePassword(password);
    if (passwordError) errors.password = passwordError;
  }
  if (Object.keys(errors).length > 0) {
    return json5({ success: false, error: "Validation failed", details: errors }, 400);
  }
  try {
    const role = await context.env.DB.prepare(
      "SELECT id FROM roles WHERE name = 'SUPERADMIN' AND is_active = 1 LIMIT 1"
    ).first();
    if (!role) {
      return json5({ success: false, error: "Active SUPERADMIN role not found" }, 500);
    }
    const existingSuperadmin = await context.env.DB.prepare(
      "SELECT u.id FROM users u WHERE u.role_id = ? LIMIT 1"
    ).bind(role.id).first();
    if (existingSuperadmin) {
      return json5({ success: false, error: "A SUPERADMIN user already exists" }, 409);
    }
    const existingEmail = await context.env.DB.prepare(
      "SELECT id FROM users WHERE email = ? LIMIT 1"
    ).bind(email).first();
    if (existingEmail) {
      return json5({ success: false, error: "A user with this email already exists" }, 409);
    }
    const passwordData = await hashPassword(password);
    const user = await context.env.DB.prepare(
      `INSERT INTO users (
        email, full_name, password_hash, password_salt, role_id, status,
        session_version, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', 1, NULL, NULL)
      RETURNING id, email, full_name, status`
    ).bind(email, fullName, passwordData.hash, passwordData.salt, role.id).first();
    if (!user) throw new Error("User insert did not return a record");
    return json5({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: "SUPERADMIN",
        status: user.status
      }
    }, 201);
  } catch (error) {
    console.error("[bootstrap-superadmin] database operation failed", {
      message: error instanceof Error ? error.message : "Unknown database error"
    });
    return json5({ success: false, error: "Unable to create SUPERADMIN user" }, 500);
  }
}
__name(onRequest5, "onRequest");

// api/auth/login.ts
var EMAIL_PATTERN3 = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var INVALID_CREDENTIALS_MESSAGE = "Invalid email or password";
var DUMMY_HASH = "YBXf2d6MiFk522BmWn2oK1TWvXg7xlou/L+HtiRO75I=";
var DUMMY_SALT = "xGw6kBbLDs2oEL9GDm37Yw==";
function json6(payload, status, headers) {
  return Response.json(payload, { status, headers });
}
__name(json6, "json");
async function onRequest6(context) {
  if (context.request.method !== "POST") {
    return json6({ success: false, error: "Method not allowed" }, 405, { Allow: "POST" });
  }
  let body;
  try {
    const parsedBody = await context.request.json();
    body = parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody) ? parsedBody : {};
  } catch {
    return json6({ success: false, error: "Request body must be valid JSON" }, 400);
  }
  const errors = {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email) errors.email = "Email is required";
  else if (!EMAIL_PATTERN3.test(email)) errors.email = "Email must be a valid email address";
  if (!password) errors.password = "Password is required";
  if (Object.keys(errors).length > 0) {
    return json6({ success: false, error: "Validation failed", details: errors }, 400);
  }
  try {
    const user = await context.env.DB.prepare(
      `SELECT
        u.id,
        u.email,
        u.full_name,
        u.password_hash,
        u.password_salt,
        r.name AS role_name,
        u.status AS user_status,
        r.is_active AS role_is_active,
        u.session_version
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      WHERE u.email = ?
      LIMIT 1`
    ).bind(email).first();
    if (!user) {
      await verifyPassword(password, DUMMY_HASH, DUMMY_SALT);
      return json6({ success: false, error: INVALID_CREDENTIALS_MESSAGE }, 401);
    }
    const passwordMatches = await verifyPassword(password, user.password_hash, user.password_salt);
    if (!passwordMatches) {
      return json6({ success: false, error: INVALID_CREDENTIALS_MESSAGE }, 401);
    }
    if (user.user_status !== "ACTIVE") {
      return json6({ success: false, error: "User account is inactive" }, 403);
    }
    if (user.role_is_active !== 1) {
      return json6({ success: false, error: "User role is inactive" }, 403);
    }
    let sessionCookie;
    try {
      const sessionToken = generateSessionToken();
      const tokenHash = await hashSessionToken(sessionToken);
      const sessionResult = await context.env.DB.prepare(
        `INSERT INTO sessions (
          user_id, token_hash, session_version, expires_at, last_used_at, revoked_at
        ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)`
      ).bind(user.id, tokenHash, user.session_version, getSessionExpiry()).run();
      if (!sessionResult.success) throw new Error("Session insert failed");
      sessionCookie = buildSessionCookie(sessionToken, new URL(context.request.url).protocol === "https:");
    } catch {
      console.error("[d1-login] Session creation failed");
      return json6({ success: false, error: "Unable to create session" }, 500);
    }
    return json6({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role_name,
        status: user.user_status,
        sessionVersion: user.session_version
      }
    }, 200, { "Set-Cookie": sessionCookie });
  } catch {
    console.error("[d1-login] Unexpected authentication error");
    return json6({ success: false, error: "Unable to authenticate" }, 500);
  }
}
__name(onRequest6, "onRequest");

// api/auth/logout.ts
function json7(payload, status, headers) {
  return Response.json(payload, { status, headers });
}
__name(json7, "json");
async function onRequest7(context) {
  if (context.request.method !== "POST") {
    return json7({ success: false, error: "Method not allowed" }, 405, { Allow: "POST" });
  }
  const isSecureRequest = new URL(context.request.url).protocol === "https:";
  const headers = {
    "Set-Cookie": buildExpiredSessionCookie(isSecureRequest)
  };
  try {
    const sessionToken = getSessionTokenFromRequest(context.request);
    if (sessionToken) {
      const tokenHash = await hashSessionToken(sessionToken);
      await context.env.DB.prepare(
        "UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND revoked_at IS NULL"
      ).bind(tokenHash).run();
    }
    return json7({ success: true }, 200, headers);
  } catch {
    console.error("[logout] Unable to revoke session");
    return json7({ success: false, error: "Unable to logout" }, 500, headers);
  }
}
__name(onRequest7, "onRequest");

// api/auth/me.ts
var AUTHENTICATION_REQUIRED = "Authentication required";
function json8(payload, status, headers) {
  return Response.json(payload, { status, headers });
}
__name(json8, "json");
function authenticationRequired5() {
  return json8({ success: false, error: AUTHENTICATION_REQUIRED }, 401);
}
__name(authenticationRequired5, "authenticationRequired");
async function onRequest8(context) {
  if (context.request.method !== "GET") {
    return json8({ success: false, error: "Method not allowed" }, 405, { Allow: "GET" });
  }
  const sessionToken = getSessionTokenFromRequest(context.request);
  if (!sessionToken) return authenticationRequired5();
  try {
    const tokenHash = await hashSessionToken(sessionToken);
    const session = await context.env.DB.prepare(
      `SELECT
        s.id AS session_id,
        s.expires_at AS session_expires_at,
        s.revoked_at AS session_revoked_at,
        s.session_version AS session_session_version,
        u.id AS user_id,
        u.email AS user_email,
        u.full_name AS user_full_name,
        u.status AS user_status,
        u.session_version AS user_session_version,
        r.name AS role_name,
        r.is_active AS role_is_active
      FROM sessions s
      INNER JOIN users u ON u.id = s.user_id
      INNER JOIN roles r ON r.id = u.role_id
      WHERE s.token_hash = ?
      LIMIT 1`
    ).bind(tokenHash).first();
    if (!session) return authenticationRequired5();
    const expiresAt = Date.parse(session.session_expires_at);
    if (session.session_revoked_at !== null || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || session.session_session_version !== session.user_session_version) {
      return authenticationRequired5();
    }
    if (session.user_status !== "ACTIVE") {
      return json8({ success: false, error: "User account is inactive" }, 403);
    }
    if (session.role_is_active !== 1) {
      return json8({ success: false, error: "User role is inactive" }, 403);
    }
    const updateResult = await context.env.DB.prepare(
      "UPDATE sessions SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(session.session_id).run();
    if (!updateResult.success || updateResult.meta.changes !== 1) {
      throw new Error("Session last-used update failed");
    }
    return json8({
      success: true,
      user: {
        id: session.user_id,
        email: session.user_email,
        fullName: session.user_full_name,
        role: session.role_name,
        status: session.user_status
      }
    }, 200);
  } catch {
    console.error("[current-user] Unexpected session validation error");
    return json8({ success: false, error: "Unable to validate session" }, 500);
  }
}
__name(onRequest8, "onRequest");

// api/auth/roles.ts
function json9(payload, status, headers) {
  return Response.json(payload, { status, headers });
}
__name(json9, "json");
function authenticationRequired6() {
  return json9({ success: false, error: "Authentication required" }, 401);
}
__name(authenticationRequired6, "authenticationRequired");
async function requireSuperadmin5(context) {
  const sessionToken = getSessionTokenFromRequest(context.request);
  if (!sessionToken) return authenticationRequired6();
  const tokenHash = await hashSessionToken(sessionToken);
  const session = await context.env.DB.prepare(
    `SELECT
      s.id AS session_id,
      s.expires_at AS session_expires_at,
      s.revoked_at AS session_revoked_at,
      s.session_version AS session_session_version,
      u.status AS user_status,
      u.session_version AS user_session_version,
      r.name AS role_name,
      r.is_active AS role_is_active
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    INNER JOIN roles r ON r.id = u.role_id
    WHERE s.token_hash = ?
    LIMIT 1`
  ).bind(tokenHash).first();
  if (!session) return authenticationRequired6();
  const expiresAt = Date.parse(session.session_expires_at);
  if (session.session_revoked_at !== null || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || session.session_session_version !== session.user_session_version) {
    return authenticationRequired6();
  }
  if (session.user_status !== "ACTIVE") {
    return json9({ success: false, error: "User account is inactive" }, 403);
  }
  if (session.role_is_active !== 1) {
    return json9({ success: false, error: "User role is inactive" }, 403);
  }
  if (session.role_name !== "SUPERADMIN") {
    return json9({ success: false, error: "SUPERADMIN access required" }, 403);
  }
  await context.env.DB.prepare(
    "UPDATE sessions SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(session.session_id).run();
  return null;
}
__name(requireSuperadmin5, "requireSuperadmin");
async function onRequest9(context) {
  if (context.request.method !== "GET") {
    return json9({ success: false, error: "Method not allowed" }, 405, { Allow: "GET" });
  }
  try {
    const authError = await requireSuperadmin5(context);
    if (authError) return authError;
    const result = await context.env.DB.prepare(
      `SELECT
        id,
        name,
        description,
        is_active,
        created_at,
        updated_at
      FROM roles
      ORDER BY id ASC`
    ).all();
    if (!result.success) {
      throw new Error("Role list query failed");
    }
    return json9({
      success: true,
      roles: result.results.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description ?? "",
        status: role.is_active === 1 ? "ACTIVE" : "INACTIVE",
        createdAt: role.created_at,
        updatedAt: role.updated_at
      }))
    }, 200);
  } catch {
    console.error("[admin-roles] Unable to load roles");
    return json9({ success: false, error: "Unable to load roles" }, 500);
  }
}
__name(onRequest9, "onRequest");

// api/auth/setup-password.ts
var COMMON_PASSWORDS2 = /* @__PURE__ */ new Set([
  "1234567890",
  "password123",
  "qwerty12345",
  "letmein1234",
  "superadmin"
]);
function json10(payload, status, headers) {
  return Response.json(payload, { status, headers });
}
__name(json10, "json");
function validatePassword2(password) {
  if (password.length < 10) return "Password must be at least 10 characters";
  if (COMMON_PASSWORDS2.has(password.toLowerCase())) return "Password is too weak";
  const characterGroups = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/];
  const groupsPresent = characterGroups.filter((pattern) => pattern.test(password)).length;
  return groupsPresent >= 2 ? null : "Password must include characters from at least two of these groups: lowercase, uppercase, numbers, symbols";
}
__name(validatePassword2, "validatePassword");
async function onRequest10(context) {
  if (context.request.method !== "POST") {
    return json10({ success: false, error: "Method not allowed" }, 405, { Allow: "POST" });
  }
  let body;
  try {
    const parsedBody = await context.request.json();
    body = parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody) ? parsedBody : {};
  } catch {
    return json10({ success: false, error: "Request body must be valid JSON" }, 400);
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!token) {
    return json10({ success: false, error: "Setup token is required" }, 400);
  }
  const passwordError = validatePassword2(password);
  if (passwordError) {
    return json10({ success: false, error: passwordError }, 400);
  }
  try {
    const tokenHash = await hashSessionToken(token);
    const setupToken = await context.env.DB.prepare(
      `SELECT
        pst.id,
        pst.user_id,
        pst.expires_at,
        pst.used_at,
        u.status AS user_status
      FROM password_setup_tokens pst
      INNER JOIN users u ON u.id = pst.user_id
      WHERE pst.token_hash = ?
      LIMIT 1`
    ).bind(tokenHash).first();
    if (!setupToken) {
      return json10({ success: false, error: "Password setup link is invalid" }, 400);
    }
    if (setupToken.used_at !== null) {
      return json10({ success: false, error: "Password setup link has already been used" }, 400);
    }
    const expiresAt = Date.parse(setupToken.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return json10({ success: false, error: "Password setup link has expired" }, 400);
    }
    if (setupToken.user_status === "ACTIVE") {
      return json10({ success: false, error: "Password has already been set" }, 400);
    }
    const passwordData = await hashPassword(password);
    const updateResult = await context.env.DB.prepare(
      `UPDATE users
      SET password_hash = ?,
        password_salt = ?,
        status = 'ACTIVE',
        session_version = session_version + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
    ).bind(passwordData.hash, passwordData.salt, setupToken.user_id).run();
    if (!updateResult.success || updateResult.meta.changes !== 1) {
      throw new Error("Password update failed");
    }
    await context.env.DB.prepare(
      "UPDATE password_setup_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(setupToken.id).run();
    return json10({ success: true }, 200);
  } catch {
    console.error("[setup-password] Unable to set password");
    return json10({ success: false, error: "Unable to set password" }, 500);
  }
}
__name(onRequest10, "onRequest");

// lib/email.ts
async function sendPasswordSetupEmail(env, input) {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    return { sent: false, reason: "Email provider is not configured" };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: "Set up your PC-Tech password",
      html: `
        <p>Hello ${input.fullName},</p>
        <p>Your PC-Tech account has been created. Use the link below to set your password.</p>
        <p><a href="${input.setupLink}">Set password</a></p>
        <p>This link expires in 24 hours.</p>
      `
    })
  });
  if (!response.ok) {
    return { sent: false, reason: `Email provider returned ${response.status}` };
  }
  return { sent: true };
}
__name(sendPasswordSetupEmail, "sendPasswordSetupEmail");

// api/auth/users.ts
var EMAIL_PATTERN4 = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var INVITE_DURATION_SECONDS = 24 * 60 * 60;
function json11(payload, status, headers) {
  return Response.json(payload, { status, headers });
}
__name(json11, "json");
function authenticationRequired7() {
  return json11({ success: false, error: "Authentication required" }, 401);
}
__name(authenticationRequired7, "authenticationRequired");
async function requireSuperadmin6(context) {
  const sessionToken = getSessionTokenFromRequest(context.request);
  if (!sessionToken) return authenticationRequired7();
  const tokenHash = await hashSessionToken(sessionToken);
  const session = await context.env.DB.prepare(
    `SELECT
      s.id AS session_id,
      s.expires_at AS session_expires_at,
      s.revoked_at AS session_revoked_at,
      s.session_version AS session_session_version,
      u.status AS user_status,
      u.session_version AS user_session_version,
      r.name AS role_name,
      r.is_active AS role_is_active
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    INNER JOIN roles r ON r.id = u.role_id
    WHERE s.token_hash = ?
    LIMIT 1`
  ).bind(tokenHash).first();
  if (!session) return authenticationRequired7();
  const expiresAt = Date.parse(session.session_expires_at);
  if (session.session_revoked_at !== null || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || session.session_session_version !== session.user_session_version) {
    return authenticationRequired7();
  }
  if (session.user_status !== "ACTIVE") {
    return json11({ success: false, error: "User account is inactive" }, 403);
  }
  if (session.role_is_active !== 1) {
    return json11({ success: false, error: "User role is inactive" }, 403);
  }
  if (session.role_name !== "SUPERADMIN") {
    return json11({ success: false, error: "SUPERADMIN access required" }, 403);
  }
  await context.env.DB.prepare(
    "UPDATE sessions SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(session.session_id).run();
  return null;
}
__name(requireSuperadmin6, "requireSuperadmin");
async function onRequest11(context) {
  if (context.request.method !== "GET" && context.request.method !== "POST") {
    return json11({ success: false, error: "Method not allowed" }, 405, { Allow: "GET, POST" });
  }
  try {
    const authError = await requireSuperadmin6(context);
    if (authError) return authError;
    if (context.request.method === "POST") {
      let body;
      try {
        const parsedBody = await context.request.json();
        body = parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody) ? parsedBody : {};
      } catch {
        return json11({ success: false, error: "Request body must be valid JSON" }, 400);
      }
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
      const roleName = typeof body.role === "string" ? body.role.trim().toUpperCase() : "";
      if (!EMAIL_PATTERN4.test(email)) {
        return json11({ success: false, error: "Email must be a valid email address" }, 400);
      }
      if (!fullName) {
        return json11({ success: false, error: "Name is required" }, 400);
      }
      const role = await context.env.DB.prepare(
        "SELECT id, name, is_active FROM roles WHERE name = ? LIMIT 1"
      ).bind(roleName).first();
      if (!role) {
        return json11({ success: false, error: "Role not found" }, 400);
      }
      if (role.is_active !== 1) {
        return json11({ success: false, error: "Cannot assign an inactive role" }, 400);
      }
      const existingEmail = await context.env.DB.prepare(
        "SELECT id FROM users WHERE email = ? LIMIT 1"
      ).bind(email).first();
      if (existingEmail) {
        return json11({ success: false, error: "A user with this email already exists" }, 409);
      }
      const user = await context.env.DB.prepare(
        `INSERT INTO users (
          email,
          full_name,
          password_hash,
          password_salt,
          role_id,
          status,
          session_version,
          created_by,
          updated_by
        ) VALUES (?, ?, 'PENDING_PASSWORD_HASH', 'PENDING_PASSWORD_SALT', ?, 'INACTIVE', 1, NULL, NULL)
        RETURNING id, email, full_name, status, session_version, created_at, updated_at`
      ).bind(email, fullName, role.id).first();
      if (!user) {
        throw new Error("User insert did not return a record");
      }
      const setupToken = generateSessionToken();
      const setupTokenHash = await hashSessionToken(setupToken);
      const expiresAt = new Date(Date.now() + INVITE_DURATION_SECONDS * 1e3).toISOString();
      const setupLink = `${new URL(context.request.url).origin}/?setup_token=${encodeURIComponent(setupToken)}`;
      const tokenResult = await context.env.DB.prepare(
        `INSERT INTO password_setup_tokens (
          user_id,
          token_hash,
          expires_at
        ) VALUES (?, ?, ?)`
      ).bind(user.id, setupTokenHash, expiresAt).run();
      if (!tokenResult.success) {
        throw new Error("Password setup token insert failed");
      }
      const emailResult = await sendPasswordSetupEmail(context.env, {
        to: email,
        fullName,
        setupLink
      });
      return json11({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: role.name,
          status: user.status,
          sessionVersion: user.session_version,
          createdAt: user.created_at,
          updatedAt: user.updated_at
        },
        invite: {
          emailSent: emailResult.sent,
          setupLink: emailResult.sent ? void 0 : setupLink,
          message: emailResult.sent ? "Invite email sent" : emailResult.reason
        }
      }, 201);
    }
    const result = await context.env.DB.prepare(
      `SELECT
        u.id,
        u.email,
        u.full_name,
        r.name AS role_name,
        u.status,
        u.session_version,
        u.created_at,
        u.updated_at
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      ORDER BY u.created_at DESC, u.id DESC`
    ).all();
    if (!result.success) {
      throw new Error("User list query failed");
    }
    return json11({
      success: true,
      users: result.results.map((user) => ({
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role_name,
        status: user.status,
        sessionVersion: user.session_version,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      }))
    }, 200);
  } catch {
    console.error("[admin-users] Unable to load users");
    return json11({ success: false, error: "Unable to load users" }, 500);
  }
}
__name(onRequest11, "onRequest");

// ../lib/zoho.ts
var ZOHO_REGION_URLS = {
  in: {
    tokenUrl: "https://accounts.zoho.in/oauth/v2/token",
    booksUrl: "https://www.zohoapis.in/books/v3"
  }
};
var ZohoRequestError = class extends Error {
  static {
    __name(this, "ZohoRequestError");
  }
  status;
  code;
  constructor(message, details) {
    super(message);
    this.name = "ZohoRequestError";
    this.status = details.status;
    this.code = details.code;
  }
};
var getEnv = /* @__PURE__ */ __name((name, env) => {
  const configuredValue = env?.[name]?.trim();
  if (configuredValue) {
    return configuredValue;
  }
  const runtimeEnv = globalThis.process?.env;
  const runtimeValue = runtimeEnv?.[name]?.trim();
  if (runtimeValue) {
    return runtimeValue;
  }
  const globalEnv = globalThis.env;
  return globalEnv?.[name]?.trim();
}, "getEnv");
var getZohoRegion = /* @__PURE__ */ __name((env) => getEnv("ZOHO_REGION", env)?.toLowerCase() || "in", "getZohoRegion");
var getZohoUrls = /* @__PURE__ */ __name((env) => {
  const region = getZohoRegion(env);
  return ZOHO_REGION_URLS[region] ?? ZOHO_REGION_URLS.in;
}, "getZohoUrls");
var logZohoDiagnostic = /* @__PURE__ */ __name((message, details) => {
  console.info("[zoho]", message, details);
}, "logZohoDiagnostic");
var isZohoOrgIdNumeric = /* @__PURE__ */ __name((env) => /^\d+$/.test(getEnv("ZOHO_ORG_ID", env) ?? ""), "isZohoOrgIdNumeric");
var getRawEnv = /* @__PURE__ */ __name((name, env) => {
  if (env?.[name]) {
    return env[name];
  }
  const runtimeEnv = globalThis.process?.env;
  if (runtimeEnv?.[name]) {
    return runtimeEnv[name];
  }
  const globalEnv = globalThis.env;
  return globalEnv?.[name];
}, "getRawEnv");
var logTokenRequestDiagnostic = /* @__PURE__ */ __name((tokenUrl, body, env) => {
  const rawRefreshToken = getRawEnv("ZOHO_REFRESH_TOKEN", env) ?? "";
  const trimmedRefreshToken = rawRefreshToken.trim();
  logZohoDiagnostic("access-token request prepared", {
    tokenEndpoint: tokenUrl,
    grantType: body.get("grant_type"),
    refreshTokenExists: trimmedRefreshToken.length > 0,
    refreshTokenLength: trimmedRefreshToken.length,
    refreshTokenStartsWith1000: trimmedRefreshToken.startsWith("1000."),
    refreshTokenTrimChangedLength: rawRefreshToken.length !== trimmedRefreshToken.length,
    requestBodyKeys: Array.from(body.keys())
  });
}, "logTokenRequestDiagnostic");
var cachedAccessToken = null;
var tokenExpiryTime = 0;
async function getAccessToken(env) {
  const clientId = getEnv("ZOHO_CLIENT_ID", env);
  const clientSecret = getEnv("ZOHO_CLIENT_SECRET", env);
  const refreshToken = getEnv("ZOHO_REFRESH_TOKEN", env);
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Zoho OAuth environment variables: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN");
  }
  if (cachedAccessToken && Date.now() < tokenExpiryTime) {
    logZohoDiagnostic("access-token request skipped; cached token is valid", {
      tokenEndpointHostname: new URL(getZohoUrls(env).tokenUrl).hostname,
      accessTokenRequestSucceeded: true,
      zohoOrgIdNumericOnly: isZohoOrgIdNumeric(env)
    });
    return cachedAccessToken;
  }
  const tokenUrl = getZohoUrls(env).tokenUrl;
  const body = new URLSearchParams();
  body.append("client_id", clientId);
  body.append("client_secret", clientSecret);
  body.append("refresh_token", refreshToken);
  body.append("grant_type", "refresh_token");
  logTokenRequestDiagnostic(tokenUrl, body, env);
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });
  const responseText = await response.text();
  let payload;
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    logZohoDiagnostic("access-token request failed", {
      tokenEndpointHostname: new URL(tokenUrl).hostname,
      accessTokenRequestSucceeded: false,
      zohoHttpStatus: response.status,
      zohoErrorCode: "invalid_json",
      zohoErrorMessage: "Zoho OAuth token response was not valid JSON",
      zohoOrgIdNumericOnly: isZohoOrgIdNumeric(env)
    });
    throw new ZohoRequestError(`Zoho OAuth token request failed (${response.status}): response was not valid JSON`, {
      status: response.status,
      code: "invalid_json",
      message: "Zoho OAuth token response was not valid JSON"
    });
  }
  if (!response.ok || !payload.access_token) {
    const details = getZohoOAuthErrorDetails(response.status, payload);
    logZohoDiagnostic("access-token request failed", {
      tokenEndpointHostname: new URL(tokenUrl).hostname,
      accessTokenRequestSucceeded: false,
      zohoHttpStatus: response.status,
      zohoErrorCode: details.code,
      zohoErrorMessage: details.message,
      zohoOrgIdNumericOnly: isZohoOrgIdNumeric(env)
    });
    throw new ZohoRequestError(formatZohoOAuthError(details), details);
  }
  logZohoDiagnostic("access-token request succeeded", {
    tokenEndpointHostname: new URL(tokenUrl).hostname,
    accessTokenRequestSucceeded: true,
    zohoHttpStatus: response.status,
    requiredScope: "ZohoBooks.contacts.READ",
    requiredScopePresent: typeof payload.scope === "string" ? payload.scope.split(/[,\s]+/).includes("ZohoBooks.contacts.READ") : null,
    zohoOrgIdNumericOnly: isZohoOrgIdNumeric(env)
  });
  cachedAccessToken = payload.access_token;
  tokenExpiryTime = Date.now() + ((payload.expires_in ?? 3600) * 1e3 - 6e4);
  return cachedAccessToken;
}
__name(getAccessToken, "getAccessToken");
async function zohoRequest(endpoint, env) {
  const normalizedEndpoint = endpoint.startsWith("http") ? endpoint : `${getZohoUrls(env).booksUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  const url = new URL(normalizedEndpoint);
  if (!url.searchParams.has("organization_id")) {
    const organizationId2 = getEnv("ZOHO_ORG_ID", env);
    if (organizationId2) {
      url.searchParams.set("organization_id", organizationId2);
    }
  }
  const organizationId = url.searchParams.get("organization_id") ?? "";
  logZohoDiagnostic("books request planned", {
    booksApiUrl: url.toString(),
    zohoOrgIdNumericOnly: /^\d+$/.test(organizationId)
  });
  const accessToken = await getAccessToken(env);
  logZohoDiagnostic("books request started", {
    booksApiUrl: url.toString(),
    zohoOrgIdNumericOnly: /^\d+$/.test(organizationId)
  });
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`
    }
  });
  const responseText = await response.text();
  let payload;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = responseText;
  }
  if (!response.ok) {
    const details = getZohoApiErrorDetails(response.status, payload);
    logZohoDiagnostic("books request failed", {
      booksApiUrl: url.toString(),
      zohoHttpStatus: response.status,
      zohoErrorCode: details.code,
      zohoErrorMessage: details.message,
      zohoOrgIdNumericOnly: /^\d+$/.test(organizationId)
    });
    throw new ZohoRequestError(`Zoho API request failed (${details.status}) for GET ${url.toString()}: ${details.code}: ${details.message}`, details);
  }
  logZohoDiagnostic("books request succeeded", {
    booksApiUrl: url.toString(),
    zohoHttpStatus: response.status,
    zohoOrgIdNumericOnly: /^\d+$/.test(organizationId)
  });
  return payload;
}
__name(zohoRequest, "zohoRequest");
async function zohoGet(endpoint, env) {
  return zohoRequest(endpoint, env);
}
__name(zohoGet, "zohoGet");
function formatZohoOAuthError(details) {
  return `Zoho OAuth token request failed (${details.status}): ${details.code}: ${details.message}`;
}
__name(formatZohoOAuthError, "formatZohoOAuthError");
function getZohoOAuthErrorDetails(status, payload) {
  const errorCode = payload.error || "unknown_error";
  const errorMessage = payload.error_description || payload.message || "Unable to obtain a Zoho access token";
  return {
    status,
    code: errorCode,
    message: errorMessage
  };
}
__name(getZohoOAuthErrorDetails, "getZohoOAuthErrorDetails");
function getZohoApiErrorDetails(status, payload) {
  return {
    status,
    code: extractErrorCode(payload),
    message: extractErrorMessage(payload)
  };
}
__name(getZohoApiErrorDetails, "getZohoApiErrorDetails");
function extractErrorCode(payload) {
  if (payload && typeof payload === "object") {
    const errorPayload = payload;
    if (typeof errorPayload.code === "string" || typeof errorPayload.code === "number") {
      return String(errorPayload.code);
    }
    if (typeof errorPayload.error === "string") {
      return errorPayload.error;
    }
  }
  return "unknown_error";
}
__name(extractErrorCode, "extractErrorCode");
function extractErrorMessage(payload) {
  if (typeof payload === "string") {
    return payload;
  }
  if (payload && typeof payload === "object") {
    const errorPayload = payload;
    if (typeof errorPayload.message === "string") {
      return errorPayload.message;
    }
    if (typeof errorPayload.error_description === "string") {
      return errorPayload.error_description;
    }
    if (typeof errorPayload.error === "string") {
      return errorPayload.error;
    }
    if (errorPayload.error && typeof errorPayload.error === "object" && typeof errorPayload.error.message === "string") {
      return errorPayload.error.message;
    }
  }
  return "Unknown Zoho API error";
}
__name(extractErrorMessage, "extractErrorMessage");

// ../lib/customers.ts
var CONTACTS_PER_PAGE = 200;
function buildContactsEndpoint(page) {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(CONTACTS_PER_PAGE)
  });
  return `/contacts?${params.toString()}`;
}
__name(buildContactsEndpoint, "buildContactsEndpoint");
function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}
__name(normalizeText, "normalizeText");
function isActiveCustomer(contact) {
  const contactType = normalizeText(contact.contact_type).toLowerCase();
  if (contactType && contactType !== "customer") {
    return false;
  }
  const status = normalizeText(contact.status).toLowerCase();
  if (status && status !== "active") {
    return false;
  }
  if (typeof contact.is_active === "boolean" && !contact.is_active) {
    return false;
  }
  if (typeof contact.active === "boolean" && !contact.active) {
    return false;
  }
  return true;
}
__name(isActiveCustomer, "isActiveCustomer");
function mapContactToCustomer(contact) {
  const customerId = contact.contact_id != null ? String(contact.contact_id) : "";
  const customerName = normalizeText(contact.contact_name);
  const gstNumber = normalizeText(contact.gst_no) || normalizeText(contact.gstin) || normalizeText(contact.tax_id) || normalizeText(contact.tax_reg_no);
  if (!customerId || !customerName) {
    return null;
  }
  return {
    customer_id: customerId,
    customer_name: customerName,
    gst_number: gstNumber
  };
}
__name(mapContactToCustomer, "mapContactToCustomer");
async function getZohoCustomers(env) {
  const contacts = [];
  let page = 1;
  let hasMorePage = true;
  while (hasMorePage) {
    const payload = await zohoGet(buildContactsEndpoint(page), env);
    if (!payload || typeof payload !== "object") {
      break;
    }
    const responsePayload = payload;
    const pageContacts = Array.isArray(responsePayload.contacts) ? responsePayload.contacts : Array.isArray(responsePayload.data) ? responsePayload.data : [];
    contacts.push(...pageContacts);
    hasMorePage = responsePayload.page_context?.has_more_page ?? pageContacts.length === CONTACTS_PER_PAGE;
    page += 1;
  }
  return contacts.filter((item) => Boolean(item) && typeof item === "object").filter(isActiveCustomer).map(mapContactToCustomer).filter((item) => item !== null);
}
__name(getZohoCustomers, "getZohoCustomers");

// api/customers.ts
function jsonResponse(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
__name(jsonResponse, "jsonResponse");
async function onRequestGet(context) {
  try {
    return jsonResponse(await getZohoCustomers(context.env), 200);
  } catch (error) {
    const safeMessage = error instanceof Error ? error.message : "Unable to load customers";
    const status = error instanceof ZohoRequestError ? error.status : 502;
    const code = error instanceof ZohoRequestError ? error.code : "customers_request_failed";
    console.error("[customers-api] request failed", {
      status,
      code,
      message: safeMessage
    });
    return jsonResponse({
      error: safeMessage,
      code,
      status
    }, 502);
  }
}
__name(onRequestGet, "onRequestGet");

// ../lib/invoices.ts
var INVOICES_PER_PAGE = 200;
function buildInvoicesEndpoint(customerId, page) {
  const params = new URLSearchParams({
    customer_id: customerId,
    page: String(page),
    per_page: String(INVOICES_PER_PAGE)
  });
  return `/invoices?${params.toString()}`;
}
__name(buildInvoicesEndpoint, "buildInvoicesEndpoint");
function normalizeText2(value) {
  return typeof value === "string" ? value.trim() : "";
}
__name(normalizeText2, "normalizeText");
function normalizeFieldName(value) {
  return normalizeText2(value).replace(/^cf_/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}
__name(normalizeFieldName, "normalizeFieldName");
function normalizeCustomFieldValue(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  return typeof value === "number" ? String(value) : "";
}
__name(normalizeCustomFieldValue, "normalizeCustomFieldValue");
function getCustomPoNumber(invoice) {
  const poFieldNames = /* @__PURE__ */ new Set(["po", "ponumber", "purchaseorder", "purchaseordernumber", "customerpo"]);
  const customField = invoice.custom_fields?.find((field) => poFieldNames.has(normalizeFieldName(field.label)) || poFieldNames.has(normalizeFieldName(field.api_name)));
  const customFieldValue = normalizeCustomFieldValue(customField?.value);
  if (customFieldValue) {
    return customFieldValue;
  }
  for (const [fieldName, value] of Object.entries(invoice.custom_field_hash ?? {})) {
    if (poFieldNames.has(normalizeFieldName(fieldName))) {
      return normalizeCustomFieldValue(value);
    }
  }
  return "";
}
__name(getCustomPoNumber, "getCustomPoNumber");
function mapLineItem(lineItem) {
  return {
    name: normalizeText2(lineItem.name),
    description: normalizeText2(lineItem.description),
    quantity: normalizeCustomFieldValue(lineItem.quantity)
  };
}
__name(mapLineItem, "mapLineItem");
function mapInvoice(invoice) {
  const invoiceId = invoice.invoice_id != null ? String(invoice.invoice_id) : "";
  const invoiceNumber = normalizeText2(invoice.invoice_number);
  if (!invoiceId || !invoiceNumber) {
    return null;
  }
  return {
    invoice_id: invoiceId,
    invoice_number: invoiceNumber
  };
}
__name(mapInvoice, "mapInvoice");
function mapInvoiceDetail(invoice) {
  const summary = mapInvoice(invoice);
  if (!summary) {
    return null;
  }
  const salesOrders = Array.isArray(invoice.salesorders) ? invoice.salesorders : invoice.salesorders ? [invoice.salesorders] : [];
  const salesOrderPoNumbers = salesOrders.map((salesOrder) => normalizeText2(salesOrder.reference_number)).filter(Boolean);
  return {
    ...summary,
    date: normalizeText2(invoice.date),
    customer_name: normalizeText2(invoice.customer_name),
    po_number: getCustomPoNumber(invoice) || salesOrderPoNumbers.join(",") || normalizeText2(invoice.reference_number) || normalizeText2(invoice.purchaseorder) || normalizeText2(invoice.po_number),
    line_items: Array.isArray(invoice.line_items) ? invoice.line_items.map(mapLineItem) : []
  };
}
__name(mapInvoiceDetail, "mapInvoiceDetail");
async function getZohoInvoiceById(invoiceId, env) {
  if (!invoiceId) {
    return null;
  }
  const payload = await zohoGet(`/invoices/${encodeURIComponent(invoiceId)}`, env);
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const responsePayload = payload;
  const invoice = responsePayload.invoice ?? responsePayload.data;
  if (!invoice || typeof invoice !== "object") {
    return null;
  }
  return mapInvoiceDetail(invoice);
}
__name(getZohoInvoiceById, "getZohoInvoiceById");
async function getZohoInvoicesByCustomer(customerId, env) {
  if (!customerId) {
    return [];
  }
  const invoices = [];
  let page = 1;
  let hasMorePage = true;
  while (hasMorePage) {
    const payload = await zohoGet(buildInvoicesEndpoint(customerId, page), env);
    if (!payload || typeof payload !== "object") {
      break;
    }
    const responsePayload = payload;
    const pageInvoices = Array.isArray(responsePayload.invoices) ? responsePayload.invoices : Array.isArray(responsePayload.data) ? responsePayload.data : [];
    invoices.push(...pageInvoices);
    hasMorePage = responsePayload.page_context?.has_more_page ?? pageInvoices.length === INVOICES_PER_PAGE;
    page += 1;
  }
  return invoices.filter((item) => Boolean(item) && typeof item === "object").map(mapInvoice).filter((item) => item !== null);
}
__name(getZohoInvoicesByCustomer, "getZohoInvoicesByCustomer");

// api/invoices.ts
async function onRequestGet2(context) {
  try {
    const url = new URL(context.request.url);
    const invoiceId = url.searchParams.get("invoice_id") ?? "";
    const customerId = url.searchParams.get("customer_id") ?? "";
    if (invoiceId) {
      const invoice = await getZohoInvoiceById(invoiceId, context.env);
      return invoice ? Response.json(invoice, { status: 200 }) : Response.json({ error: "Invoice not found" }, { status: 404 });
    }
    return Response.json(await getZohoInvoicesByCustomer(customerId, context.env), { status: 200 });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to load invoices"
      },
      { status: 502 }
    );
  }
}
__name(onRequestGet2, "onRequestGet");

// api/login.ts
async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const username = context.env.ADMIN_USERNAME;
    const password = context.env.ADMIN_PASSWORD;
    if (body.username === username && body.password === password) {
      return Response.json({
        authenticated: true,
        username
      });
    }
    return Response.json(
      {
        error: "Invalid username or password"
      },
      {
        status: 401
      }
    );
  } catch (err) {
    return Response.json(
      {
        error: err.message
      },
      {
        status: 500
      }
    );
  }
}
__name(onRequestPost, "onRequestPost");

// ../.wrangler/tmp/pages-s5sQXG/functionsRoutes-0.01658997531081241.mjs
var routes = [
  {
    routePath: "/api/auth/access/:roleId/:menuKey",
    mountPath: "/api/auth/access/:roleId",
    method: "",
    middlewares: [],
    modules: [onRequest]
  },
  {
    routePath: "/api/auth/roles/:id",
    mountPath: "/api/auth/roles",
    method: "",
    middlewares: [],
    modules: [onRequest2]
  },
  {
    routePath: "/api/auth/users/:id",
    mountPath: "/api/auth/users",
    method: "",
    middlewares: [],
    modules: [onRequest3]
  },
  {
    routePath: "/api/auth/access",
    mountPath: "/api/auth",
    method: "",
    middlewares: [],
    modules: [onRequest4]
  },
  {
    routePath: "/api/auth/bootstrap-superadmin",
    mountPath: "/api/auth",
    method: "",
    middlewares: [],
    modules: [onRequest5]
  },
  {
    routePath: "/api/auth/login",
    mountPath: "/api/auth",
    method: "",
    middlewares: [],
    modules: [onRequest6]
  },
  {
    routePath: "/api/auth/logout",
    mountPath: "/api/auth",
    method: "",
    middlewares: [],
    modules: [onRequest7]
  },
  {
    routePath: "/api/auth/me",
    mountPath: "/api/auth",
    method: "",
    middlewares: [],
    modules: [onRequest8]
  },
  {
    routePath: "/api/auth/roles",
    mountPath: "/api/auth",
    method: "",
    middlewares: [],
    modules: [onRequest9]
  },
  {
    routePath: "/api/auth/setup-password",
    mountPath: "/api/auth",
    method: "",
    middlewares: [],
    modules: [onRequest10]
  },
  {
    routePath: "/api/auth/users",
    mountPath: "/api/auth",
    method: "",
    middlewares: [],
    modules: [onRequest11]
  },
  {
    routePath: "/api/customers",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/invoices",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/login",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  }
];

// ../node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");

// ../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// ../.wrangler/tmp/bundle-sGfTrD/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;

// ../node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// ../.wrangler/tmp/bundle-sGfTrD/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=functionsWorker-0.7696390795316967.mjs.map
