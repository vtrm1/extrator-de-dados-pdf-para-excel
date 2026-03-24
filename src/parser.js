function replaceAllPairs(value, pairs) {
  let output = value;
  for (const [from, to] of pairs) {
    output = output.replaceAll(from, to);
  }
  return output;
}

function fixMojibake(value) {
  if (!value) {
    return "";
  }

  return replaceAllPairs(value, [
    ["\u00c3\u00a1", "\u00e1"],
    ["\u00c3\u00a2", "\u00e2"],
    ["\u00c3\u00a3", "\u00e3"],
    ["\u00c3\u00a9", "\u00e9"],
    ["\u00c3\u00aa", "\u00ea"],
    ["\u00c3\u00ad", "\u00ed"],
    ["\u00c3\u00b3", "\u00f3"],
    ["\u00c3\u00b4", "\u00f4"],
    ["\u00c3\u00b5", "\u00f5"],
    ["\u00c3\u00ba", "\u00fa"],
    ["\u00c3\u0081", "\u00c1"],
    ["\u00c3\u0089", "\u00c9"],
    ["\u00c3\u0093", "\u00d3"],
    ["\u00c3\u0095", "\u00d5"],
    ["\u00c3\u009a", "\u00da"],
    ["\u00c3\u2022", "\u00d5"],
    ["\u00c3\u00a7", "\u00e7"],
    ["\u00c3\u0087", "\u00c7"],
    ["\u00c2", ""],
    ["\u00ef\u00bf\u00bd", "\u00e1"],
  ]);
}

function normalizeText(text) {
  return fixMojibake(text)
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractValue(block, regex) {
  const match = block.match(regex);
  return match ? match[1].trim() : "";
}

function parseCurrency(value) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function formatCurrency(number) {
  if (number == null) {
    return "";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(number);
}

function extractParcelTypeTotals(block) {
  const sectionMatch = block.match(
    /Parcelas([\s\S]*?)Total das Parcelas:\s*R\$\s*[0-9.,]+/
  );
  const section = sectionMatch ? sectionMatch[1] : block;
  const regex = /\b(ADT|SDO)\b[\s\S]{0,60}?([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/g;
  let match;
  let adiantamento = 0;
  let saldo = 0;
  let foundAdt = false;
  let foundSdo = false;

  while ((match = regex.exec(section)) !== null) {
    const tipo = match[1];
    const parsed = parseCurrency(match[2]);
    if (parsed == null) {
      continue;
    }

    if (tipo === "ADT") {
      adiantamento += parsed;
      foundAdt = true;
    } else if (tipo === "SDO") {
      saldo += parsed;
      foundSdo = true;
    }
  }

  return {
    adiantamento: foundAdt ? adiantamento : null,
    saldo: foundSdo ? saldo : null,
  };
}

function hasClosedTrip(block) {
  return /Total da Viagem\(Total Parcelas \+ Ped(?:\u00e1gio|agio)\):\s*R\$\s*[0-9.,]+/.test(
    block
  );
}

function parseBlock(block, pageNumber) {
  const conhecimento = extractValue(block, /CONHECIMENTO:\s*([0-9]+)/);
  const idViagem = extractValue(block, /ID da Viagem:\s*([0-9]+)/);
  const dataCadastro = extractValue(block, /Data do Cadastro:\s*([0-9/: ]+)/);
  const dataEmbarque = extractValue(block, /Data do Embarque:\s*([0-9/: ]+)/);
  const placa = extractValue(block, /Placa:\s*([A-Z0-9]+)/);
  const pedagioRaw = extractValue(
    block,
    /Ped(?:\u00e1gio|agio)[\s\S]*?Valor:\s*([0-9.,]+)/
  );
  const parcelasRaw = extractValue(block, /Total das Parcelas:\s*R\$\s*([0-9.,]+)/);
  const totalRaw = extractValue(
    block,
    /Total da Viagem\(Total Parcelas \+ Ped(?:\u00e1gio|agio)\):\s*R\$\s*([0-9.,]+)/
  );

  const pedagio = parseCurrency(pedagioRaw);
  const parcelas = parseCurrency(parcelasRaw);
  const total = parseCurrency(totalRaw);
  const tipoTotais = extractParcelTypeTotals(block);
  const adiantamento = tipoTotais.adiantamento;
  const saldo = tipoTotais.saldo;

  if (!conhecimento && !idViagem && total == null) {
    return null;
  }

  return {
    pagina_pdf: pageNumber,
    numero_documento: conhecimento,
    id_viagem: idViagem,
    data_cadastro: dataCadastro,
    data_embarque: dataEmbarque,
    placa,
    valor_frete: formatCurrency(parcelas),
    valor_adiantamento: formatCurrency(adiantamento),
    valor_saldo: formatCurrency(saldo),
    valor_pedagio: formatCurrency(pedagio),
    valor_total: formatCurrency(total),
    valor_frete_num: parcelas,
    valor_adiantamento_num: adiantamento,
    valor_saldo_num: saldo,
    valor_pedagio_num: pedagio,
    valor_total_num: total,
  };
}

function splitIntoBlocks(text) {
  return text
    .split(/(?=Contratado:\s)/)
    .map((block) => block.trim())
    .filter(Boolean);
}

async function extractTripsFromPdf(buffer) {
  const { PDFParse } = require("pdf-parse");
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    const pages = result.pages.map((page) => ({
      page_number: page.num,
      rows: [],
    }));
    const pageMap = new Map(pages.map((page) => [page.page_number, page]));

    let carryBlock = "";
    let carrySourcePage = null;

    for (const page of result.pages) {
      const pageText = normalizeText(page.text);
      const combinedText = carryBlock ? `${carryBlock}\n${pageText}` : pageText;
      const blocks = splitIntoBlocks(combinedText);
      const sourcePageForCombined = carrySourcePage || page.num;

      carryBlock = "";
      carrySourcePage = null;

      blocks.forEach((block, index) => {
        const isLastBlock = index === blocks.length - 1;
        const sourcePage =
          index === 0 && combinedText !== pageText ? sourcePageForCombined : page.num;

        if (isLastBlock && !hasClosedTrip(block)) {
          carryBlock = block;
          carrySourcePage = sourcePage;
          return;
        }

        const parsed = parseBlock(block, sourcePage);
        if (parsed) {
          pageMap.get(sourcePage)?.rows.push(parsed);
        }
      });
    }

    if (carryBlock) {
      const parsed = parseBlock(carryBlock, carrySourcePage || result.total);
      if (parsed) {
        pageMap.get(parsed.pagina_pdf)?.rows.push(parsed);
      }
    }

    return {
      totalPages: result.total,
      pages,
      rows: pages.flatMap((page) => page.rows),
    };
  } finally {
    await parser.destroy();
  }
}

module.exports = {
  extractTripsFromPdf,
  fixMojibake,
};
