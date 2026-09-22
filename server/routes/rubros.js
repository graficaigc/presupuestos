const express = require("express");
const prisma = require("../db");
const { requireAuth, requireActiveSubscription } = require("../middleware");
const asyncHandler = require("../asyncHandler");

const router = express.Router();
router.use(requireAuth, requireActiveSubscription);

// Trae todos los rubros de la empresa logueada, con sus items.
router.get("/", asyncHandler(async (req, res) => {
  const rubros = await prisma.rubro.findMany({
    where: { companyId: req.company.id },
    include: { items: true },
    orderBy: { createdAt: "asc" },
  });
  res.json({ rubros });
}));

router.post("/", asyncHandler(async (req, res) => {
  const nombre = (req.body.nombre || "").trim();
  if (!nombre) return res.status(400).json({ error: "El rubro necesita un nombre" });
  const rubro = await prisma.rubro.create({
    data: { nombre, companyId: req.company.id },
    include: { items: true },
  });
  res.status(201).json({ rubro });
}));

async function findOwnRubro(companyId, rubroId) {
  const rubro = await prisma.rubro.findUnique({ where: { id: rubroId } });
  if (!rubro || rubro.companyId !== companyId) return null;
  return rubro;
}

router.put("/:id", asyncHandler(async (req, res) => {
  const rubro = await findOwnRubro(req.company.id, req.params.id);
  if (!rubro) return res.status(404).json({ error: "Rubro no encontrado" });
  const nombre = (req.body.nombre || "").trim();
  if (!nombre) return res.status(400).json({ error: "El rubro necesita un nombre" });
  const actualizado = await prisma.rubro.update({ where: { id: rubro.id }, data: { nombre } });
  res.json({ rubro: actualizado });
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const rubro = await findOwnRubro(req.company.id, req.params.id);
  if (!rubro) return res.status(404).json({ error: "Rubro no encontrado" });
  await prisma.rubro.delete({ where: { id: rubro.id } });
  res.status(204).end();
}));

// -------- Items del catálogo --------

router.post("/:id/items", asyncHandler(async (req, res) => {
  const rubro = await findOwnRubro(req.company.id, req.params.id);
  if (!rubro) return res.status(404).json({ error: "Rubro no encontrado" });
  const { nombre, unidad, precio } = req.body;
  if (!nombre) return res.status(400).json({ error: "El ítem necesita un nombre" });
  const item = await prisma.item.create({
    data: { nombre: nombre.trim(), unidad: (unidad || "unid.").trim(), precio: parseFloat(precio) || 0, rubroId: rubro.id },
  });
  res.status(201).json({ item });
}));

// Alta masiva, usada por la importación de CSV.
router.post("/:id/items/bulk", asyncHandler(async (req, res) => {
  const rubro = await findOwnRubro(req.company.id, req.params.id);
  if (!rubro) return res.status(404).json({ error: "Rubro no encontrado" });
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const validos = items
    .filter((i) => i.nombre && i.nombre.trim())
    .map((i) => ({
      nombre: i.nombre.trim(),
      unidad: (i.unidad || "unid.").trim(),
      precio: parseFloat(i.precio) || 0,
      rubroId: rubro.id,
    }));
  if (validos.length === 0) return res.status(400).json({ error: "No se recibieron ítems válidos" });
  await prisma.item.createMany({ data: validos });
  const actualizado = await prisma.rubro.findUnique({ where: { id: rubro.id }, include: { items: true } });
  res.status(201).json({ rubro: actualizado, agregados: validos.length });
}));

async function findOwnItem(companyId, itemId) {
  const item = await prisma.item.findUnique({ where: { id: itemId }, include: { rubro: true } });
  if (!item || item.rubro.companyId !== companyId) return null;
  return item;
}

router.put("/items/:itemId", asyncHandler(async (req, res) => {
  const item = await findOwnItem(req.company.id, req.params.itemId);
  if (!item) return res.status(404).json({ error: "Ítem no encontrado" });
  const { nombre, unidad, precio } = req.body;
  const actualizado = await prisma.item.update({
    where: { id: item.id },
    data: {
      nombre: nombre !== undefined ? nombre : item.nombre,
      unidad: unidad !== undefined ? unidad : item.unidad,
      precio: precio !== undefined ? parseFloat(precio) || 0 : item.precio,
    },
  });
  res.json({ item: actualizado });
}));

router.delete("/items/:itemId", asyncHandler(async (req, res) => {
  const item = await findOwnItem(req.company.id, req.params.itemId);
  if (!item) return res.status(404).json({ error: "Ítem no encontrado" });
  await prisma.item.delete({ where: { id: item.id } });
  res.status(204).end();
}));

module.exports = router;
