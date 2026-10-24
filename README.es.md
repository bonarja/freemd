# openmd

[English](./README.md) · **Español**

Una app de notas en markdown *local-first* que vive en tu máquina. Un comando y estás editando notas en tu navegador — interfaz dark limpia, vista previa en vivo, imágenes por nota y exportación a PDF o Word en un click.

```bash
npx openmd
```

Eso es todo: crea `~/openmd` si no existe, levanta un servidor local en [http://localhost:5813](http://localhost:5813) y abre tu navegador.

## Por qué openmd

- **Tus notas son archivos simples.** Todo es markdown en tu propio disco: sin cuentas, sin nube, sin ataduras. Puedes respaldarlas, sincronizarlas o buscarlas con grep.
- **Las notas llevan sus propias imágenes.** Cada nota es una carpeta, así que capturas y adjuntos viajan con la nota y siguen funcionando si la mueves.
- **Pensada para escribir.** Editor sin distracciones, vista renderizada, o ambas en paralelo.
- **Exportación con buena pinta.** PDF y `.docx` con tema claro, código resaltado e imágenes incrustadas.

## Requisitos

Node.js 18 o superior. Nada más.

## Uso

```bash
npx openmd [opciones]
```

| Opción | Descripción |
| --- | --- |
| `-p, --port <n>` | Puerto del servidor (por defecto `5813`) |
| `-d, --dir <ruta>` | Carpeta de notas (por defecto `~/openmd`) |
| `-H, --host <addr>` | Escuchar en otra interfaz; sin valor usa `0.0.0.0` (toda la red local) |
| `--no-open` | No abrir el navegador automáticamente |
| `-v, --version` | Mostrar versión |
| `-h, --help` | Mostrar ayuda |

También funcionan las variables de entorno `OPENMD_PORT`, `OPENMD_DIR` y `OPENMD_HOST`.

### Acceder desde otros dispositivos

```bash
npx openmd --host
```

Expone la app en tu red local e imprime la URL de cada interfaz de red, p. ej. `http://192.168.1.20:5813` — ábrela desde tu teléfono, tablet u otro ordenador.

> ⚠️ No hay autenticación. Cualquier equipo de tu red puede acceder a la app, así que usa `--host` solo en redes de confianza.

## Cómo se guardan tus notas

Todo vive en una carpeta (por defecto `~/openmd`):

```
~/openmd
├── viaje-a-japon-md
│   ├── index.md        ← la nota en sí
│   ├── dia-1.png       ← sus imágenes y adjuntos
│   └── recibo.pdf
├── recetas-md
│   └── index.md
├── trabajo             ← una carpeta normal (organiza como quieras)
│   └── notas-md
│       └── index.md
└── leeme.md           ← los .md sueltos también funcionan
```

- Una **nota** es una carpeta terminada en `-md` cuyo contenido vive en `index.md`. La carpeta `-md` es lo que mantiene las imágenes de la nota junto a su texto — en la app nunca verás la carpeta, solo `viaje-a-japon.md`.
- Referencia las imágenes con rutas relativas normales: `![mapa](./dia-1.png)`.

## La app

- **Sidebar** — tus notas y carpetas. Al pasar el cursor sobre un elemento aparecen renombrar (✏️) y eliminar (🗑); los iconos de la cabecera crean notas, carpetas y suben adjuntos a la nota actual.
- **Editor con tres modos** — *Edición* (markdown crudo), *Split* (editor y vista renderizada lado a lado, con scroll sincronizado), *Vista* (solo preview). Los bloques de código llevan resaltado de sintaxis.
- **Panel de recursos** — panel plegable a la derecha con las imágenes de la nota actual en miniaturas. Haz click en una para insertar su markdown en el cursor.
- **Autoguardado** — los cambios se guardan solos 1.2 s después de dejar de escribir (o al instante con `Cmd/Ctrl + S`).
- **Exportar** — un click para descargar la nota como **PDF** o **Word (.docx)**: tema claro, código resaltado, imágenes incrustadas y con el nombre de la nota (`recetas.pdf`, nunca `index.pdf`). Si hay cambios sin guardar, se guardan primero.

## Desarrollo

```bash
pnpm install
pnpm dev:server   # servidor API en :5813 (sin navegador)
pnpm dev          # servidor Vite en :5174 con HMR
pnpm build        # build de producción → dist/
pnpm start        # servir el build de producción
```

Construido con **Svelte 5** y **Vite** en el front, **Node + Express** puro en el back. El markdown se renderiza con **markdown-it** y **highlight.js**; las exportaciones con **pdfkit** y **docx**. Las notas de arquitectura están en [`AGENTS.md`](./AGENTS.md).

## Licencia

[MIT](./LICENSE)
