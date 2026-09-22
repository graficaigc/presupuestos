/* ==========================================================================
   Presupuestos — frontend que habla con el backend (API + login + Stripe).
   ========================================================================== */

requireSession();

function money(n) {
  n = Number(n) || 0;
  return "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const state = {
  company: null,
  rubros: [],
  presupuestos: [],
};

let currentEditingId = null;
let editorItems = [];
let selectedRubroId = null;

/* ---------------------------------------------------------------------- */
/* Toast                                                                   */
/* ---------------------------------------------------------------------- */
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2200);
}

/* ---------------------------------------------------------------------- */
/* Navegación entre vistas                                                 */
/* ---------------------------------------------------------------------- */
function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById("view-" + name).classList.add("active");
  document.querySelectorAll(".tab-btn[data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === name);
  });
}

document.querySelectorAll(".tab-btn[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => {
    showView(btn.dataset.view);
    if (btn.dataset.view === "presupuestos") renderPresupuestos();
    if (btn.dataset.view === "rubros") renderRubros();
    if (btn.dataset.view === "config") renderConfig();
  });
});

document.getElementById("btnLogout").addEventListener("click", () => Api.logout());

/* ---------------------------------------------------------------------- */
/* Cálculo de totales (igual que antes, corre en el navegador)             */
/* ---------------------------------------------------------------------- */
function calcularTotales(items, margenPct, descuentoPct, ivaPct) {
  const subtotal = items.reduce((acc, it) => acc + it.cantidad * it.precioUnitario, 0);
  const margen = subtotal * (margenPct / 100);
  const conMargen = subtotal + margen;
  const descuento = conMargen * (descuentoPct / 100);
  const conDescuento = conMargen - descuento;
  const iva = conDescuento * (ivaPct / 100);
  const total = conDescuento + iva;
  return { subtotal, margen, descuento, iva, total };
}

/* ---------------------------------------------------------------------- */
/* VISTA: Listado de presupuestos                                          */
/* ---------------------------------------------------------------------- */
function renderPresupuestos() {
  const tbody = document.querySelector("#tablaPresupuestos tbody");
  const q = document.getElementById("buscarPresupuesto").value.trim().toLowerCase();
  tbody.innerHTML = "";

  const lista = [...state.presupuestos]
    .sort((a, b) => b.numero - a.numero)
    .filter((p) => {
      if (!q) return true;
      return (
        String(p.numero).includes(q) ||
        (p.clienteNombre || "").toLowerCase().includes(q) ||
        (p.rubroNombre || "").toLowerCase().includes(q)
      );
    });

  document.getElementById("emptyPresupuestos").hidden = state.presupuestos.length > 0;

  lista.forEach((p) => {
    const tot = calcularTotales(p.items, p.margenPct, p.descuentoPct, p.ivaPct);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>#${p.numero}</td>
      <td>${new Date(p.fecha).toLocaleDateString("es-AR")}</td>
      <td>${escapeHtml(p.clienteNombre || "(sin nombre)")}</td>
      <td>${escapeHtml(p.rubroNombre || "-")}</td>
      <td>${money(tot.total)}</td>
      <td>${escapeHtml(p.estado || "Borrador")}</td>
      <td class="row-actions">
        <button class="btn small" data-action="ver" data-id="${p.id}">Ver</button>
        <button class="btn small" data-action="duplicar" data-id="${p.id}">Duplicar</button>
        <button class="btn small danger" data-action="eliminar" data-id="${p.id}">Eliminar</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

document.getElementById("buscarPresupuesto").addEventListener("input", renderPresupuestos);

document.querySelector("#tablaPresupuestos tbody").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  const presupuesto = state.presupuestos.find((p) => p.id === id);
  if (!presupuesto) return;

  if (btn.dataset.action === "ver") {
    openEditor(presupuesto);
  } else if (btn.dataset.action === "duplicar") {
    const { presupuesto: copia } = await Api.post(`/presupuestos/${id}/duplicar`, {});
    state.presupuestos.push(copia);
    renderPresupuestos();
    showToast("Presupuesto duplicado como #" + copia.numero);
  } else if (btn.dataset.action === "eliminar") {
    if (confirm("¿Eliminar el presupuesto #" + presupuesto.numero + "? Esta acción no se puede deshacer.")) {
      await Api.del(`/presupuestos/${id}`);
      state.presupuestos = state.presupuestos.filter((p) => p.id !== id);
      renderPresupuestos();
      showToast("Presupuesto eliminado");
    }
  }
});

document.getElementById("btnNuevoPresupuesto").addEventListener("click", () => openEditor(null));

/* ---------------------------------------------------------------------- */
/* VISTA: Editor de presupuesto                                            */
/* ---------------------------------------------------------------------- */
function fillRubroSelect(selectEl, selectedId) {
  selectEl.innerHTML = "";
  if (state.rubros.length === 0) {
    selectEl.innerHTML = `<option value="">Creá un rubro primero</option>`;
    return;
  }
  state.rubros.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.nombre;
    if (r.id === selectedId) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

function fillItemCatalogoSelect() {
  const sel = document.getElementById("selectorItemCatalogo");
  const rubroId = document.getElementById("editorRubro").value;
  const rubro = state.rubros.find((r) => r.id === rubroId);
  sel.innerHTML = "";
  if (!rubro || rubro.items.length === 0) {
    sel.innerHTML = `<option value="">Sin ítems en este rubro</option>`;
    return;
  }
  rubro.items.forEach((it) => {
    const opt = document.createElement("option");
    opt.value = it.id;
    opt.textContent = `${it.nombre} — ${money(it.precio)} / ${it.unidad}`;
    sel.appendChild(opt);
  });
}

function openEditor(presupuesto) {
  currentEditingId = presupuesto ? presupuesto.id : null;
  document.getElementById("editorTitulo").textContent = presupuesto
    ? "Presupuesto #" + presupuesto.numero
    : "Nuevo presupuesto";

  document.getElementById("clienteNombre").value = presupuesto?.clienteNombre || "";
  document.getElementById("clienteTelefono").value = presupuesto?.clienteTelefono || "";
  document.getElementById("clienteEmail").value = presupuesto?.clienteEmail || "";
  document.getElementById("clienteDireccion").value = presupuesto?.clienteDireccion || "";
  document.getElementById("editorValidez").value = presupuesto?.validezDias ?? 15;
  document.getElementById("editorMargen").value = presupuesto?.margenPct ?? 0;
  document.getElementById("editorDescuento").value = presupuesto?.descuentoPct ?? 0;
  document.getElementById("editorIva").value = presupuesto?.ivaPct ?? state.company.ivaDefault;
  document.getElementById("editorNotas").value = presupuesto?.notas || "";

  fillRubroSelect(document.getElementById("editorRubro"), presupuesto?.rubroId || state.rubros[0]?.id);
  fillItemCatalogoSelect();

  editorItems = presupuesto ? JSON.parse(JSON.stringify(presupuesto.items)) : [];
  renderItemsPresupuesto();

  showView("editor");
}

document.getElementById("editorRubro").addEventListener("change", fillItemCatalogoSelect);

function renderItemsPresupuesto() {
  const tbody = document.querySelector("#tablaItemsPresupuesto tbody");
  tbody.innerHTML = "";
  document.getElementById("emptyItemsPresupuesto").hidden = editorItems.length > 0;

  editorItems.forEach((it, idx) => {
    const tr = document.createElement("tr");
    const sub = it.cantidad * it.precioUnitario;
    tr.innerHTML = `
      <td>${escapeHtml(it.nombre)}</td>
      <td>${escapeHtml(it.unidad)}</td>
      <td class="num"><input type="number" min="0.01" step="0.01" value="${it.cantidad}" data-idx="${idx}" class="edit-cant" style="width:80px;text-align:right;"></td>
      <td class="num"><input type="number" min="0" step="0.01" value="${it.precioUnitario}" data-idx="${idx}" class="edit-precio" style="width:100px;text-align:right;"></td>
      <td class="num">${money(sub)}</td>
      <td><button class="btn small danger" data-idx="${idx}" data-action="quitar">✕</button></td>`;
    tbody.appendChild(tr);
  });
  actualizarTotalesEditor();
}

document.querySelector("#tablaItemsPresupuesto tbody").addEventListener("input", (e) => {
  const idx = e.target.dataset.idx;
  if (idx === undefined) return;
  if (e.target.classList.contains("edit-cant")) {
    editorItems[idx].cantidad = parseFloat(e.target.value) || 0;
  } else if (e.target.classList.contains("edit-precio")) {
    editorItems[idx].precioUnitario = parseFloat(e.target.value) || 0;
  }
  renderItemsPresupuesto();
});

document.querySelector("#tablaItemsPresupuesto tbody").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action='quitar']");
  if (!btn) return;
  editorItems.splice(Number(btn.dataset.idx), 1);
  renderItemsPresupuesto();
});

document.getElementById("btnAgregarDeCatalogo").addEventListener("click", () => {
  const rubroId = document.getElementById("editorRubro").value;
  const rubro = state.rubros.find((r) => r.id === rubroId);
  const itemId = document.getElementById("selectorItemCatalogo").value;
  const cantidad = parseFloat(document.getElementById("cantidadNuevoItem").value) || 1;
  if (!rubro || !itemId) return;
  const item = rubro.items.find((i) => i.id === itemId);
  if (!item) return;
  editorItems.push({ nombre: item.nombre, unidad: item.unidad, cantidad, precioUnitario: item.precio });
  renderItemsPresupuesto();
});

document.getElementById("btnAgregarManual").addEventListener("click", () => {
  const nombre = prompt("Nombre del ítem/servicio:");
  if (!nombre) return;
  const unidad = prompt("Unidad (ej: unid., hs, m2):", "unid.") || "unid.";
  const precio = parseFloat(prompt("Precio unitario:", "0")) || 0;
  const cantidad = parseFloat(prompt("Cantidad:", "1")) || 1;
  editorItems.push({ nombre, unidad, cantidad, precioUnitario: precio });
  renderItemsPresupuesto();
});

function actualizarTotalesEditor() {
  const margenPct = parseFloat(document.getElementById("editorMargen").value) || 0;
  const descuentoPct = parseFloat(document.getElementById("editorDescuento").value) || 0;
  const ivaPct = parseFloat(document.getElementById("editorIva").value) || 0;
  const t = calcularTotales(editorItems, margenPct, descuentoPct, ivaPct);
  document.getElementById("resSubtotal").textContent = money(t.subtotal);
  document.getElementById("resMargen").textContent = money(t.margen);
  document.getElementById("resDescuento").textContent = "-" + money(t.descuento);
  document.getElementById("resIva").textContent = money(t.iva);
  document.getElementById("resTotal").textContent = money(t.total);
}

["editorMargen", "editorDescuento", "editorIva"].forEach((id) => {
  document.getElementById(id).addEventListener("input", actualizarTotalesEditor);
});

document.getElementById("btnCancelarEditor").addEventListener("click", () => {
  showView("presupuestos");
  renderPresupuestos();
});

document.getElementById("btnGuardarPresupuesto").addEventListener("click", async () => {
  const rubroId = document.getElementById("editorRubro").value;
  const rubro = state.rubros.find((r) => r.id === rubroId);

  if (editorItems.length === 0) {
    if (!confirm("El presupuesto no tiene ítems cargados. ¿Guardar de todas formas?")) return;
  }

  const payload = {
    clienteNombre: document.getElementById("clienteNombre").value.trim(),
    clienteTelefono: document.getElementById("clienteTelefono").value.trim(),
    clienteEmail: document.getElementById("clienteEmail").value.trim(),
    clienteDireccion: document.getElementById("clienteDireccion").value.trim(),
    rubroId: rubroId,
    rubroNombre: rubro ? rubro.nombre : "",
    items: editorItems,
    margenPct: parseFloat(document.getElementById("editorMargen").value) || 0,
    descuentoPct: parseFloat(document.getElementById("editorDescuento").value) || 0,
    ivaPct: parseFloat(document.getElementById("editorIva").value) || 0,
    validezDias: parseInt(document.getElementById("editorValidez").value) || 0,
    notas: document.getElementById("editorNotas").value,
  };

  let guardado;
  if (currentEditingId) {
    ({ presupuesto: guardado } = await Api.put(`/presupuestos/${currentEditingId}`, payload));
    const idx = state.presupuestos.findIndex((p) => p.id === currentEditingId);
    state.presupuestos[idx] = guardado;
  } else {
    ({ presupuesto: guardado } = await Api.post("/presupuestos", payload));
    state.presupuestos.push(guardado);
  }

  showToast("Presupuesto #" + guardado.numero + " guardado");
  showView("presupuestos");
  renderPresupuestos();
});

document.getElementById("btnImprimirEditor").addEventListener("click", () => {
  const rubroId = document.getElementById("editorRubro").value;
  const rubro = state.rubros.find((r) => r.id === rubroId);
  const margenPct = parseFloat(document.getElementById("editorMargen").value) || 0;
  const descuentoPct = parseFloat(document.getElementById("editorDescuento").value) || 0;
  const ivaPct = parseFloat(document.getElementById("editorIva").value) || 0;
  const t = calcularTotales(editorItems, margenPct, descuentoPct, ivaPct);

  const cliente = {
    nombre: document.getElementById("clienteNombre").value.trim(),
    telefono: document.getElementById("clienteTelefono").value.trim(),
    email: document.getElementById("clienteEmail").value.trim(),
    direccion: document.getElementById("clienteDireccion").value.trim(),
  };
  const notas = document.getElementById("editorNotas").value;
  const numero = currentEditingId
    ? state.presupuestos.find((p) => p.id === currentEditingId)?.numero
    : state.company.numeroSiguiente;
  const fecha = new Date().toLocaleDateString("es-AR");
  const emp = state.company;

  const filasItems = editorItems.map((it) => `
    <tr>
      <td>${escapeHtml(it.nombre)}</td>
      <td>${escapeHtml(it.unidad)}</td>
      <td class="num">${it.cantidad}</td>
      <td class="num">${money(it.precioUnitario)}</td>
      <td class="num">${money(it.cantidad * it.precioUnitario)}</td>
    </tr>`).join("");

  document.getElementById("printArea").innerHTML = `
    <div class="print-header">
      <div style="display:flex; gap:12px; align-items:flex-start;">
        ${emp.logoUrl ? `<img src="${emp.logoUrl}" alt="" style="width:48px;height:48px;border-radius:8px;object-fit:cover;">` : ""}
        <div>
          <h1>${escapeHtml(emp.nombre || "Mi Empresa")}</h1>
          <div>${escapeHtml(emp.telefono || "")} ${emp.telefono && emp.email ? "·" : ""} ${escapeHtml(emp.email || "")}</div>
          <div>${escapeHtml(emp.direccion || "")}</div>
        </div>
      </div>
      <div class="print-meta">
        <div><strong>Presupuesto #${numero || ""}</strong></div>
        <div>Fecha: ${fecha}</div>
        <div>Rubro: ${escapeHtml(rubro ? rubro.nombre : "-")}</div>
        <div>Validez: ${document.getElementById("editorValidez").value} días</div>
      </div>
    </div>

    <div class="print-section-title">Cliente</div>
    <div>${escapeHtml(cliente.nombre || "-")}</div>
    <div>${escapeHtml(cliente.telefono || "")} ${cliente.telefono && cliente.email ? "·" : ""} ${escapeHtml(cliente.email || "")}</div>
    <div>${escapeHtml(cliente.direccion || "")}</div>

    <div class="print-section-title">Detalle</div>
    <table class="print-table">
      <thead><tr><th>Ítem</th><th>Unidad</th><th class="num">Cant.</th><th class="num">P. unit.</th><th class="num">Subtotal</th></tr></thead>
      <tbody>${filasItems || "<tr><td colspan='5'>Sin ítems</td></tr>"}</tbody>
    </table>

    <div class="print-totales">
      <div><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
      <div><span>Margen</span><span>${money(t.margen)}</span></div>
      <div><span>Descuento</span><span>-${money(t.descuento)}</span></div>
      <div><span>IVA</span><span>${money(t.iva)}</span></div>
      <div class="total-final"><span>TOTAL</span><span>${money(t.total)}</span></div>
    </div>

    ${notas ? `<div class="print-section-title">Notas / condiciones</div><div class="print-notas">${escapeHtml(notas)}</div>` : ""}

    <div class="print-footer">Generado con Presupuestos — ${fecha}</div>
  `;

  window.print();
});

/* ---------------------------------------------------------------------- */
/* VISTA: Rubros y precios                                                 */
/* ---------------------------------------------------------------------- */
function renderRubros() {
  const ul = document.getElementById("listaRubros");
  ul.innerHTML = "";
  state.rubros.forEach((r) => {
    const li = document.createElement("li");
    li.className = r.id === selectedRubroId ? "active" : "";
    li.innerHTML = `<span>${escapeHtml(r.nombre)}</span><span class="count">${r.items.length}</span>`;
    li.addEventListener("click", () => {
      selectedRubroId = r.id;
      renderRubros();
    });
    ul.appendChild(li);
  });

  const rubro = state.rubros.find((r) => r.id === selectedRubroId);
  document.getElementById("rubroAcciones").hidden = !rubro;
  document.getElementById("catalogoContenido").hidden = !rubro;
  document.getElementById("emptySinRubro").hidden = !!rubro;
  document.getElementById("rubroSeleccionadoTitulo").textContent = rubro ? rubro.nombre : "Seleccioná un rubro";

  if (rubro) renderCatalogo(rubro);
}

function renderCatalogo(rubro) {
  const tbody = document.querySelector("#tablaCatalogo tbody");
  tbody.innerHTML = "";
  document.getElementById("emptyCatalogo").hidden = rubro.items.length > 0;

  rubro.items.forEach((it) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" value="${escapeHtml(it.nombre)}" data-id="${it.id}" data-field="nombre" class="cat-edit"></td>
      <td><input type="text" value="${escapeHtml(it.unidad)}" data-id="${it.id}" data-field="unidad" class="cat-edit" style="width:100px;"></td>
      <td class="num"><input type="number" min="0" step="0.01" value="${it.precio}" data-id="${it.id}" data-field="precio" class="cat-edit" style="width:110px;text-align:right;"></td>
      <td><button class="btn small danger" data-id="${it.id}" data-action="quitar-item">✕</button></td>`;
    tbody.appendChild(tr);
  });
}

document.querySelector("#tablaCatalogo tbody").addEventListener("change", async (e) => {
  if (!e.target.classList.contains("cat-edit")) return;
  const rubro = state.rubros.find((r) => r.id === selectedRubroId);
  const item = rubro.items.find((i) => i.id === e.target.dataset.id);
  const field = e.target.dataset.field;
  item[field] = field === "precio" ? parseFloat(e.target.value) || 0 : e.target.value;
  await Api.put(`/rubros/items/${item.id}`, { [field]: item[field] });
});

document.querySelector("#tablaCatalogo tbody").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action='quitar-item']");
  if (!btn) return;
  const rubro = state.rubros.find((r) => r.id === selectedRubroId);
  await Api.del(`/rubros/items/${btn.dataset.id}`);
  rubro.items = rubro.items.filter((i) => i.id !== btn.dataset.id);
  renderRubros();
});

document.getElementById("btnAgregarRubro").addEventListener("click", async () => {
  const input = document.getElementById("nuevoRubroNombre");
  const nombre = input.value.trim();
  if (!nombre) return;
  const { rubro } = await Api.post("/rubros", { nombre });
  state.rubros.push(rubro);
  selectedRubroId = rubro.id;
  input.value = "";
  renderRubros();
  showToast("Rubro creado");
});

document.getElementById("btnRenombrarRubro").addEventListener("click", async () => {
  const rubro = state.rubros.find((r) => r.id === selectedRubroId);
  if (!rubro) return;
  const nuevoNombre = prompt("Nuevo nombre del rubro:", rubro.nombre);
  if (nuevoNombre && nuevoNombre.trim()) {
    await Api.put(`/rubros/${rubro.id}`, { nombre: nuevoNombre.trim() });
    rubro.nombre = nuevoNombre.trim();
    renderRubros();
  }
});

document.getElementById("btnEliminarRubro").addEventListener("click", async () => {
  const rubro = state.rubros.find((r) => r.id === selectedRubroId);
  if (!rubro) return;
  if (confirm(`¿Eliminar el rubro "${rubro.nombre}" y toda su lista de precios?`)) {
    await Api.del(`/rubros/${rubro.id}`);
    state.rubros = state.rubros.filter((r) => r.id !== selectedRubroId);
    selectedRubroId = null;
    renderRubros();
    showToast("Rubro eliminado");
  }
});

document.getElementById("btnAgregarItemCatalogo").addEventListener("click", async () => {
  const rubro = state.rubros.find((r) => r.id === selectedRubroId);
  if (!rubro) return;
  const nombre = document.getElementById("itemNombre").value.trim();
  const unidad = document.getElementById("itemUnidad").value.trim() || "unid.";
  const precio = parseFloat(document.getElementById("itemPrecio").value) || 0;
  if (!nombre) return;
  const { item } = await Api.post(`/rubros/${rubro.id}/items`, { nombre, unidad, precio });
  rubro.items.push(item);
  document.getElementById("itemNombre").value = "";
  document.getElementById("itemUnidad").value = "";
  document.getElementById("itemPrecio").value = "";
  renderRubros();
});

document.getElementById("inputImportarCSV").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const rubro = state.rubros.find((r) => r.id === selectedRubroId);
  const reader = new FileReader();
  reader.onload = async () => {
    const lines = reader.result.split(/\r?\n/).filter((l) => l.trim());
    const items = [];
    lines.forEach((line) => {
      const [nombre, unidad, precio] = line.split(",").map((s) => (s || "").trim());
      if (!nombre || nombre.toLowerCase() === "nombre") return;
      items.push({ nombre, unidad: unidad || "unid.", precio: parseFloat(precio) || 0 });
    });
    if (items.length === 0) {
      showToast("El archivo no tenía ítems válidos");
      return;
    }
    const { rubro: actualizado, agregados } = await Api.post(`/rubros/${rubro.id}/items/bulk`, { items });
    rubro.items = actualizado.items;
    renderRubros();
    showToast(`${agregados} ítems importados`);
  };
  reader.readAsText(file);
  e.target.value = "";
});

document.getElementById("btnExportarCSV").addEventListener("click", () => {
  const rubro = state.rubros.find((r) => r.id === selectedRubroId);
  if (!rubro) return;
  const csv = ["nombre,unidad,precio", ...rubro.items.map((i) => `${i.nombre},${i.unidad},${i.precio}`)].join("\n");
  descargarArchivo(csv, `precios-${rubro.nombre}.csv`, "text/csv");
});

/* ---------------------------------------------------------------------- */
/* VISTA: Configuración                                                    */
/* ---------------------------------------------------------------------- */
let logoPendiente; // undefined = sin cambios; string = nuevo logo; null = quitar

function renderConfig() {
  document.getElementById("cfgNombre").value = state.company.nombre;
  document.getElementById("cfgTelefono").value = state.company.telefono || "";
  document.getElementById("cfgEmail").value = state.company.email;
  document.getElementById("cfgEmail").disabled = true;
  document.getElementById("cfgDireccion").value = state.company.direccion || "";
  document.getElementById("cfgIva").value = state.company.ivaDefault;
  document.getElementById("cfgNumero").value = state.company.numeroSiguiente;
  logoPendiente = undefined;
  renderLogoPreview(state.company.logoUrl);
  actualizarMarca();
}

function renderLogoPreview(logoUrl) {
  const img = document.getElementById("logoPreviewImg");
  const placeholder = document.getElementById("logoPreviewPlaceholder");
  const btnQuitar = document.getElementById("btnQuitarLogo");
  if (logoUrl) {
    img.src = logoUrl;
    img.hidden = false;
    placeholder.hidden = true;
    btnQuitar.hidden = false;
  } else {
    img.hidden = true;
    placeholder.hidden = false;
    btnQuitar.hidden = true;
  }
}

// Redimensiona la imagen elegida a un cuadrado chico antes de guardarla,
// para no mandar fotos de varios MB como si fueran un logo.
function redimensionarImagen(file, maxSize = 200) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("El archivo no es una imagen válida"));
      img.onload = () => {
        const escala = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * escala);
        const h = Math.round(img.height * escala);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

document.getElementById("inputLogo").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const dataUrl = await redimensionarImagen(file);
    logoPendiente = dataUrl;
    renderLogoPreview(dataUrl);
  } catch (err) {
    showToast(err.message);
  }
  e.target.value = "";
});

document.getElementById("btnQuitarLogo").addEventListener("click", () => {
  logoPendiente = null;
  renderLogoPreview(null);
});

function actualizarMarca() {
  document.getElementById("empresaNombreTop").textContent = state.company?.nombre || "Presupuestos";
  const logoTop = document.getElementById("empresaLogoTop");
  const logoDefault = document.getElementById("logoMarkDefault");
  if (state.company?.logoUrl) {
    logoTop.src = state.company.logoUrl;
    logoTop.hidden = false;
    logoDefault.hidden = true;
  } else {
    logoTop.hidden = true;
    logoDefault.hidden = false;
  }
}

document.getElementById("btnGuardarConfig").addEventListener("click", async () => {
  const payload = {
    nombre: document.getElementById("cfgNombre").value.trim(),
    telefono: document.getElementById("cfgTelefono").value.trim(),
    direccion: document.getElementById("cfgDireccion").value.trim(),
    ivaDefault: parseFloat(document.getElementById("cfgIva").value) || 0,
    numeroSiguiente: parseInt(document.getElementById("cfgNumero").value) || 1,
  };
  if (logoPendiente !== undefined) payload.logoUrl = logoPendiente;

  const actualizado = await Api.put("/config", payload);
  state.company = { ...state.company, ...actualizado };
  logoPendiente = undefined;
  actualizarMarca();
  showToast("Configuración guardada");
});

function descargarArchivo(contenido, nombreArchivo, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------------------------------------------------------------------- */
/* Banner de prueba gratis                                                 */
/* ---------------------------------------------------------------------- */
function renderTrialBanner() {
  const banner = document.getElementById("trialBanner");
  const c = state.company;
  if (c.subscriptionStatus === "trialing" && c.trialEndsAt) {
    const dias = Math.max(0, Math.ceil((new Date(c.trialEndsAt) - new Date()) / (1000 * 60 * 60 * 24)));
    banner.hidden = false;
    banner.innerHTML = `Estás en período de prueba: te quedan ${dias} día(s). <a href="facturacion.html">Suscribite</a> para no perder acceso.`;
  } else if (c.subscriptionStatus !== "active") {
    banner.hidden = false;
    banner.innerHTML = `Tu suscripción no está activa. <a href="facturacion.html">Activala acá</a>.`;
  } else {
    banner.hidden = true;
  }
}

/* ---------------------------------------------------------------------- */
/* Inicio                                                                   */
/* ---------------------------------------------------------------------- */
async function init() {
  try {
    const [{ company }, { rubros }, { presupuestos }] = await Promise.all([
      Api.get("/auth/me"),
      Api.get("/rubros"),
      Api.get("/presupuestos"),
    ]);
    state.company = company;
    state.rubros = rubros;
    state.presupuestos = presupuestos;

    Api.setSession(Api.getToken(), company);
    actualizarMarca();
    renderTrialBanner();
    renderPresupuestos();
  } catch (err) {
    console.error(err);
  }
}

init();
