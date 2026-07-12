import { onRequest as __api_auth_access__roleId___menuKey__ts_onRequest } from "D:\\PC-Tech\\functions\\api\\auth\\access\\[roleId]\\[menuKey].ts"
import { onRequest as __api_auth_roles__id__ts_onRequest } from "D:\\PC-Tech\\functions\\api\\auth\\roles\\[id].ts"
import { onRequest as __api_auth_users__id__ts_onRequest } from "D:\\PC-Tech\\functions\\api\\auth\\users\\[id].ts"
import { onRequest as __api_auth_access_ts_onRequest } from "D:\\PC-Tech\\functions\\api\\auth\\access.ts"
import { onRequest as __api_auth_bootstrap_superadmin_ts_onRequest } from "D:\\PC-Tech\\functions\\api\\auth\\bootstrap-superadmin.ts"
import { onRequest as __api_auth_change_password_ts_onRequest } from "D:\\PC-Tech\\functions\\api\\auth\\change-password.ts"
import { onRequest as __api_auth_login_ts_onRequest } from "D:\\PC-Tech\\functions\\api\\auth\\login.ts"
import { onRequest as __api_auth_logout_ts_onRequest } from "D:\\PC-Tech\\functions\\api\\auth\\logout.ts"
import { onRequest as __api_auth_me_ts_onRequest } from "D:\\PC-Tech\\functions\\api\\auth\\me.ts"
import { onRequest as __api_auth_roles_ts_onRequest } from "D:\\PC-Tech\\functions\\api\\auth\\roles.ts"
import { onRequest as __api_auth_setup_password_ts_onRequest } from "D:\\PC-Tech\\functions\\api\\auth\\setup-password.ts"
import { onRequest as __api_auth_users_ts_onRequest } from "D:\\PC-Tech\\functions\\api\\auth\\users.ts"
import { onRequestGet as __api_customers_ts_onRequestGet } from "D:\\PC-Tech\\functions\\api\\customers.ts"
import { onRequestGet as __api_invoices_ts_onRequestGet } from "D:\\PC-Tech\\functions\\api\\invoices.ts"
import { onRequestPost as __api_login_ts_onRequestPost } from "D:\\PC-Tech\\functions\\api\\login.ts"

export const routes = [
    {
      routePath: "/api/auth/access/:roleId/:menuKey",
      mountPath: "/api/auth/access/:roleId",
      method: "",
      middlewares: [],
      modules: [__api_auth_access__roleId___menuKey__ts_onRequest],
    },
  {
      routePath: "/api/auth/roles/:id",
      mountPath: "/api/auth/roles",
      method: "",
      middlewares: [],
      modules: [__api_auth_roles__id__ts_onRequest],
    },
  {
      routePath: "/api/auth/users/:id",
      mountPath: "/api/auth/users",
      method: "",
      middlewares: [],
      modules: [__api_auth_users__id__ts_onRequest],
    },
  {
      routePath: "/api/auth/access",
      mountPath: "/api/auth",
      method: "",
      middlewares: [],
      modules: [__api_auth_access_ts_onRequest],
    },
  {
      routePath: "/api/auth/bootstrap-superadmin",
      mountPath: "/api/auth",
      method: "",
      middlewares: [],
      modules: [__api_auth_bootstrap_superadmin_ts_onRequest],
    },
  {
      routePath: "/api/auth/change-password",
      mountPath: "/api/auth",
      method: "",
      middlewares: [],
      modules: [__api_auth_change_password_ts_onRequest],
    },
  {
      routePath: "/api/auth/login",
      mountPath: "/api/auth",
      method: "",
      middlewares: [],
      modules: [__api_auth_login_ts_onRequest],
    },
  {
      routePath: "/api/auth/logout",
      mountPath: "/api/auth",
      method: "",
      middlewares: [],
      modules: [__api_auth_logout_ts_onRequest],
    },
  {
      routePath: "/api/auth/me",
      mountPath: "/api/auth",
      method: "",
      middlewares: [],
      modules: [__api_auth_me_ts_onRequest],
    },
  {
      routePath: "/api/auth/roles",
      mountPath: "/api/auth",
      method: "",
      middlewares: [],
      modules: [__api_auth_roles_ts_onRequest],
    },
  {
      routePath: "/api/auth/setup-password",
      mountPath: "/api/auth",
      method: "",
      middlewares: [],
      modules: [__api_auth_setup_password_ts_onRequest],
    },
  {
      routePath: "/api/auth/users",
      mountPath: "/api/auth",
      method: "",
      middlewares: [],
      modules: [__api_auth_users_ts_onRequest],
    },
  {
      routePath: "/api/customers",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_customers_ts_onRequestGet],
    },
  {
      routePath: "/api/invoices",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_invoices_ts_onRequestGet],
    },
  {
      routePath: "/api/login",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_login_ts_onRequestPost],
    },
  ]