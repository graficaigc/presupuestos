require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const configRoutes = require("./routes/config");
const rubrosRoutes = require("./routes/rubros");
const presupuestosRoutes = require("./routes/presupuestos");
const { router: billingRoutes, webhookHandler } = require("./routes/billing");
const asyncHandler = require("./asyncHandler");

const app = express();

app.use(cors());

// El webhook de Lemon Squeezy necesita el body crudo (sin JSON.parse) para
// verificar la firma HMAC, así que se registra ANTES del express.json() global.
app.post("/api/billing/webhook", express.raw({ type: "application/json" }), asyncHandler(webhookHandler));

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/config", configRoutes);
app.use("/api/rubros", rubrosRoutes);
app.use("/api/presupuestos", presupuestosRoutes);
app.use("/api/billing", billingRoutes);

app.use(express.static(path.join(__dirname, "..", "public")));

// Middleware de error final: cualquier excepción de una ruta (sync o async,
// via asyncHandler) cae acá en vez de tirar abajo el proceso para todos los clientes.
app.use((err, req, res, next) => {
  console.error("Error no controlado en", req.method, req.originalUrl, ":", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Error interno del servidor" });
});

// Red de seguridad: si algo async se escapa sin pasar por asyncHandler,
// lo registramos pero no dejamos que tumbe el servidor de todos los clientes.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

// En Vercel el proceso no escucha un puerto propio: cada request se maneja
// como función serverless (ver api/index.js), así que solo llamamos listen()
// cuando corremos como servidor tradicional (local, Render, cPanel, etc.).
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Servidor de Presupuestos escuchando en el puerto ${PORT}`);
  });
}

module.exports = app;
