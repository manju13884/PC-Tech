import { onRequestGet as __api_customers_ts_onRequestGet } from "D:\\PC-Tech\\functions\\api\\customers.ts"
import { onRequestGet as __api_invoices_ts_onRequestGet } from "D:\\PC-Tech\\functions\\api\\invoices.ts"
import { onRequestPost as __api_login_ts_onRequestPost } from "D:\\PC-Tech\\functions\\api\\login.ts"

export const routes = [
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