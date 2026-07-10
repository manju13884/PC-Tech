var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

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
function buildContactsEndpoint() {
  return "/contacts";
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
  const payload = await zohoGet(buildContactsEndpoint(), env);
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const responsePayload = payload;
  const contacts = Array.isArray(responsePayload.contacts) ? responsePayload.contacts : Array.isArray(responsePayload.data) ? responsePayload.data : [];
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
    const customerId = url.searchParams.get("customer_id") ?? "";
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

// ../.wrangler/tmp/pages-khghmS/functionsRoutes-0.017113494144741837.mjs
var routes = [
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

// ../.wrangler/tmp/bundle-1DTbCW/middleware-insertion-facade.js
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

// ../.wrangler/tmp/bundle-1DTbCW/middleware-loader.entry.ts
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
//# sourceMappingURL=functionsWorker-0.020621043244124948.mjs.map
