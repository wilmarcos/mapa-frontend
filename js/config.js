/* ============================================================
   config.js — CONFIGURACIÓN DEL SITIO
   ============================================================ */

/* ⬇️⬇️⬇️  ÚNICA LÍNEA QUE DEBES CAMBIAR  ⬇️⬇️⬇️
   Pega aquí la URL de TU backend en Render (sin barra final).
   Ejemplo: "https://mapa-backend.onrender.com"
   Mientras pruebas en tu PC con el backend local, usa:
   "http://127.0.0.1:8000"
*/
const API_BASE = "https://mapa-backend-j71j.onrender.com";

/* ⬆️⬆️⬆️  NO HACE FALTA TOCAR NADA MÁS ABAJO  ⬆️⬆️⬆️ */


/* Colores por tipo de operación (Venta/Alquiler/Anticrético) */
const COLOR_OPERACION = {
  venta:       "#2563c9",
  alquiler:    "#1f9d57",
  anticretico: "#e0a51e",
};

/* Distritos disponibles en los filtros y el formulario */
const DISTRITOS = [
  "Centro", "Sopocachi", "Miraflores", "San Pedro",
  "Calacoto", "Obrajes", "Cota Cota", "Achumani",
  "Irpavi", "Mallasa", "Villa Fátima",
];

/* Iconos y nombres de las capas de servicios urbanos */
const ICONO_SERVICIO = {
  colegio: "🏫", hospital: "🏥", supermercado: "🛒", transporte: "🚡", parque: "🌳",
};
const NOMBRE_SERVICIO = {
  colegio: "Colegios", hospital: "Hospitales", supermercado: "Supermercados",
  transporte: "Transporte", parque: "Parques",
};
