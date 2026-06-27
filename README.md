# Mapa Inmobiliario La Paz — Frontend CONECTADO al backend

Esta versión del sitio web **lee y escribe los datos desde tu API Django + PostGIS**
(ya no usa datos locales). El mapa, los filtros, el login, los favoritos y la
publicación de propiedades funcionan contra el servidor real.

## ⚙️ Lo ÚNICO que debes configurar
Abre `js/config.js` y cambia la primera línea por la URL de tu backend en Render:

    const API_BASE = "https://TU-BACKEND.onrender.com";

(sin barra "/" al final). Guarda y listo.

## Archivos
- `index.html` — página principal
- `css/estilos.css` — estilos
- `js/config.js` — **URL del backend** y constantes de presentación
- `js/api.js` — comunicación con la API (login, propiedades, favoritos…)
- `js/app.js` — interfaz (mapa, filtros, panel) usando la API

## Cuentas de prueba (creadas por el backend)
- propietario@demo.com / 1234
- inmobiliaria@demo.com / 1234
- admin@demo.com / 1234

## Notas
- El backend ya permite el acceso desde cualquier origen (CORS abierto).
- Si al abrir el sitio ves el aviso "No se pudo conectar con el servidor":
  revisa que `API_BASE` sea correcta y que el backend esté despierto
  (el plan gratis de Render se duerme tras 15 min; la primera carga tarda ~30s).

Las instrucciones paso a paso de despliegue están en el mensaje del chat.
