/* ============================================================
   api.js — Comunicación con el backend Django + PostGIS.
   Convierte el GeoJSON de la API al formato plano que usa el mapa,
   y maneja el inicio de sesión con token.
   ============================================================ */

const TOKEN_KEY = "mi_lapaz_token";

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || null;
}
function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

/* Cabeceras de cada petición (añade el token si hay sesión) */
function cabeceras(conJson = true) {
  const h = {};
  if (conJson) h["Content-Type"] = "application/json";
  const t = getToken();
  if (t) h["Authorization"] = "Token " + t;
  return h;
}

/* --------- Conversores entre GeoJSON (API) y objeto plano (mapa) --------- */

function featureAPlano(f) {
  const p = f.properties || {};
  const coords = (f.geometry && f.geometry.coordinates) || [-68.13, -16.50];
  return {
    id: f.id,
    titulo: p.titulo,
    direccion: p.direccion,
    operacion: p.operacion,
    tipo: p.tipo,
    condicion: p.condicion,
    distrito: p.distrito,
    precio: Number(p.precio),
    superficie: p.superficie,
    habitaciones: p.habitaciones,
    banos: p.banos,
    garajes: p.garajes,
    telefono: p.telefono,
    descripcion: p.descripcion,
    estado: p.estado,
    servicios: {
      agua: p.serv_agua, luz: p.serv_luz, gas: p.serv_gas,
      internet: p.serv_internet, seguridad: p.serv_seguridad,
    },
    propietario: p.propietario_nombre || "—",
    ownerId: p.propietario,
    lng: coords[0],
    lat: coords[1],
  };
}

function planoAFeature(d) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [d.lng, d.lat] },
    properties: {
      titulo: d.titulo,
      direccion: d.direccion,
      operacion: d.operacion,
      tipo: d.tipo,
      condicion: d.condicion,
      distrito: d.distrito,
      precio: d.precio,
      superficie: d.superficie,
      habitaciones: d.habitaciones,
      banos: d.banos,
      garajes: d.garajes,
      telefono: d.telefono,
      descripcion: d.descripcion,
      serv_agua: d.servicios.agua,
      serv_luz: d.servicios.luz,
      serv_gas: d.servicios.gas,
      serv_internet: d.servicios.internet,
      serv_seguridad: d.servicios.seguridad,
    },
  };
}

/* --------------------------- Objeto API --------------------------- */

const api = {
  hayToken() { return !!getToken(); },

  /* Inicia sesión. El "username" del backend es el correo. */
  async login(correo, password) {
    const r = await fetch(`${API_BASE}/api/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: correo, password }),
    });
    if (!r.ok) throw new Error("Correo o contraseña incorrectos.");
    const data = await r.json();
    setToken(data.token);
    return await this.yo();
  },

  /* Crea una cuenta y deja la sesión iniciada. */
  async registro({ nombre, correo, password, telefono, rol }) {
    const r = await fetch(`${API_BASE}/api/registro/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, correo, password, telefono, rol }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.correo ? "Ese correo ya está registrado." : "No se pudo crear la cuenta.");
    }
    const data = await r.json();
    setToken(data.token);
    return { nombre: data.nombre, correo: data.correo, rol: data.rol, telefono: telefono || "" };
  },

  /* Datos del usuario autenticado. */
  async yo() {
    const r = await fetch(`${API_BASE}/api/yo/`, { headers: cabeceras() });
    if (!r.ok) throw new Error("Sesión no válida.");
    return await r.json();   // {id, nombre, correo, rol, telefono}
  },

  logout() { setToken(null); },

  /* Lista todas las propiedades (devuelve objetos planos). */
  async propiedades() {
    const r = await fetch(`${API_BASE}/api/propiedades/?page_size=1000`, { headers: cabeceras(false) });
    if (!r.ok) throw new Error("No se pudieron cargar las propiedades.");
    const data = await r.json();
    const features = data.features || (data.results && data.results.features) || [];
    return features.map(featureAPlano);
  },

  /* Lista los servicios urbanos (colegios, hospitales, etc.). */
  async servicios() {
    const r = await fetch(`${API_BASE}/api/servicios/?page_size=1000`, { headers: cabeceras(false) });
    if (!r.ok) return [];
    const data = await r.json();
    const features = data.features || (data.results && data.results.features) || [];
    return features.map(f => ({
      categoria: f.properties.categoria,
      nombre: f.properties.nombre,
      lng: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    }));
  },

  async crearPropiedad(datos) {
    const r = await fetch(`${API_BASE}/api/propiedades/`, {
      method: "POST",
      headers: cabeceras(),
      body: JSON.stringify(planoAFeature(datos)),
    });
    if (!r.ok) throw new Error("No se pudo publicar la propiedad.");
    return featureAPlano(await r.json());
  },

  async actualizarPropiedad(id, datos) {
    const r = await fetch(`${API_BASE}/api/propiedades/${id}/`, {
      method: "PUT",
      headers: cabeceras(),
      body: JSON.stringify(planoAFeature(datos)),
    });
    if (!r.ok) throw new Error("No se pudieron guardar los cambios.");
    return featureAPlano(await r.json());
  },

  /* Cambia solo el estado (activa/vendida) con PATCH. */
  async cambiarEstado(id, estado) {
    const r = await fetch(`${API_BASE}/api/propiedades/${id}/`, {
      method: "PATCH",
      headers: cabeceras(),
      body: JSON.stringify({ properties: { estado } }),
    });
    if (!r.ok) throw new Error("No se pudo cambiar el estado.");
    return featureAPlano(await r.json());
  },

  async eliminarPropiedad(id) {
    const r = await fetch(`${API_BASE}/api/propiedades/${id}/`, {
      method: "DELETE",
      headers: cabeceras(false),
    });
    if (!r.ok && r.status !== 204) throw new Error("No se pudo eliminar.");
  },

  /* Favoritos: devuelve un mapa  propiedadId -> registroFavoritoId */
  async favoritos() {
    const r = await fetch(`${API_BASE}/api/favoritos/`, { headers: cabeceras() });
    if (!r.ok) return {};
    const data = await r.json();
    const lista = data.results || data;
    const mapa = {};
    lista.forEach(f => { mapa[f.propiedad] = f.id; });
    return mapa;
  },

  async agregarFavorito(propiedadId) {
    const r = await fetch(`${API_BASE}/api/favoritos/`, {
      method: "POST",
      headers: cabeceras(),
      body: JSON.stringify({ propiedad: propiedadId }),
    });
    if (!r.ok) throw new Error("No se pudo guardar el favorito.");
    return await r.json();   // {id, propiedad, creado}
  },

  async quitarFavorito(registroId) {
    await fetch(`${API_BASE}/api/favoritos/${registroId}/`, {
      method: "DELETE",
      headers: cabeceras(false),
    });
  },
};
