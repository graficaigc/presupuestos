const express = require("express");
const prisma = require("../db");
const { requireAuth } = require("../middleware");
const asyncHandler = require("../asyncHandler");

const router = express.Router();
router.use(requireAuth);

const MAX_LOGO_LENGTH = 400_000; // ~300KB de imagen en base64

router.put("/", asyncHandler(async (req, res) => {
  const { nombre, telefono, direccion, ivaDefault, numeroSiguiente, logoUrl } = req.body;

  if (typeof logoUrl === "string" && logoUrl.length > MAX_LOGO_LENGTH) {
    return res.status(400).json({ error: "El logo es demasiado grande" });
  }

  const data = {
    nombre: nombre?.trim() ?? req.company.nombre,
    telefono: telefono ?? req.company.telefono,
    direccion: direccion ?? req.company.direccion,
    ivaDefault: ivaDefault !== undefined ? parseFloat(ivaDefault) : req.company.ivaDefault,
    numeroSiguiente: numeroSiguiente !== undefined ? parseInt(numeroSiguiente) : req.company.numeroSiguiente,
  };
  // logoUrl puede llegar como null explícito (para borrarlo), por eso se
  // maneja aparte en vez de con "??" (que trataría null como "sin cambios").
  if (logoUrl !== undefined) data.logoUrl = logoUrl;

  const company = await prisma.company.update({ where: { id: req.company.id }, data });

  res.json({
    id: company.id,
    nombre: company.nombre,
    email: company.email,
    telefono: company.telefono,
    direccion: company.direccion,
    logoUrl: company.logoUrl,
    ivaDefault: company.ivaDefault,
    numeroSiguiente: company.numeroSiguiente,
  });
}));

module.exports = router;
