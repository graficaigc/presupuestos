const express = require("express");
const crypto = require("crypto");
const prisma = require("../db");
const { requireAuth } = require("../middleware");
const asyncHandler = require("../asyncHandler");

const router = express.Router();

const LS_API_KEY = process.env.LEMONSQUEEZY_API_KEY;
const LS_STORE_ID = process.env.LEMONSQUEEZY_STORE_ID;
const LS_VARIANT_ID = process.env.LEMONSQUEEZY_VARIANT_ID;
const LS_WEBHOOK_SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

// Placeholders del .env.example (contienen "...") no deben activar la integración.
const lemonSqueezyConfigured = [LS_API_KEY, LS_STORE_ID, LS_VARIANT_ID].every(
  (v) => v && !v.includes("...")
);

const LS_API_BASE = "https://api.lemonsqueezy.com/v1";

async function lsFetch(path, options = {}) {
  const res = await fetch(`${LS_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${LS_API_KEY}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      ...(options.headers || {}),
    },
  });
  const body = await res.json();
  if (!res.ok) {
    const message = body?.errors?.[0]?.detail || `Lemon Squeezy respondió ${res.status}`;
    throw new Error(message);
  }
  return body;
}

function requireLemonSqueezyConfigured(req, res, next) {
  if (!lemonSqueezyConfigured) {
    return res.status(503).json({
      error: "Lemon Squeezy no está configurado",
      message: "Definí LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID, LEMONSQUEEZY_VARIANT_ID y LEMONSQUEEZY_WEBHOOK_SECRET en el .env del servidor.",
    });
  }
  next();
}

// Crea un checkout de Lemon Squeezy para que la empresa pague la suscripción mensual.
router.post("/create-checkout-session", requireAuth, requireLemonSqueezyConfigured, asyncHandler(async (req, res) => {
  const company = req.company;

  const body = await lsFetch("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            email: company.email,
            name: company.nombre,
            custom: { company_id: company.id },
          },
          product_options: {
            redirect_url: `${process.env.APP_URL}/index.html?suscripcion=exitosa`,
          },
        },
        relationships: {
          store: { data: { type: "stores", id: String(LS_STORE_ID) } },
          variant: { data: { type: "variants", id: String(LS_VARIANT_ID) } },
        },
      },
    }),
  });

  res.json({ url: body.data.attributes.url });
}));

// Devuelve la URL del portal de cliente de Lemon Squeezy (para gestionar/cancelar la suscripción).
router.post("/create-portal-session", requireAuth, requireLemonSqueezyConfigured, asyncHandler(async (req, res) => {
  if (!req.company.lsSubscriptionId) {
    return res.status(400).json({ error: "Esta cuenta todavía no tiene una suscripción de Lemon Squeezy asociada" });
  }
  const body = await lsFetch(`/subscriptions/${req.company.lsSubscriptionId}`);
  const portalUrl = body.data.attributes.urls?.customer_portal;
  if (!portalUrl) {
    return res.status(502).json({ error: "Lemon Squeezy no devolvió una URL de portal para esta suscripción" });
  }
  res.json({ url: portalUrl });
}));

// Handler del webhook: se monta en index.js con el body sin parsear (raw),
// porque Lemon Squeezy firma el body crudo con HMAC-SHA256 en el header X-Signature.
async function webhookHandler(req, res) {
  if (!LS_WEBHOOK_SECRET) {
    return res.status(503).send("Lemon Squeezy no configurado");
  }

  const signature = req.headers["x-signature"] || "";
  const digest = crypto.createHmac("sha256", LS_WEBHOOK_SECRET).update(req.body).digest("hex");
  const valido = signature.length === digest.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  if (!valido) {
    console.error("Firma de webhook de Lemon Squeezy inválida");
    return res.status(400).send("Firma inválida");
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).send("Body inválido");
  }

  const eventName = payload.meta?.event_name;
  const attrs = payload.data?.attributes || {};
  const companyId = payload.meta?.custom_data?.company_id;

  try {
    switch (eventName) {
      case "subscription_created":
      case "subscription_updated":
      case "subscription_resumed":
      case "subscription_unpaused": {
        const targetCompanyId = companyId || (await companyIdFromCustomer(attrs.customer_id));
        if (targetCompanyId) {
          await prisma.company.update({
            where: { id: targetCompanyId },
            data: {
              lsCustomerId: String(attrs.customer_id),
              lsSubscriptionId: String(payload.data.id),
              subscriptionStatus: mapLsStatus(attrs.status),
            },
          });
        }
        break;
      }
      case "subscription_cancelled":
      case "subscription_expired": {
        const targetCompanyId = companyId || (await companyIdFromCustomer(attrs.customer_id));
        if (targetCompanyId) {
          await prisma.company.update({
            where: { id: targetCompanyId },
            data: { subscriptionStatus: "canceled" },
          });
        }
        break;
      }
      case "subscription_payment_failed": {
        const targetCompanyId = companyId || (await companyIdFromCustomer(attrs.customer_id));
        if (targetCompanyId) {
          await prisma.company.update({
            where: { id: targetCompanyId },
            data: { subscriptionStatus: "past_due" },
          });
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("Error procesando webhook de Lemon Squeezy:", err);
    return res.status(500).send("Error interno procesando el webhook");
  }

  res.json({ received: true });
}

async function companyIdFromCustomer(customerId) {
  if (!customerId) return null;
  const company = await prisma.company.findFirst({ where: { lsCustomerId: String(customerId) } });
  return company?.id || null;
}

function mapLsStatus(lsStatus) {
  if (lsStatus === "active" || lsStatus === "on_trial") return "active";
  if (lsStatus === "past_due" || lsStatus === "unpaid" || lsStatus === "paused") return "past_due";
  return "canceled";
}

module.exports = { router, webhookHandler };
