const jwt = require("jsonwebtoken");
const prisma = require("./db");

const JWT_SECRET = process.env.JWT_SECRET;

function signToken(companyId) {
  return jwt.sign({ companyId }, JWT_SECRET, { expiresIn: "30d" });
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No autenticado" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const company = await prisma.company.findUnique({ where: { id: payload.companyId } });
    if (!company) return res.status(401).json({ error: "No autenticado" });
    req.company = company;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}

function subscriptionIsActive(company) {
  if (company.subscriptionStatus === "active") return true;
  if (company.subscriptionStatus === "trialing") {
    return company.trialEndsAt && new Date(company.trialEndsAt) > new Date();
  }
  return false;
}

function requireActiveSubscription(req, res, next) {
  if (subscriptionIsActive(req.company)) return next();
  return res.status(402).json({
    error: "Suscripción inactiva",
    message: "Tu período de prueba terminó o tu suscripción no está activa. Activala para seguir usando la app.",
  });
}

module.exports = { signToken, requireAuth, requireActiveSubscription, subscriptionIsActive };
