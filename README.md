# Tramaly

App web estática (HTML/CSS/JS, sin dependencias) que convierte una imagen en una plantilla de cuentas Miyuki:
técnicas **Telar, Punto cuadrado, Brick stitch y Peyote**, colores con cantidades, plantilla con símbolos,
instrucciones paso a paso con seguimiento, y exportación PNG / PDF (imprimir) / CSV.

## Probar en local
```bash
python3 -m http.server 8765   # y abrir http://localhost:8765
```

## Usuarios (login básico)
Las contraseñas se guardan como hash PBKDF2 en `js/users.js`. Para crear o cambiar un usuario:
```bash
node tools/make-user.mjs "usuario" "Nombre visible" "2027-12-31"
```
Pega la salida en `js/users.js`. La fecha es la expiración de la licencia. La sesión dura 8 h y hay bloqueo tras 5 intentos fallidos.
Cada PNG/impresión lleva el nombre de la usuaria como marca de agua.

> Límite: al ser un sitio estático, el login disuade el uso casual pero no detiene a alguien técnico
> (el código llega al navegador). Para protección real hace falta un servidor con autenticación.

## Paleta
`js/palette.js`: los códigos `C01…C50` son IDs internos y los hex son aproximados. Reemplázalos por los códigos
oficiales de Miyuki (p. ej. `DB0010`) y ajusta nombres/colores con tu carta física.

## Publicar en GitHub Pages
Settings → Pages → Deploy from branch → `main` / root. (Pages en repos privados requiere plan de pago de GitHub.)
