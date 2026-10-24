import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx';
import { highlightSegments, splitSegmentsByLines } from './highlight.js';

// Formatos que docx puede incrustar; el resto se exporta como marcador visible.
const DOCX_TYPES = new Set(['png', 'jpg', 'gif', 'bmp']);

const CODE_FONT = 'Courier New';
const HEADING_LEVELS = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6
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

function numberingLevels() {
  const lefts = [720, 1440, 2160, 2880, 3600, 4320];
  const formats = ['decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter', 'lowerRoman'];
  return formats.map((format, level) => ({
    level,
    format,
    text: `%${level + 1}.`,
    alignment: AlignmentType.START,
    style: { paragraph: { indent: { left: lefts[level], hanging: 360 } } }
  }));
}

function makeRun(text, state) {
  const options = {
    text,
    bold: state.bold || undefined,
    italics: state.italic || undefined,
    color: state.quoteDepth > 0 ? '595959' : undefined
  };
  if (state.href) {
    return new ExternalHyperlink({
      link: state.href,
      children: [new TextRun({ ...options, style: 'Hyperlink' })]
    });
  }
  return new TextRun(options);
}

function paragraphOptions(state, spacing = {}) {
  const options = { spacing: { after: 160, ...spacing } };
  if (state.listContext) {
    if (state.listContext.numbering) options.numbering = state.listContext.numbering;
    else options.bullet = state.listContext.bullet;
  }
  if (state.quoteDepth > 0) {
    options.indent = { left: 360 * state.quoteDepth };
    options.border = { left: { style: BorderStyle.SINGLE, size: 12, color: 'BFBFBF', space: 8 } };
  }
  return options;
}

function imageRun(loaded, alt) {
  if (!loaded?.type || !DOCX_TYPES.has(loaded.type)) return null;
  const maxWidth = 600;
  const maxHeight = 720;
  const scale = Math.min(maxWidth / loaded.width, maxHeight / loaded.height, 1);
  try {
    return new ImageRun({
      type: loaded.type,
      data: loaded.buffer,
      transformation: {
        width: Math.max(1, Math.round(loaded.width * scale)),
        height: Math.max(1, Math.round(loaded.height * scale))
      }
    });
  } catch {
    return null;
  }
}

function pushImages(out, images, state) {
  for (const image of images) {
    const loaded = state.images.get(image.src);
    const alt = image.alt || 'imagen';
    const run = loaded && imageRun(loaded, alt);
    if (run) {
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 160 },
          children: [run]
        })
      );
    } else {
      out.push(
        new Paragraph({
          spacing: { before: 120, after: 160 },
          children: [
            new TextRun({ text: `[imagen no soportada: ${alt}]`, italics: true, color: '808080' })
          ]
        })
      );
    }
  }
}

function renderInline(children, state) {
  const runs = [];
  const images = [];
  for (const child of children) {
    switch (child.type) {
      case 'text':
        if (child.content) runs.push(makeRun(child.content, state));
        break;
      case 'code_inline':
        runs.push(
          new TextRun({
            text: child.content,
            font: CODE_FONT,
            shading: { type: ShadingType.CLEAR, fill: 'EFEFEF' },
            bold: state.bold || undefined,
            italics: state.italic || undefined,
            color: state.quoteDepth > 0 ? '595959' : undefined
          })
        );
        break;
      case 'strong_open':
        state.bold = true;
        break;
      case 'strong_close':
        state.bold = false;
        break;
      case 'em_open':
        state.italic = true;
        break;
      case 'em_close':
        state.italic = false;
        break;
      case 'link_open':
        state.href = child.attrGet('href');
        break;
      case 'link_close':
        state.href = null;
        break;
      case 'image':
        images.push({ src: child.attrGet('src') ?? '', alt: child.content ?? '' });
        break;
      case 'softbreak':
      case 'hardbreak':
        runs.push(new TextRun({ break: 1 }));
        break;
      default:
        break;
    }
  }
  return { runs, images };
}

function pushInlineBlock(out, children, state, spacing = {}) {
  const result = renderInline(children, state);
  const options = paragraphOptions(state, spacing);
  if (result.images.length) {
    if (result.runs.length) out.push(new Paragraph({ ...options, children: result.runs }));
    pushImages(out, result.images, state);
  } else if (result.runs.length) {
    out.push(new Paragraph({ ...options, children: result.runs }));
  }
}

// Word fusiona los bordes de párrafos contiguos idénticos en un solo recuadro.
const CODE_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE', space: 4 },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE', space: 4 },
  left: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE', space: 10 },
  right: { style: BorderStyle.SINGLE, size: 4, color: 'D0D7DE', space: 10 }
};

function pushCodeBlock(out, content, info) {
  const segments = highlightSegments(content.replace(/\n$/, ''), info);
  const lines = splitSegmentsByLines(segments);
  lines.forEach((segs, index) => {
    out.push(
      new Paragraph({
        shading: { type: ShadingType.CLEAR, fill: 'F2F2F2' },
        border: CODE_BORDER,
        spacing: {
          before: index === 0 ? 200 : 0,
          after: index === lines.length - 1 ? 200 : 0,
          line: 240
        },
        indent: { left: 120, right: 120 },
        children: segs.length
          ? segs.map((seg) => new TextRun({
              text: seg.text,
              font: CODE_FONT,
              size: 18,
              color: seg.color ?? '1F2328'
            }))
          : [new TextRun({ text: ' ', font: CODE_FONT, size: 18, color: '1F2328' })]
      })
    );
  });
}

function renderTable(tokens, state) {
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
        cells.push(renderInline(inline?.children ?? [], state).runs);
        break;
      }
      default:
        break;
    }
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row) =>
      new TableRow({
        tableHeader: row.header || undefined,
        children: row.cells.map((runs) =>
          new TableCell({
            shading: row.header ? { type: ShadingType.CLEAR, fill: 'F2F2F2' } : undefined,
            margins: { top: 60, bottom: 60, left: 110, right: 110 },
            children: [new Paragraph({ children: runs })]
          })
        )
      })
    )
  });
}

function renderListItems(tokens, state, ordered, instance, level) {
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i].type !== 'list_item_open') {
      i++;
      continue;
    }
    const close = findClose(tokens, i, 'list_item_open', 'list_item_close');
    const previous = state.listContext;
    state.listContext = ordered
      ? { numbering: { reference: 'openmd-ordered', level: Math.min(level, 5), instance } }
      : { bullet: { level: Math.min(level, 8) } };
    out.push(...renderBlocks(tokens.slice(i + 1, close), state));
    state.listContext = previous;
    i = close + 1;
  }
  return out;
}

function renderBlocks(tokens, state) {
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    switch (token.type) {
      case 'inline':
        i++;
        pushInlineBlock(out, token.children ?? [], state, { after: 40 });
        break;
      case 'heading_open': {
        const level = Number(token.tag.slice(1));
        const inline = tokens[i + 1];
        i += 3;
        const result = renderInline(inline?.children ?? [], state);
        out.push(
          new Paragraph({
            heading: HEADING_LEVELS[level] ?? HEADING_LEVELS[6],
            children: result.runs
          })
        );
        if (result.images.length) pushImages(out, result.images, state);
        break;
      }
      case 'paragraph_open': {
        const inline = tokens[i + 1];
        i += 3;
        pushInlineBlock(out, inline?.children ?? [], state, token.hidden ? { after: 40 } : {});
        break;
      }
      case 'fence':
      case 'code_block':
        i++;
        pushCodeBlock(out, token.content, token.info);
        break;
      case 'blockquote_open': {
        const close = findClose(tokens, i, 'blockquote_open', 'blockquote_close');
        state.quoteDepth++;
        out.push(...renderBlocks(tokens.slice(i + 1, close), state));
        state.quoteDepth--;
        i = close + 1;
        break;
      }
      case 'bullet_list_open':
      case 'ordered_list_open': {
        const ordered = token.type === 'ordered_list_open';
        const close = findClose(tokens, i, token.type, `${token.type.slice(0, -5)}_close`);
        state.listLevel = (state.listLevel ?? 0) + 1;
        const instance = ordered ? state.orderedInstance++ : null;
        out.push(
          ...renderListItems(tokens.slice(i + 1, close), state, ordered, instance, state.listLevel - 1)
        );
        state.listLevel--;
        i = close + 1;
        break;
      }
      case 'hr':
        i++;
        out.push(
          new Paragraph({
            spacing: { before: 120, after: 240 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D0D0D0', space: 1 } },
            children: []
          })
        );
        break;
      case 'table_open': {
        const close = findClose(tokens, i, 'table_open', 'table_close');
        out.push(renderTable(tokens.slice(i + 1, close), state));
        i = close + 1;
        break;
      }
      default:
        i++;
    }
  }
  return out;
}

export function markdownToDocx(tokens, ctx) {
  const state = {
    bold: false,
    italic: false,
    href: null,
    quoteDepth: 0,
    listLevel: 0,
    listContext: null,
    orderedInstance: 0,
    images: ctx.images
  };
  const doc = new Document({
    title: ctx.title,
    creator: 'openmd',
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22, color: '1F2328' } },
        heading1: { run: { size: 40, bold: true, color: '1F2328' }, paragraph: { spacing: { before: 280, after: 160 } } },
        heading2: { run: { size: 32, bold: true, color: '1F2328' }, paragraph: { spacing: { before: 280, after: 140 } } },
        heading3: { run: { size: 26, bold: true, color: '1F2328' }, paragraph: { spacing: { before: 240, after: 120 } } },
        heading4: { run: { size: 24, bold: true, color: '1F2328' }, paragraph: { spacing: { before: 240, after: 120 } } },
        heading5: { run: { size: 22, bold: true, color: '1F2328' }, paragraph: { spacing: { before: 200, after: 120 } } },
        heading6: { run: { size: 22, bold: true, color: '595959' }, paragraph: { spacing: { before: 200, after: 120 } } }
      }
    },
    numbering: { config: [{ reference: 'openmd-ordered', levels: numberingLevels() }] },
    sections: [{ properties: {}, children: renderBlocks(tokens, state) }]
  });
  return Packer.toBuffer(doc);
}
