-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "telefono" TEXT,
    "direccion" TEXT,
    "ivaDefault" DOUBLE PRECISION NOT NULL DEFAULT 21,
    "numeroSiguiente" INTEGER NOT NULL DEFAULT 1,
    "lsCustomerId" TEXT,
    "lsSubscriptionId" TEXT,
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'trialing',
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rubro" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rubro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL,
    "rubroId" TEXT NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Presupuesto" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clienteNombre" TEXT NOT NULL,
    "clienteTelefono" TEXT,
    "clienteEmail" TEXT,
    "clienteDireccion" TEXT,
    "rubroId" TEXT,
    "rubroNombre" TEXT,
    "itemsJson" TEXT NOT NULL,
    "margenPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "descuentoPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validezDias" INTEGER NOT NULL DEFAULT 15,
    "notas" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'Borrador',
    "companyId" TEXT NOT NULL,

    CONSTRAINT "Presupuesto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_email_key" ON "Company"("email");

-- AddForeignKey
ALTER TABLE "Rubro" ADD CONSTRAINT "Rubro_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_rubroId_fkey" FOREIGN KEY ("rubroId") REFERENCES "Rubro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Presupuesto" ADD CONSTRAINT "Presupuesto_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
