/* ============================================================
   app.js — Mapa Inmobiliario La Paz (versión CONECTADA)
   Los datos vienen del backend Django + PostGIS a través de la
   API (GeoJSON). Ver config.js para la URL del servidor (API_BASE).
   ============================================================ */

/* =========================================================
   1. ESTADO EN MEMORIA (los datos vienen de la API)
   ========================================================= */
let propiedades     = [];     // objetos planos (ver api.js)
let serviciosUrbanos = [];     // {categoria, nombre, lat, lng}
let sesion          = null;    // {id, nombre, correo, rol, telefono} o null
let favoritos       = [];      // array de ids de propiedad
let favMap          = {};      // propiedadId -> id del registro favorito


/* =========================================================
   2. UTILIDADES
   ========================================================= */
const NOMBRE_OP = { venta: "Venta", alquiler: "Alquiler", anticretico: "Anticrético" };
const NOMBRE_TIPO = { casa: "Casa", departamento: "Departamento", terreno: "Terreno", local: "Local comercial" };
const NOMBRE_COND = { nueva: "Nueva", usada: "Usada", construccion: "En construcción" };

function fmtPrecio(p, op) {
  const n = "Bs " + Number(p).toLocaleString("es-BO");
  return op === "alquiler" ? n + " /mes" : n;
}
function avisar(txt) {
  const a = document.getElementById("aviso");
  a.textContent = txt; a.classList.add("visible");
  clearTimeout(a._t); a._t = setTimeout(() => a.classList.remove("visible"), 3400);
}
function distanciaKm(la1, lo1, la2, lo2) {
  const R = 6371, dLa = (la2-la1)*Math.PI/180, dLo = (lo2-lo1)*Math.PI/180;
  const a = Math.sin(dLa/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2;
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function $(id) { return document.getElementById(id); }


/* =========================================================
   3. MAPA
   ========================================================= */
const mapa = L.map("mapa", { zoomControl: true }).setView([-16.515, -68.110], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, attribution: "&copy; OpenStreetMap"
}).addTo(mapa);

const capaProps = L.layerGroup().addTo(mapa);
const capasServicio = {};   // categoria -> L.layerGroup
let marcadorYo = null;
const marcadoresPorId = {};

["colegio","hospital","supermercado","transporte","parque"].forEach(cat => {
  capasServicio[cat] = L.layerGroup();
});

// Rellena las capas de servicios urbanos con los datos de la API.
function construirMarcadoresServicio() {
  Object.values(capasServicio).forEach(c => c.clearLayers());
  serviciosUrbanos.forEach(s => {
    const cat = s.categoria;
    if (!capasServicio[cat]) return;
    L.marker([s.lat, s.lng], {
      icon: L.divIcon({ className: "", html: `<div class="pin-servicio">${ICONO_SERVICIO[cat]}</div>`, iconSize: [22,22], iconAnchor: [11,11] })
    }).bindPopup(`<b>${ICONO_SERVICIO[cat]} ${s.nombre}</b>`).addTo(capasServicio[cat]);
  });
}

function iconoPrecio(p) {
  const corto = p.precio >= 1000 ? Math.round(p.precio/1000) + "k" : p.precio;
  return L.divIcon({ className: "", html: `<div class="pin-precio ${p.operacion}">Bs ${corto}</div>`, iconSize: [0,0], iconAnchor: [0,0] });
}
function popupBreve(p) {
  return `<div class="pop">
    <h3>${p.titulo}</h3>
    <div class="pp">${fmtPrecio(p.precio, p.operacion)}</div>
    <button class="boton boton-acento" onclick="abrirDetalle(${p.id})">Ver detalle</button>
  </div>`;
}


/* =========================================================
   4. FILTROS, BÚSQUEDA, LISTA Y ESTADÍSTICAS
   ========================================================= */
function leerFiltros() {
  return {
    texto: ($("busqueda").value || "").trim().toLowerCase(),
    operacion: $("f-operacion").value,
    tipo: $("f-tipo").value,
    distrito: $("f-distrito").value,
    condicion: $("f-condicion").value,
    hab: parseInt($("f-hab").value) || 0,
    ban: parseInt($("f-ban").value) || 0,
    min: parseFloat($("f-min").value) || 0,
    max: parseFloat($("f-max").value) || Infinity
  };
}
function filtrar(lista) {
  const f = leerFiltros();
  return lista.filter(p => {
    if (p.estado === "inactiva") return false;
    if (f.texto && !(`${p.titulo} ${p.direccion}`.toLowerCase().includes(f.texto))) return false;
    if (f.operacion && p.operacion !== f.operacion) return false;
    if (f.tipo && p.tipo !== f.tipo) return false;
    if (f.distrito && p.distrito !== f.distrito) return false;
    if (f.condicion && p.condicion !== f.condicion) return false;
    if (f.hab && p.habitaciones < f.hab) return false;
    if (f.ban && p.banos < f.ban) return false;
    if (p.precio < f.min || p.precio > f.max) return false;
    return true;
  });
}

let ultimaLista = [];

function refrescar() {
  const v = filtrar(propiedades);
  ultimaLista = v;
  dibujarMarcadores(v);
  dibujarLista(v);
  estadisticas(v);
}

function dibujarMarcadores(lista) {
  capaProps.clearLayers();
  for (const k in marcadoresPorId) delete marcadoresPorId[k];
  lista.forEach(p => {
    const m = L.marker([p.lat, p.lng], { icon: iconoPrecio(p) }).bindPopup(popupBreve(p));
    m.addTo(capaProps);
    marcadoresPorId[p.id] = m;
  });
}

function tarjetaHTML(p) {
  return `<article class="item ${p.operacion}" data-id="${p.id}">
    <div class="item-top">
      <h3>${p.titulo}</h3>
      <span class="etiqueta ${p.operacion}">${NOMBRE_OP[p.operacion]}</span>
    </div>
    <div class="precio">${fmtPrecio(p.precio, p.operacion)}</div>
    <div class="meta">
      <span>🏷️ ${NOMBRE_TIPO[p.tipo]}</span>
      ${p.superficie ? `<span>📐 ${p.superficie} m²</span>` : ""}
      ${p.habitaciones ? `<span>🛏️ ${p.habitaciones}</span>` : ""}
      ${p.banos ? `<span>🚿 ${p.banos}</span>` : ""}
      <span>📍 ${p.distrito}</span>
    </div>
    ${p.estado === "vendida" ? `<span class="estado-vendida">Vendida</span>` : ""}
  </article>`;
}

function dibujarLista(lista) {
  const cont = $("lista");
  $("contador").textContent = lista.length + (lista.length === 1 ? " resultado" : " resultados");
  if (lista.length === 0) {
    cont.innerHTML = `<div class="lista-vacia">No hay propiedades con esos filtros.<br>Prueba ampliando el precio o cambiando el distrito.</div>`;
    return;
  }
  cont.innerHTML = lista.map(tarjetaHTML).join("");
  cont.querySelectorAll(".item").forEach(el => {
    el.addEventListener("click", () => abrirDetalle(parseInt(el.dataset.id)));
  });
}

function estadisticas(lista) {
  const c = { venta:0, alquiler:0, anticretico:0 };
  lista.forEach(p => { if (c[p.operacion] != null) c[p.operacion]++; });
  $("st-venta").textContent = c.venta;
  $("st-alquiler").textContent = c.alquiler;
  $("st-anticretico").textContent = c.anticretico;
  const prom = op => {
    const g = lista.filter(p => p.operacion === op);
    if (!g.length) return null;
    return Math.round(g.reduce((s,p)=>s+p.precio,0)/g.length);
  };
  const partes = [];
  if (prom("venta")) partes.push(`Venta <b>Bs ${prom("venta").toLocaleString("es-BO")}</b>`);
  if (prom("alquiler")) partes.push(`Alquiler <b>Bs ${prom("alquiler").toLocaleString("es-BO")}/mes</b>`);
  if (prom("anticretico")) partes.push(`Anticrético <b>Bs ${prom("anticretico").toLocaleString("es-BO")}</b>`);
  $("promedio").innerHTML = partes.length ? "Promedio — " + partes.join(" · ") : "Sin datos.";
}

function poblarDistritos() {
  ["f-distrito"].forEach(id => {
    const sel = $(id); const actual = sel.value;
    sel.innerHTML = '<option value="">Todos</option>' + DISTRITOS.map(d=>`<option value="${d}">${d}</option>`).join("");
    sel.value = actual;
  });
}

function construirCapasUrbanas() {
  const cont = $("capas-urbanas");
  cont.innerHTML = Object.keys(NOMBRE_SERVICIO).map(cat => `
    <label class="capa">
      <input type="checkbox" data-cat="${cat}">
      <span>${ICONO_SERVICIO[cat]} ${NOMBRE_SERVICIO[cat]}</span>
    </label>`).join("");
  cont.querySelectorAll("input").forEach(chk => {
    chk.addEventListener("change", () => {
      const cat = chk.dataset.cat;
      if (chk.checked) capasServicio[cat].addTo(mapa);
      else mapa.removeLayer(capasServicio[cat]);
    });
  });
}


/* =========================================================
   5. DETALLE DE PROPIEDAD
   ========================================================= */
const iconoTipo = { casa: "🏡", departamento: "🏢", terreno: "🌄", local: "🏬" };

function abrirDetalle(id) {
  const p = propiedades.find(x => x.id === id);
  if (!p) return;
  const esFav = favoritos.includes(id);
  const servicios = Object.entries(p.servicios || {}).filter(([k,v]) => v)
    .map(([k]) => `<span class="servicio-chip">✓ ${k.charAt(0).toUpperCase()+k.slice(1)}</span>`).join("");
  const waTexto = encodeURIComponent(`Hola, me interesa la propiedad "${p.titulo}" (${fmtPrecio(p.precio, p.operacion)}). ¿Sigue disponible?`);

  $("detalle-contenido").innerHTML = `
    <div class="det-foto">${iconoTipo[p.tipo] || "🏠"}</div>
    <div class="det-cuerpo">
      <span class="det-tag ${p.operacion}">${NOMBRE_OP[p.operacion]} · ${NOMBRE_COND[p.condicion] || ""}</span>
      <h2>${p.titulo}</h2>
      <div class="det-dir">📍 ${p.direccion} — ${p.distrito}, La Paz</div>
      <div class="det-precio">${fmtPrecio(p.precio, p.operacion)}</div>

      <div class="det-iconos">
        <div><b>${p.superficie || "—"}</b> m²</div>
        <div><b>${p.habitaciones || 0}</b> habitaciones</div>
        <div><b>${p.banos || 0}</b> baños</div>
        <div><b>${p.garajes || 0}</b> garajes</div>
        <div><b>${NOMBRE_TIPO[p.tipo]}</b></div>
      </div>

      <p class="det-desc">${p.descripcion || ""}</p>
      ${servicios ? `<div class="det-servicios">${servicios}</div>` : ""}
      <div class="det-vendedor">Publicado por <b>${p.propietario}</b></div>

      <div class="det-acciones">
        <a class="boton boton-whatsapp" href="https://wa.me/${p.telefono}?text=${waTexto}" target="_blank" rel="noopener">📱 Contactar por WhatsApp</a>
        <button class="boton boton-fav ${esFav?'activo':''}" id="det-fav" data-id="${id}">${esFav ? "❤️ En favoritos" : "🤍 Agregar a favoritos"}</button>
        <button class="boton boton-contexto" id="det-contexto" data-id="${id}">🗺️ Ver contexto urbano</button>
      </div>
    </div>`;

  $("det-fav").addEventListener("click", async () => { await alternarFavorito(id); abrirDetalle(id); });
  $("det-contexto").addEventListener("click", () => verContextoUrbano(p));
  abrirModal("modal-detalle");
}

function verContextoUrbano(p) {
  cerrarModales();
  Object.keys(capasServicio).forEach(cat => {
    capasServicio[cat].addTo(mapa);
    const chk = document.querySelector(`#capas-urbanas input[data-cat="${cat}"]`);
    if (chk) chk.checked = true;
  });
  mapa.setView([p.lat, p.lng], 15);
  if (marcadoresPorId[p.id]) marcadoresPorId[p.id].openPopup();
  avisar("Mostrando servicios cercanos (colegios, hospitales, transporte…).");
}


/* =========================================================
   6. FAVORITOS (RF-09)
   ========================================================= */
async function alternarFavorito(id) {
  if (!sesion) { avisar("Inicia sesión para guardar favoritos."); abrirModal("modal-login"); return; }
  try {
    if (favoritos.includes(id)) {
      await api.quitarFavorito(favMap[id]);
      favoritos = favoritos.filter(x => x !== id);
      delete favMap[id];
    } else {
      const reg = await api.agregarFavorito(id);
      favoritos.push(id);
      favMap[id] = reg.id;
    }
    actualizarBadgeFav();
    if (!$("vista-panel").hidden) renderFavoritos();
  } catch (e) {
    avisar("No se pudo actualizar el favorito.");
  }
}
function actualizarBadgeFav() { $("badge-fav").textContent = favoritos.length; }


/* =========================================================
   7. "CERCA DE MÍ" (RF-07, radio 5 km)
   ========================================================= */
$("btn-cerca").addEventListener("click", () => {
  if (!navigator.geolocation) { avisar("Tu navegador no permite geolocalización."); return; }
  avisar("Buscando tu ubicación…");
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: la, longitude: lo } = pos.coords;
    if (marcadorYo) mapa.removeLayer(marcadorYo);
    marcadorYo = L.marker([la,lo], { icon: L.divIcon({ className:"", html:'<div class="marcador-yo"></div>', iconSize:[18,18] }) })
      .addTo(mapa).bindPopup("Estás aquí").openPopup();
    L.circle([la,lo], { radius: 5000, color: "#2563c9", fillColor: "#2563c9", fillOpacity: .07 }).addTo(capaProps);
    mapa.setView([la,lo], 13);

    const cercanas = ultimaLista
      .map(p => ({ ...p, _d: distanciaKm(la,lo,p.lat,p.lng) }))
      .filter(p => p._d <= 5)
      .sort((a,b)=>a._d-b._d);
    dibujarLista(cercanas);
    avisar(cercanas.length ? `${cercanas.length} propiedad(es) dentro de 5 km, ordenadas por cercanía.` : "No hay propiedades dentro de 5 km.");
  }, () => avisar("No se pudo obtener tu ubicación (permiso denegado)."), { enableHighAccuracy:true, timeout:8000 });
});


/* =========================================================
   8. AUTENTICACIÓN (RF-10) — contra la API
   ========================================================= */
function abrirModal(id) { cerrarModales(); $(id).classList.add("visible"); }
function cerrarModales() { document.querySelectorAll(".fondo-modal").forEach(m => m.classList.remove("visible")); }

document.querySelectorAll("[data-cerrar]").forEach(b => b.addEventListener("click", cerrarModales));
document.querySelectorAll(".fondo-modal").forEach(m => m.addEventListener("click", e => { if (e.target === m) cerrarModales(); }));

$("btn-login").addEventListener("click", () => abrirModal("modal-login"));
$("ir-registro").addEventListener("click", () => abrirModal("modal-registro"));
$("ir-login").addEventListener("click", () => abrirModal("modal-login"));

$("btn-entrar").addEventListener("click", async () => {
  const correo = $("login-correo").value.trim().toLowerCase();
  const pass = $("login-pass").value;
  $("login-error").textContent = "Entrando…";
  try {
    sesion = await api.login(correo, pass);
    favMap = await api.favoritos();
    favoritos = Object.keys(favMap).map(Number);
    $("login-error").textContent = ""; $("login-pass").value = "";
    cerrarModales(); aplicarSesion(); avisar(`Bienvenido, ${sesion.nombre}.`);
  } catch (e) {
    $("login-error").textContent = e.message || "No se pudo iniciar sesión.";
  }
});

$("btn-registrar").addEventListener("click", async () => {
  const nombre = $("reg-nombre").value.trim();
  const correo = $("reg-correo").value.trim().toLowerCase();
  const tel = $("reg-tel").value.trim();
  const pass = $("reg-pass").value;
  const rol = $("reg-rol").value;
  if (!nombre || !correo || !pass) { $("reg-error").textContent = "Completa nombre, correo y contraseña."; return; }
  $("reg-error").textContent = "Creando cuenta…";
  try {
    sesion = await api.registro({ nombre, correo, password: pass, telefono: tel || "59100000000", rol });
    sesion = await api.yo();   // obtiene id, rol y demás datos completos
    favMap = {}; favoritos = [];
    $("reg-error").textContent = "";
    ["reg-nombre","reg-correo","reg-tel","reg-pass"].forEach(id => $(id).value = "");
    cerrarModales(); aplicarSesion(); avisar(`Cuenta creada. Bienvenido, ${sesion.nombre}.`);
  } catch (e) {
    $("reg-error").textContent = e.message || "No se pudo crear la cuenta.";
  }
});

$("btn-logout").addEventListener("click", () => {
  api.logout();
  sesion = null; favoritos = []; favMap = {};
  cambiarVista("explorar"); aplicarSesion(); avisar("Sesión cerrada.");
});

function aplicarSesion() {
  const puedePublicar = sesion && ["propietario","inmobiliaria","admin"].includes(sesion.rol);
  $("zona-sesion").hidden = !!sesion;
  $("zona-usuario").hidden = !sesion;
  $("nav-panel").hidden = !puedePublicar;
  if (sesion) {
    $("nombre-usuario").textContent = sesion.nombre;
    $("avatar-usuario").textContent = sesion.nombre.charAt(0).toUpperCase();
    $("rol-usuario").textContent = sesion.rol;
  }
  actualizarBadgeFav();
}


/* =========================================================
   9. CAMBIO DE VISTA (Explorar / Panel)
   ========================================================= */
function cambiarVista(v) {
  $("vista-explorar").hidden = v !== "explorar";
  $("vista-panel").hidden = v !== "panel";
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("activo", b.dataset.vista === v));
  if (v === "explorar") setTimeout(() => mapa.invalidateSize(), 60);
  if (v === "panel") renderPanel();
}
document.querySelectorAll(".nav-btn").forEach(b => b.addEventListener("click", () => {
  if (b.dataset.vista === "panel" && !sesion) { abrirModal("modal-login"); return; }
  cambiarVista(b.dataset.vista);
}));

$("btn-favoritos").addEventListener("click", () => {
  if (!sesion) { abrirModal("modal-login"); return; }
  cambiarVista("panel"); activarPane("favoritos");
});


/* =========================================================
   10. PANEL: dashboard, mis propiedades, publicar, favoritos
   ========================================================= */
document.querySelectorAll(".menu-item").forEach(b => b.addEventListener("click", () => activarPane(b.dataset.pane)));

function activarPane(pane) {
  document.querySelectorAll(".menu-item").forEach(b => b.classList.toggle("activo", b.dataset.pane === pane));
  ["dashboard","mis","publicar","favoritos"].forEach(p => $("pane-"+p).hidden = p !== pane);
  if (pane === "dashboard") renderDashboard();
  if (pane === "mis") renderMisPropiedades();
  if (pane === "publicar") renderFormulario(null);
  if (pane === "favoritos") renderFavoritos();
}

function propiedadesDeUsuario() {
  if (!sesion) return [];
  if (sesion.rol === "admin") return propiedades;
  return propiedades.filter(p => p.ownerId === sesion.id);
}

function renderPanel() { renderDashboard(); activarPane("dashboard"); }

function renderDashboard() {
  const mias = propiedadesDeUsuario();
  $("dp-pub").textContent = mias.length;
  $("dp-act").textContent = mias.filter(p => p.estado === "activa").length;
  $("dp-ven").textContent = mias.filter(p => p.estado === "vendida").length;
  $("dp-fav").textContent = favoritos.length;
}

function renderMisPropiedades() {
  const mias = propiedadesDeUsuario();
  const tb = $("tabla-mis");
  if (!mias.length) { tb.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--texto-2);padding:24px">Aún no tienes propiedades publicadas.</td></tr>`; return; }
  tb.innerHTML = mias.map((p,i) => `
    <tr>
      <td>${i+1}</td>
      <td>${p.titulo}</td>
      <td><span class="tbl-tag ${p.operacion}">${NOMBRE_OP[p.operacion]}</span></td>
      <td>${fmtPrecio(p.precio, p.operacion)}</td>
      <td><span class="estado-pill ${p.estado}">${p.estado.charAt(0).toUpperCase()+p.estado.slice(1)}</span></td>
      <td>
        <button class="acc-btn" onclick="editarPropiedad(${p.id})">✏️ Editar</button>
        <button class="acc-btn" onclick="alternarVendida(${p.id})">${p.estado==='vendida'?'↩️ Activar':'✅ Vendida'}</button>
        <button class="acc-btn eliminar" onclick="eliminarPropiedad(${p.id})">🗑️ Eliminar</button>
      </td>
    </tr>`).join("");
}

function renderFavoritos() {
  const cont = $("lista-favoritos");
  const favs = propiedades.filter(p => favoritos.includes(p.id));
  if (!favs.length) { cont.innerHTML = `<div class="lista-vacia">No tienes propiedades en favoritos.<br>Marca el ❤️ en el detalle de una propiedad.</div>`; return; }
  cont.innerHTML = favs.map(tarjetaHTML).join("");
  cont.querySelectorAll(".item").forEach(el => el.addEventListener("click", () => abrirDetalle(parseInt(el.dataset.id))));
}


/* =========================================================
   11. CRUD DE PROPIEDADES (RF-11) — contra la API
   ========================================================= */
let miniMapa = null, miniMarcador = null, coordForm = null, editandoId = null;

function renderFormulario(prop) {
  editandoId = prop ? prop.id : null;
  coordForm = prop ? { lat: prop.lat, lng: prop.lng } : null;
  $("titulo-publicar").textContent = prop ? "Editar propiedad" : "Publicar nueva propiedad";
  const s = prop ? prop.servicios : {};
  const val = (k, d="") => prop ? (prop[k] ?? d) : d;

  $("form-publicar").innerHTML = `
    <div class="form-rejilla">
      <div class="campo ancho-total"><label>Título</label>
        <input id="p-titulo" value="${val('titulo')}" placeholder="Ej: Departamento en Sopocachi"></div>
      <div class="campo ancho-total"><label>Dirección</label>
        <input id="p-direccion" value="${val('direccion')}" placeholder="Calle / Av. y número"></div>

      <div class="campo"><label>Transacción</label>
        <select id="p-operacion">
          ${["venta","alquiler","anticretico"].map(o=>`<option value="${o}" ${val('operacion')===o?'selected':''}>${NOMBRE_OP[o]}</option>`).join("")}
        </select></div>
      <div class="campo"><label>Tipo</label>
        <select id="p-tipo">
          ${["casa","departamento","terreno","local"].map(o=>`<option value="${o}" ${val('tipo')===o?'selected':''}>${NOMBRE_TIPO[o]}</option>`).join("")}
        </select></div>

      <div class="campo"><label>Estado</label>
        <select id="p-condicion">
          ${["nueva","usada","construccion"].map(o=>`<option value="${o}" ${val('condicion')===o?'selected':''}>${NOMBRE_COND[o]}</option>`).join("")}
        </select></div>
      <div class="campo"><label>Distrito</label>
        <select id="p-distrito">${DISTRITOS.map(d=>`<option value="${d}" ${val('distrito')===d?'selected':''}>${d}</option>`).join("")}</select></div>

      <div class="campo"><label>Precio (Bs)</label>
        <input type="number" id="p-precio" value="${val('precio')}" min="0"></div>
      <div class="campo"><label>Superficie (m²)</label>
        <input type="number" id="p-superficie" value="${val('superficie')}" min="0"></div>

      <div class="campo"><label>Habitaciones</label>
        <input type="number" id="p-hab" value="${val('habitaciones')}" min="0"></div>
      <div class="campo"><label>Baños</label>
        <input type="number" id="p-ban" value="${val('banos')}" min="0"></div>

      <div class="campo"><label>Garajes</label>
        <input type="number" id="p-gar" value="${val('garajes')}" min="0"></div>
      <div class="campo"><label>WhatsApp (591…)</label>
        <input id="p-tel" value="${val('telefono', sesion?sesion.telefono:'')}" placeholder="59171234567"></div>

      <div class="campo ancho-total"><label>Descripción</label>
        <input id="p-desc" value="${val('descripcion')}" placeholder="Detalles del inmueble"></div>

      <div class="campo ancho-total"><label>Servicios</label>
        <div class="form-servicios">
          ${["agua","luz","gas","internet","seguridad"].map(sv=>`
            <label><input type="checkbox" id="sv-${sv}" ${s&&s[sv]?'checked':''}> ${sv.charAt(0).toUpperCase()+sv.slice(1)}</label>`).join("")}
        </div></div>

      <div class="campo ancho-total"><label>Ubicación (haz clic en el mapa)</label>
        <div id="mini-mapa"></div></div>
      <div class="pista-coord ancho-total" id="p-coord">${coordForm ? `Ubicación: <b>${coordForm.lat.toFixed(5)}, ${coordForm.lng.toFixed(5)}</b>` : 'Haz clic en el mapa para fijar la ubicación. Por defecto: centro de La Paz.'}</div>

      <div class="form-acciones">
        <button class="boton boton-borrar" onclick="activarPane('mis')">Cancelar</button>
        <button class="boton boton-acento" id="btn-guardar-prop">${prop?'Guardar cambios':'Publicar propiedad'}</button>
      </div>
    </div>`;

  $("btn-guardar-prop").addEventListener("click", guardarPropiedad);
  iniciarMiniMapa(coordForm);
}

function iniciarMiniMapa(coord) {
  if (miniMapa) { miniMapa.remove(); miniMapa = null; miniMarcador = null; }
  const centro = coord ? [coord.lat, coord.lng] : [-16.515, -68.110];
  miniMapa = L.map("mini-mapa").setView(centro, coord ? 15 : 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(miniMapa);
  if (coord) miniMarcador = L.marker(centro).addTo(miniMapa);
  miniMapa.on("click", e => {
    coordForm = { lat: e.latlng.lat, lng: e.latlng.lng };
    if (miniMarcador) miniMarcador.setLatLng(e.latlng); else miniMarcador = L.marker(e.latlng).addTo(miniMapa);
    $("p-coord").innerHTML = `Ubicación: <b>${coordForm.lat.toFixed(5)}, ${coordForm.lng.toFixed(5)}</b>`;
  });
  setTimeout(() => miniMapa.invalidateSize(), 80);
}

async function guardarPropiedad() {
  const titulo = $("p-titulo").value.trim();
  const precio = parseFloat($("p-precio").value);
  if (!titulo) { avisar("Escribe un título."); return; }
  if (!precio || precio <= 0) { avisar("Indica un precio válido."); return; }
  const lat = coordForm ? coordForm.lat : -16.500;
  const lng = coordForm ? coordForm.lng : -68.130;

  const datos = {
    titulo,
    direccion: $("p-direccion").value.trim() || "Sin dirección",
    operacion: $("p-operacion").value,
    tipo: $("p-tipo").value,
    condicion: $("p-condicion").value,
    distrito: $("p-distrito").value,
    precio,
    superficie: parseInt($("p-superficie").value) || 0,
    habitaciones: parseInt($("p-hab").value) || 0,
    banos: parseInt($("p-ban").value) || 0,
    garajes: parseInt($("p-gar").value) || 0,
    telefono: $("p-tel").value.trim() || "59100000000",
    descripcion: $("p-desc").value.trim(),
    servicios: {
      agua: $("sv-agua").checked, luz: $("sv-luz").checked, gas: $("sv-gas").checked,
      internet: $("sv-internet").checked, seguridad: $("sv-seguridad").checked
    },
    lat, lng
  };

  $("btn-guardar-prop").disabled = true;
  try {
    if (editandoId) {
      await api.actualizarPropiedad(editandoId, datos);
      avisar("Cambios guardados.");
    } else {
      await api.crearPropiedad(datos);
      avisar("Propiedad publicada.");
    }
    await cargarPropiedades();
    poblarDistritos();
    refrescar();
    activarPane("mis");
  } catch (e) {
    avisar(e.message || "No se pudo guardar.");
    $("btn-guardar-prop").disabled = false;
  }
}

function editarPropiedad(id) {
  const p = propiedades.find(x => x.id === id);
  if (!p) return;
  activarPane("publicar");
  renderFormulario(p);
}
async function alternarVendida(id) {
  const p = propiedades.find(x => x.id === id);
  if (!p) return;
  const nuevo = p.estado === "vendida" ? "activa" : "vendida";
  try {
    await api.cambiarEstado(id, nuevo);
    await cargarPropiedades();
    refrescar(); renderMisPropiedades(); renderDashboard();
  } catch (e) { avisar("No se pudo cambiar el estado."); }
}
async function eliminarPropiedad(id) {
  if (!confirm("¿Eliminar esta propiedad? Esta acción no se puede deshacer.")) return;
  try {
    await api.eliminarPropiedad(id);
    favoritos = favoritos.filter(f => f !== id);
    await cargarPropiedades();
    refrescar(); renderMisPropiedades(); renderDashboard(); actualizarBadgeFav();
    avisar("Propiedad eliminada.");
  } catch (e) { avisar("No se pudo eliminar."); }
}
// expone funciones usadas desde HTML inline
window.abrirDetalle = abrirDetalle;
window.editarPropiedad = editarPropiedad;
window.alternarVendida = alternarVendida;
window.eliminarPropiedad = eliminarPropiedad;
window.activarPane = activarPane;


/* =========================================================
   12. EVENTOS DE FILTROS Y ARRANQUE
   ========================================================= */
["f-operacion","f-tipo","f-distrito","f-condicion","f-hab","f-ban","f-min","f-max","busqueda"].forEach(id => {
  const el = $(id);
  el.addEventListener("change", refrescar);
  el.addEventListener("input", refrescar);
});
$("btn-limpiar").addEventListener("click", () => {
  ["f-operacion","f-tipo","f-distrito","f-condicion","f-hab","f-ban","f-min","f-max","busqueda"].forEach(id => $(id).value = "");
  refrescar(); mapa.setView([-16.515,-68.110], 12);
});
$("btn-nueva-desde-panel").addEventListener("click", () => activarPane("publicar"));


/* ------------------ Carga de datos desde la API ------------------ */
async function cargarPropiedades() {
  propiedades = await api.propiedades();
}
async function cargarServicios() {
  serviciosUrbanos = await api.servicios();
  construirMarcadoresServicio();
}

async function iniciar() {
  poblarDistritos();
  construirCapasUrbanas();

  // Si hay una sesión guardada (token), intenta recuperarla.
  if (api.hayToken()) {
    try {
      sesion = await api.yo();
      favMap = await api.favoritos();
      favoritos = Object.keys(favMap).map(Number);
    } catch (e) {
      api.logout(); sesion = null;
    }
  }
  aplicarSesion();

  try {
    await Promise.all([cargarPropiedades(), cargarServicios()]);
    refrescar();
    avisar("Bienvenido al Mapa Inmobiliario de La Paz.");
  } catch (e) {
    avisar("No se pudo conectar con el servidor. Revisa API_BASE en config.js o espera a que el backend despierte (~30s) y recarga.");
    console.error(e);
  }
}

iniciar();
