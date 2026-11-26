# Tramaly

App web estática (HTML/CSS/JS, sin dependencias) que convierte una imagen en una plantilla de cuentas
para **Telar, Punto cuadrado, Brick stitch y Peyote**.

## Qué hace
- Quita el fondo liso al subir la imagen (o a mano con varita y pincel).
- **Cuenta solo las cuentas que lleva la pieza**, con margen, gramos aproximados, paquetes y costo.
- Medida en cm o en cuentas, con medidas rápidas.
- Edición cuenta por cuenta (pintar, rellenar, borrar, deshacer) y cambio o eliminación de colores.
- "Mis colores": códigos, nombres y tonos propios; solo usa los marcados.
- Guía paso a paso con avance guardado y opción de pantalla siempre encendida.
- Proyectos guardados en el navegador, con copia descargable e importación entre equipos.
- Exporta imagen PNG, lista CSV e impresión/PDF (plantillas grandes en varias hojas).

## Probar en local
```bash
python3 -m http.server 8765   # y abrir http://localhost:8765
```

## Usuarios (login básico)
Las contraseñas se guardan como hash PBKDF2 en `js/users.js`. Para crear o cambiar un usuario:
```bash
node tools/make-user.mjs "usuario" "Nombre visible" "2027-12-31"
```
Pega la salida en `js/users.js`. La fecha es la expiración de la licencia. La sesión dura 8 h y hay bloqueo
temporal tras 5 intentos fallidos. Cada PNG/impresión lleva el nombre de la usuaria como marca de agua.

> Límite: al ser un sitio estático, el login disuade el uso casual pero no detiene a alguien técnico
> (el código llega al navegador). Para protección real hace falta un servidor con autenticación.

## Datos
Todo se guarda **solo en el navegador de cada equipo** (IndexedDB y localStorage). Si se borran los datos
del navegador, se pierden: descarga copias de los proyectos importantes desde "Mis proyectos".

## Colores
Los códigos `C01…C50` de `js/palette.js` son IDs internos y los tonos son aproximados; no son códigos
oficiales de Miyuki. Cada usuaria puede poner los reales en "Mis colores".

Gramos: se calculan con ~190 cuentas por gramo (Delica 11/0) y ~110 (rocalla 11/0); es una aproximación
editable en la app.

## Publicar
GitHub → Settings → Pages → Deploy from branch → `main` / root.
Al cambiar archivos, sube el número `?v=` en `index.html` para evitar la caché.
