const express = require("express");
const prisma = require("../db");
const { requireAuth } = require("../middleware");
const asyncHandler = require("../asyncHandler");

const router = express.Router();
router.use(requireAuth);

router.put("/", asyncHandler(async (req, res) => {
  const { nombre, telefono, direccion, ivaDefault, numeroSiguiente } = req.body;
  const company = await prisma.company.update({
    where: { id: req.company.id },
    data: {
      nombre: nombre?.trim() ?? req.company.nombre,
      telefono: telefono ?? req.company.telefono,
      direccion: direccion ?? req.company.direccion,
      ivaDefault: ivaDefault !== undefined ? parseFloat(ivaDefault) : req.company.ivaDefault,
      numeroSiguiente: numeroSiguiente !== undefined ? parseInt(numeroSiguiente) : req.company.numeroSiguiente,
    },
  });
  res.json({
    id: company.id,
    nombre: company.nombre,
    email: company.email,
    telefono: company.telefono,
    direccion: company.direccion,
    ivaDefault: company.ivaDefault,
    numeroSiguiente: company.numeroSiguiente,
  });
}));

module.exports = router;
