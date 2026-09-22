const express = require("express");
const prisma = require("../db");
const { requireAuth, requireActiveSubscription } = require("../middleware");
const asyncHandler = require("../asyncHandler");

const router = express.Router();
router.use(requireAuth, requireActiveSubscription);

function serialize(p) {
  return { ...p, items: JSON.parse(p.itemsJson), itemsJson: undefined };
}

router.get("/", asyncHandler(async (req, res) => {
  const presupuestos = await prisma.presupuesto.findMany({
    where: { companyId: req.company.id },
    orderBy: { numero: "desc" },
  });
  res.json({ presupuestos: presupuestos.map(serialize) });
}));

router.post("/", asyncHandler(async (req, res) => {
  const b = req.body;
  const numero = req.company.numeroSiguiente;

  const [presupuesto] = await prisma.$transaction([
    prisma.presupuesto.create({
      data: {
        numero,
        clienteNombre: b.clienteNombre || "",
        clienteTelefono: b.clienteTelefono || "",
        clienteEmail: b.clienteEmail || "",
        clienteDireccion: b.clienteDireccion || "",
        rubroId: b.rubroId || null,
        rubroNombre: b.rubroNombre || "",
        itemsJson: JSON.stringify(b.items || []),
        margenPct: parseFloat(b.margenPct) || 0,
        descuentoPct: parseFloat(b.descuentoPct) || 0,
        ivaPct: parseFloat(b.ivaPct) || 0,
        validezDias: parseInt(b.validezDias) || 15,
        notas: b.notas || "",
        estado: b.estado || "Borrador",
        companyId: req.company.id,
      },
    }),
    prisma.company.update({ where: { id: req.company.id }, data: { numeroSiguiente: numero + 1 } }),
  ]);

  res.status(201).json({ presupuesto: serialize(presupuesto) });
}));

async function findOwn(companyId, id) {
  const p = await prisma.presupuesto.findUnique({ where: { id } });
  if (!p || p.companyId !== companyId) return null;
  return p;
}

router.put("/:id", asyncHandler(async (req, res) => {
  const existente = await findOwn(req.company.id, req.params.id);
  if (!existente) return res.status(404).json({ error: "Presupuesto no encontrado" });
  const b = req.body;
  const actualizado = await prisma.presupuesto.update({
    where: { id: existente.id },
    data: {
      clienteNombre: b.clienteNombre ?? existente.clienteNombre,
      clienteTelefono: b.clienteTelefono ?? existente.clienteTelefono,
      clienteEmail: b.clienteEmail ?? existente.clienteEmail,
      clienteDireccion: b.clienteDireccion ?? existente.clienteDireccion,
      rubroId: b.rubroId ?? existente.rubroId,
      rubroNombre: b.rubroNombre ?? existente.rubroNombre,
      itemsJson: b.items ? JSON.stringify(b.items) : existente.itemsJson,
      margenPct: b.margenPct !== undefined ? parseFloat(b.margenPct) || 0 : existente.margenPct,
      descuentoPct: b.descuentoPct !== undefined ? parseFloat(b.descuentoPct) || 0 : existente.descuentoPct,
      ivaPct: b.ivaPct !== undefined ? parseFloat(b.ivaPct) || 0 : existente.ivaPct,
      validezDias: b.validezDias !== undefined ? parseInt(b.validezDias) || 0 : existente.validezDias,
      notas: b.notas ?? existente.notas,
      estado: b.estado ?? existente.estado,
    },
  });
  res.json({ presupuesto: serialize(actualizado) });
}));

router.post("/:id/duplicar", asyncHandler(async (req, res) => {
  const existente = await findOwn(req.company.id, req.params.id);
  if (!existente) return res.status(404).json({ error: "Presupuesto no encontrado" });
  const numero = req.company.numeroSiguiente;

  const [copia] = await prisma.$transaction([
    prisma.presupuesto.create({
      data: {
        numero,
        clienteNombre: existente.clienteNombre,
        clienteTelefono: existente.clienteTelefono,
        clienteEmail: existente.clienteEmail,
        clienteDireccion: existente.clienteDireccion,
        rubroId: existente.rubroId,
        rubroNombre: existente.rubroNombre,
        itemsJson: existente.itemsJson,
        margenPct: existente.margenPct,
        descuentoPct: existente.descuentoPct,
        ivaPct: existente.ivaPct,
        validezDias: existente.validezDias,
        notas: existente.notas,
        estado: "Borrador",
        companyId: req.company.id,
      },
    }),
    prisma.company.update({ where: { id: req.company.id }, data: { numeroSiguiente: numero + 1 } }),
  ]);

  res.status(201).json({ presupuesto: serialize(copia) });
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const existente = await findOwn(req.company.id, req.params.id);
  if (!existente) return res.status(404).json({ error: "Presupuesto no encontrado" });
  await prisma.presupuesto.delete({ where: { id: existente.id } });
  res.status(204).end();
}));

module.exports = router;
