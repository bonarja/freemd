import PDFDocument from 'pdfkit';
import { highlightSegments } from './highlight.js';

// Formatos raster que pdfkit puede incrustar; el resto se exporta como marcador visible.
const PDF_TYPES = new Set(['png', 'jpg']);

const COLORS = {
  text: '#24292f',
  muted: '#6a737d',
  codeBg: '#f2f2f2',
  link: '#0969da',
  border: '#d0d7de'
};

function findClose(tokens, start, openType, closeType) {
  let depth = 0;
  for (let i = start; i < tokens.length; i++) {
    if (tokens[i].type === openType) depth++;
    else if (tokens[i].type === closeType) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return tokens.length - 1;
}

function roman(number) {
  const pairs = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I']
  ];
  let out = '';
  for (const [value, symbol] of pairs) {
    while (number >= value) {
      out += symbol;
      number -= value;
    }
  }
  return out;
}

function orderedMarker(number, level) {
  const kind = level % 3;
  if (kind === 0) return `${number}.`;
  if (kind === 1) {
    return number <= 26 ? `${String.fromCharCode(96 + number)}.` : `${number}.`;
  }
  return `${roman(number).toLowerCase()}.`;
}

class PdfRenderer {
  constructor(doc, ctx) {
    this.doc = doc;
    this.images = ctx.images;
    this.margins = {
      left: doc.page.margins.left,
      right: doc.page.margins.right,
      top: doc.page.margins.top,
      bottom: doc.page.margins.bottom
    };
    this.width = doc.page.width - this.margins.left - this.margins.right;
    this.bold = false;
    this.italic = false;
    this.href = null;
    this.quoteDepth = 0;
    this.listLevel = 0;
    this.listCtx = null;
    this.pageBreaks = 0;
  }

  get bottom() {
    return this.doc.page.height - this.margins.bottom;
  }

  ensureSpace(height) {
    if (this.doc.y + height > this.bottom) {
      this.doc.addPage();
      this.pageBreaks++;
    }
  }

  fontFor() {
    const italic = this.italic || this.quoteDepth > 0;
    if (this.bold && italic) return 'Helvetica-BoldOblique';
    if (this.bold) return 'Helvetica-Bold';
    if (italic) return 'Helvetica-Oblique';
    return 'Helvetica';
  }

  textColor() {
    return this.quoteDepth > 0 ? COLORS.muted : COLORS.text;
  }

  makeRun(text, size, override = {}) {
    return {
      text,
      opts: {
        font: override.font ?? this.fontFor(),
        size,
        color: this.href ? COLORS.link : this.textColor(),
        underline: this.href ? true : undefined,
        link: this.href ?? undefined
      }
    };
  }

  collectRuns(children, size) {
    const runs = [];
    const images = [];
    for (const child of children) {
      switch (child.type) {
        case 'text':
          if (child.content) runs.push(this.makeRun(child.content, size));
          break;
        case 'code_inline':
          runs.push(this.makeRun(child.content, size, { font: 'Courier' }));
          break;
        case 'strong_open':
          this.bold = true;
          break;
        case 'strong_close':
          this.bold = false;
          break;
        case 'em_open':
          this.italic = true;
          break;
        case 'em_close':
          this.italic = false;
          break;
        case 'link_open':
          this.href = child.attrGet('href');
          break;
        case 'link_close':
          this.href = null;
          break;
        case 'image':
          images.push(child);
          break;
        case 'softbreak':
        case 'hardbreak':
          runs.push({ text: '\n', opts: { font: this.fontFor(), size, color: this.textColor() } });
          break;
        default:
          break;
      }
    }
    return { runs, images };
  }

  flushRuns(runs, base = {}) {
    const doc = this.doc;
    if (!runs.length) return;
    runs.forEach((run, index) => {
      const isLast = index === runs.length - 1;
      // pdfkit no acepta color como opción de .text(): hay que fijar fillColor por run.
      doc.font(run.opts.font).fontSize(run.opts.size).fillColor(run.opts.color);
      doc.text(run.text || ' ', {
        ...base,
        underline: run.opts.underline,
        link: run.opts.link,
        continued: !isLast,
        lineGap: 3
      });
    });
  }

  renderParagraphContent(children, listInfo = null) {
    const doc = this.doc;
    const savedX = doc.x;
    let width;
    if (listInfo) {
      doc.x = listInfo.x;
      width = listInfo.width;
    } else if (this.quoteDepth > 0) {
      doc.x = this.margins.left + this.quoteDepth * 14;
      width = this.width - this.quoteDepth * 14;
    } else {
      this.ensureSpace(24);
    }
    const { runs, images } = this.collectRuns(children, 11);
    this.flushRuns(runs, width ? { width } : {});
    doc.x = savedX;
    images.forEach((image) => this.renderImage(image));
    doc.moveDown(listInfo ? 0.2 : 0.5);
  }

  renderHeading(level, children) {
    const sizes = { 1: 24, 2: 18.5, 3: 15, 4: 12.5, 5: 11.5, 6: 11 };
    const doc = this.doc;
    doc.moveDown(level <= 2 ? 1.0 : 0.7);
    this.ensureSpace(30);
    const savedBold = this.bold;
    this.bold = true;
    const { runs, images } = this.collectRuns(children, sizes[level] ?? 11);
    this.flushRuns(runs);
    this.bold = savedBold;
    if (level <= 2) {
      const y = doc.y + 5;
      doc
        .moveTo(this.margins.left, y)
        .lineTo(this.margins.left + this.width, y)
        .lineWidth(0.8)
        .strokeColor(COLORS.border)
        .stroke();
      doc.y = y + 4;
    }
    doc.moveDown(0.5);
    images.forEach((image) => this.renderImage(image));
  }

  renderCode(content, info) {
    const doc = this.doc;
    const fontSize = 9.5;
    const lineHeight = 14;
    const padX = 10;
    const padY = 8;
    const maxChars = Math.floor((this.width - padX * 2) / (fontSize * 0.602));
    const segments = highlightSegments(content.replace(/\n$/, ''), info);
    const lines = [];
    let current = [];
    let count = 0;
    const pushLine = () => {
      lines.push(current);
      current = [];
      count = 0;
    };
    for (const segment of segments) {
      const pieces = segment.text.split('\n');
      pieces.forEach((piece, index) => {
        if (index > 0) pushLine();
        while (piece.length > 0) {
          if (count >= maxChars) pushLine();
          const take = Math.min(maxChars - count, piece.length);
          current.push({ text: piece.slice(0, take), color: segment.color });
          count += take;
          piece = piece.slice(take);
        }
      });
    }
    if (current.length || !lines.length) pushLine();

    doc.moveDown(0.4);
    let y = doc.y;
    let chunkTop = null;
    let chunkBottom = null;
    // Cierra el trozo visible del bloque: relleno inferior + borde del recuadro.
    const closeChunk = () => {
      if (chunkTop === null) return;
      doc.rect(this.margins.left - padX, chunkBottom, this.width + padX * 2, padY).fill(COLORS.codeBg);
      doc
        .rect(this.margins.left - padX, chunkTop - padY, this.width + padX * 2, chunkBottom - chunkTop + padY * 2)
        .lineWidth(0.75)
        .strokeColor(COLORS.border)
        .stroke();
      chunkTop = null;
    };
    for (const segs of lines) {
      if (y + lineHeight + padY > this.bottom) {
        closeChunk();
        doc.addPage();
        this.pageBreaks++;
        y = doc.y;
      }
      if (chunkTop === null) {
        chunkTop = y;
        doc.rect(this.margins.left - padX, y - padY, this.width + padX * 2, padY).fill(COLORS.codeBg);
      }
      doc.rect(this.margins.left - padX, y, this.width + padX * 2, lineHeight).fill(COLORS.codeBg);
      let x = this.margins.left;
      for (const seg of segs) {
        doc
          .font('Courier')
          .fontSize(fontSize)
          .fillColor(seg.color ? `#${seg.color}` : COLORS.text);
        doc.text(seg.text, x, y + 4, { lineBreak: false });
        x += doc.widthOfString(seg.text);
      }
      y += lineHeight;
      chunkBottom = y;
    }
    closeChunk();
    doc.x = this.margins.left;
    doc.y = chunkBottom + padY + 16;
  }

  renderQuote(inner) {
    const doc = this.doc;
    const startY = doc.y;
    const startPage = this.pageBreaks;
    this.quoteDepth++;
    doc.x = this.margins.left + this.quoteDepth * 14;
    this.renderBlocks(inner);
    this.quoteDepth--;
    doc.x = this.margins.left;
    if (startPage === this.pageBreaks && doc.y > startY) {
      const x = this.margins.left + this.quoteDepth * 14 + 3;
      doc
        .moveTo(x, startY)
        .lineTo(x, doc.y - 4)
        .lineWidth(2)
        .strokeColor(COLORS.border)
        .stroke();
    }
    doc.moveDown(0.4);
  }

  renderList(tokens, ordered, openToken) {
    const doc = this.doc;
    this.listLevel++;
    const indent = (this.listLevel - 1) * 18;
    const baseX = this.margins.left + indent;
    let counter = Number(openToken.attrGet('start') ?? 1) || 1;
    doc.moveDown(0.3);
    let i = 0;
    while (i < tokens.length) {
      if (tokens[i].type !== 'list_item_open') {
        i++;
        continue;
      }
      const close = findClose(tokens, i, 'list_item_open', 'list_item_close');
      const inner = tokens.slice(i + 1, close);
      const marker = ordered ? orderedMarker(counter, this.listLevel - 1) : '•';
      if (ordered) counter++;
      const markerY = doc.y;
      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor(COLORS.text)
        .text(marker, baseX, markerY, { lineBreak: false });
      doc.y = markerY;
      this.listCtx = { x: baseX + 14, width: this.width - indent - 14 };
      this.renderBlocks(inner);
      this.listCtx = null;
      i = close + 1;
    }
    this.listLevel--;
    doc.x = this.margins.left;
    doc.moveDown(0.4);
  }

  renderHr() {
    const doc = this.doc;
    doc.moveDown(0.5);
    const y = doc.y;
    doc
      .moveTo(this.margins.left, y)
      .lineTo(this.margins.left + this.width, y)
      .lineWidth(1)
      .strokeColor(COLORS.border)
      .stroke();
    doc.y = y + 14;
  }

  renderImage(token) {
    const doc = this.doc;
    const src = token.attrGet('src') ?? '';
    const alt = token.content || 'imagen';
    const loaded = this.images.get(src);
    if (!loaded || !PDF_TYPES.has(loaded.type)) {
      doc.moveDown(0.3);
      doc
        .font('Helvetica-Oblique')
        .fontSize(10)
        .fillColor(COLORS.muted)
        .text(`[unsupported image: ${alt}]`, { align: 'center' });
      doc.moveDown(0.5);
      return;
    }
    const maxHeight = this.bottom - this.margins.top;
    const scale = Math.min(this.width / loaded.width, maxHeight / loaded.height, 1);
    const drawWidth = loaded.width * scale;
    const drawHeight = loaded.height * scale;
    doc.moveDown(0.3);
    this.ensureSpace(drawHeight + 14);
    const x = this.margins.left + (this.width - drawWidth) / 2;
    doc.image(loaded.buffer, x, doc.y, { width: drawWidth, height: drawHeight });
    doc.y += drawHeight + 12;
  }

  renderTable(tokens) {
    const doc = this.doc;
    const rows = [];
    let inHead = false;
    let cells = null;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      switch (token.type) {
        case 'thead_open':
          inHead = true;
          break;
        case 'thead_close':
          inHead = false;
          break;
        case 'tr_open':
          cells = [];
          break;
        case 'tr_close':
          rows.push({ cells, header: inHead });
          cells = null;
          break;
        case 'th_open':
        case 'td_open': {
          const inline = tokens[i + 1];
          const cell = { text: '', images: [] };
          for (const child of inline?.children ?? []) {
            if (child.type === 'text' || child.type === 'code_inline') cell.text += child.content;
            else if (child.type === 'image') cell.images.push(child);
          }
          cells.push(cell);
          break;
        }
        default:
          break;
      }
    }
    if (!rows.length) return;
    const cols = Math.max(...rows.map((row) => row.cells.length));
    const colWidth = this.width / cols;
    const pad = 5;
    const cellWidth = colWidth - pad * 2;
    doc.font('Helvetica').fontSize(10);
    // Las imagenes de las celdas caben en la columna; si son gigantes se
    // limitan a la altura util de una pagina para que la fila sea paginable.
    const maxImgHeight = this.bottom - this.margins.top - pad * 2;
    const resolveCellImages = (cell) =>
      cell.images.map((token) => {
        const alt = token.content || 'imagen';
        const loaded = this.images.get(token.attrGet('src') ?? '');
        if (!loaded || !PDF_TYPES.has(loaded.type)) {
          return { alt, buffer: null, width: 0, height: 0 };
        }
        const scale = Math.min(cellWidth / loaded.width, maxImgHeight / loaded.height, 1);
        return {
          alt,
          buffer: loaded.buffer,
          width: Math.max(1, loaded.width * scale),
          height: Math.max(1, loaded.height * scale)
        };
      });
    rows.forEach((row) => row.cells.forEach((cell) => (cell.resolved = resolveCellImages(cell))));
    doc.font('Helvetica-Oblique').fontSize(9);
    const placeholderHeight = doc.heightOfString('[unsupported image]', { width: cellWidth });
    doc.font('Helvetica').fontSize(10);
    const cellContentHeight = (cell) => {
      let height = 0;
      if (cell.text) height += doc.heightOfString(cell.text, { width: cellWidth });
      else if (!cell.images.length) height += doc.heightOfString(' ', { width: cellWidth });
      for (const img of cell.resolved) height += (img.buffer ? img.height : placeholderHeight) + 4;
      return height;
    };
    const heights = rows.map((row) => {
      const contentHeight = row.cells.length
        ? Math.max(...row.cells.map(cellContentHeight))
        : 14;
      return contentHeight + pad;
    });
    doc.moveDown(0.3);
    const startY = doc.y;
    let y = startY;
    // Bordes verticales de un tramo continuo de tabla (entre saltos de pagina):
    // hay que cerrarlos antes de addPage() porque el path va a la pagina actual.
    const drawVerticals = (top, bottom) => {
      for (let c = 0; c <= cols; c++) {
        const x = this.margins.left + c * colWidth;
        doc.moveTo(x, top).lineTo(x, bottom).lineWidth(0.75).strokeColor(COLORS.border).stroke();
      }
    };
    let segmentTop = startY;
    rows.forEach((row, index) => {
      const rowHeight = heights[index];
      if (y + rowHeight > this.bottom) {
        drawVerticals(segmentTop, y);
        doc.addPage();
        this.pageBreaks++;
        y = doc.y;
        segmentTop = y;
      }
      if (row.header) {
        doc.rect(this.margins.left, y, this.width, rowHeight).fill(COLORS.codeBg);
      }
      doc.fillColor(COLORS.text);
      row.cells.forEach((cell, cellIndex) => {
        const x = this.margins.left + cellIndex * colWidth + pad;
        let cy = y + pad / 2;
        if (cell.text || !cell.images.length) {
          doc
            .font(row.header ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(10)
            .text(cell.text || ' ', x, cy, { width: cellWidth });
          cy += doc.heightOfString(cell.text || ' ', { width: cellWidth });
        }
        for (const img of cell.resolved) {
          if (img.buffer) {
            doc.image(img.buffer, x, cy, { width: img.width, height: img.height });
            cy += img.height + 4;
          } else {
            doc
              .font('Helvetica-Oblique')
              .fontSize(9)
              .fillColor(COLORS.muted)
              .text(`[unsupported image: ${img.alt}]`, x, cy, { width: cellWidth });
            cy += placeholderHeight + 4;
          }
        }
      });
      y += rowHeight;
      doc
        .moveTo(this.margins.left, y)
        .lineTo(this.margins.left + this.width, y)
        .lineWidth(0.75)
        .strokeColor(COLORS.border)
        .stroke();
    });
    drawVerticals(segmentTop, y);
    // pdfkit muta doc.x en cada .text(): sin este reset, todo lo que sigue a la
    // tabla se pinta en la x de la ultima columna (mismo gotcha que renderCode).
    doc.x = this.margins.left;
    doc.y = y + 10;
  }

  renderBlocks(tokens) {
    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i];
      switch (token.type) {
        case 'inline':
          i++;
          this.renderParagraphContent(token.children ?? [], this.listCtx);
          break;
        case 'heading_open': {
          const level = Number(token.tag.slice(1));
          const inline = tokens[i + 1];
          i += 3;
          this.renderHeading(level, inline?.children ?? []);
          break;
        }
        case 'paragraph_open': {
          const inline = tokens[i + 1];
          i += 3;
          this.renderParagraphContent(inline?.children ?? [], this.listCtx);
          break;
        }
        case 'fence':
        case 'code_block':
          i++;
          this.renderCode(token.content, token.info);
          break;
        case 'blockquote_open': {
          const close = findClose(tokens, i, 'blockquote_open', 'blockquote_close');
          this.renderQuote(tokens.slice(i + 1, close));
          i = close + 1;
          break;
        }
        case 'bullet_list_open':
        case 'ordered_list_open': {
          const ordered = token.type === 'ordered_list_open';
          const close = findClose(tokens, i, token.type, `${token.type.slice(0, -5)}_close`);
          this.renderList(tokens.slice(i + 1, close), ordered, token);
          i = close + 1;
          break;
        }
        case 'hr':
          i++;
          this.renderHr();
          break;
        case 'table_open': {
          const close = findClose(tokens, i, 'table_open', 'table_close');
          this.renderTable(tokens.slice(i + 1, close));
          i = close + 1;
          break;
        }
        default:
          i++;
      }
    }
  }
}

export function markdownToPdf(tokens, ctx) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
      info: { Title: ctx.title, Creator: 'freemd' }
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    new PdfRenderer(doc, ctx).renderBlocks(tokens);
    doc.end();
  });
}
