# openmd

Editor de notas markdown en el navegador, construido con **Node** y **Svelte 5**.

```bash
npx openmd
```

Al iniciar abre `http://localhost:5813` en tu navegador.

## Notas

Las notas viven en `~/openmd`. Si la carpeta no existe, se crea automáticamente al arrancar.

Cada nota es una **carpeta terminada en `-md`** que contiene su contenido en `index.md`:

```
~/openmd
├── minota-md
│   ├── index.md
│   └── mapa.png
├── recetas-md
│   └── index.md
└── proyectos          <- carpeta normal (sin -md)
    └── recetas-md
        └── index.md
```

Las imágenes y recursos van junto al `index.md` de la nota y se referencian de forma relativa:

```markdown
![Mapa](./mapa.png)
```

## Uso

```bash
npx openmd [opciones]
```

| Opción | Descripción |
| --- | --- |
| `-p, --port <n>` | Puerto del servidor (por defecto `5813`) |
| `-d, --dir <ruta>` | Carpeta de notas (por defecto `~/openmd`) |
| `--no-open` | No abrir el navegador automáticamente |
| `-v, --version` | Mostrar versión |
| `-h, --help` | Mostrar ayuda |

También se puede configurar con las variables de entorno `OPENMD_PORT` y `OPENMD_DIR`.

## Interfaz

- **Sidebar** con el árbol de notas y carpetas; cada nota se ve como un archivo `mi-nota.md` (internamente es la carpeta `mi-nota-md` con su `index.md`).
- **Editor** con toggle **Edición / Vista**: markdown en texto plano o renderizado.
- Tema **dark minimalista** con la paleta **One Dark** y resaltado de código con `highlight.js`.
- `Cmd/Ctrl + S` para guardar.
- Sube imágenes y recursos a la nota activa con el botón de la sidebar.

## Stack

- **Svelte 5** (runes) + Vite para el frontend.
- **Express** para servir la app y la API de archivos.
- **markdown-it** + **markdown-it-highlightjs** + **highlight.js** para el renderizado.

## Desarrollo

```bash
pnpm install
pnpm dev:server   # servidor en http://localhost:5813 (sin abrir navegador)
pnpm dev          # vite en http://localhost:5174 (proxifica /api y /media)
```

Build de producción (lo que publica el paquete):

```bash
pnpm build
pnpm start
```

## Publicar

```bash
pnpm publish
```

El paquete publica solo `bin/`, `server/` y `dist/` (el frontend ya compilado), por lo que `npx openmd` funciona sin ningún paso de build para quien lo instala.
