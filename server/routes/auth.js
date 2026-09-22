const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../db");
const { signToken, requireAuth, subscriptionIsActive } = require("../middleware");
const asyncHandler = require("../asyncHandler");

const router = express.Router();
const TRIAL_DAYS = parseInt(process.env.TRIAL_DAYS || "14");

router.post("/signup", asyncHandler(async (req, res) => {
  const { nombreEmpresa, email, password } = req.body;
  if (!nombreEmpresa || !email || !password) {
    return res.status(400).json({ error: "Faltan datos (nombre de empresa, email, contraseña)" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
  }

  const existente = await prisma.company.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (existente) {
    return res.status(409).json({ error: "Ya existe una cuenta con ese email" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  const company = await prisma.company.create({
    data: {
      nombre: nombreEmpresa.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      subscriptionStatus: "trialing",
      trialEndsAt,
    },
  });

  const token = signToken(company.id);
  res.status(201).json({ token, company: publicCompany(company) });
}));

router.post("/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Faltan email o contraseña" });

  const company = await prisma.company.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!company) return res.status(401).json({ error: "Email o contraseña incorrectos" });

  const ok = await bcrypt.compare(password, company.passwordHash);
  if (!ok) return res.status(401).json({ error: "Email o contraseña incorrectos" });

  const token = signToken(company.id);
  res.json({ token, company: publicCompany(company) });
}));

router.get("/me", requireAuth, (req, res) => {
  res.json({ company: publicCompany(req.company) });
});

function publicCompany(company) {
  return {
    id: company.id,
    nombre: company.nombre,
    email: company.email,
    telefono: company.telefono,
    direccion: company.direccion,
    logoUrl: company.logoUrl,
    ivaDefault: company.ivaDefault,
    numeroSiguiente: company.numeroSiguiente,
    subscriptionStatus: company.subscriptionStatus,
    trialEndsAt: company.trialEndsAt,
    subscriptionActive: subscriptionIsActive(company),
  };
}

module.exports = router;
