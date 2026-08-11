const { PDFParse } = require("pdf-parse");
const XLSX = require("xlsx");
const path = require("path");
const { pathToFileURL } = require("url");

function parseBrCurrencyToNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  // If already a number (from XLSX), just return it
  if (typeof value === "number") {
    return value;
  }

  const text = String(value).trim();
  
  // Remove currency symbols and whitespace
  let clean = text.replace(/[R$\s]/g, "").replace(/\u00a0/g, "");

  // Heuristic for BR vs US/Logic formatting
  // If it has a comma, it's definitely BR (or similar) where , is decimal or thousands.
  // In BR: 1.234,56
  if (clean.includes(",")) {
    clean = clean.replace(/\./g, "").replace(",", ".");
  } 
  // If no comma, but has a dot, could be 1.234 or 1234.56
  // Usually from XLSX if it's a string it's already "clean" or specifically formatted.
  // But if the user is seeing 3061,6 in the sheet and it's coming as "3061.6" from the library,
  // we SHOULD NOT remove that dot.
  
  const number = Number(clean);
  return Number.isFinite(number) ? number : null;
}

function parseExtratoCurrencyToNumber(text) {
  if (!text) {
    return null;
  }

  const match = String(text).match(/([+-])\s*([0-9][0-9.,]*[.,][0-9]{2})$/);
  if (!match) {
    return null;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const raw = match[2];
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  const decimalIndex = Math.max(lastComma, lastDot);
  const normalized = `${raw.slice(0, decimalIndex).replace(/[.,]/g, "")}.${raw.slice(decimalIndex + 1)}`;
  const number = Number(normalized);
  return Number.isFinite(number) ? number * sign : null;
}

const EXTRATO_MONTH_MAP = {
  "jan.": "01",
  "fev.": "02",
  "mar.": "03",
  "abr.": "04",
  "mai.": "05",
  "jun.": "06",
  "jul.": "07",
  "ago.": "08",
  "set.": "09",
  "out.": "10",
  "nov.": "11",
  "dez.": "12",
};

function dateToISO(dateText) {
  const match = String(dateText || "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) {
    return "";
  }
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

function excelDateToISO(value) {
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) {
      return "";
    }
    const yyyy = String(date.y).padStart(4, "0");
    const mm = String(date.m).padStart(2, "0");
    const dd = String(date.d).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    return `${br[3]}-${br[2]}-${br[1]}`;
  }

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  return "";
}

function keyFrom(amount) {
  return `${Number(amount).toFixed(2)}`;
}

function normalizeCte(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/^0+/, "") || "0";
}

function groupByKey(rows, source) {
  const map = new Map();
  rows.forEach((row) => {
    if (row.amount == null || row.amount <= 0) {
      return;
    }
    const key = keyFrom(row.amount);
    if (!map.has(key)) {
      map.set(key, {
        key,
        date: row.date || "", // Keep the first found date as informative
        amount: row.amount,
        transport: 0,
        extrato: 0,
        excel: 0,
        origens: new Set(),
        tripTotals: new Set(),
        tripTotalCounts: new Map(),
        tripKeysByTotal: new Map(),
        tripLinks: new Map(),
        relatedAmounts: new Set()
      });
    }
    const data = map.get(key);
    data[source] += 1;
    if (source === "transport") {
      if (row.origem) data.origens.add(row.origem);
      if (row.total) {
        const totalKey = keyFrom(row.total);
        data.tripTotals.add(Number(row.total));
        data.tripTotalCounts.set(totalKey, (data.tripTotalCounts.get(totalKey) || 0) + 1);
        if (!data.tripKeysByTotal.has(totalKey)) data.tripKeysByTotal.set(totalKey, new Set());
        data.tripKeysByTotal.get(totalKey).add(row.tripKey || `${totalKey}-${data.transport}`);
      }
      if (row.tripKey) {
        data.tripLinks.set(row.tripKey, {
          tripKey: row.tripKey,
          cte: normalizeCte(row.cte),
          total: Number(row.total || row.amount || 0),
        });
      }
      (row.relatedAmounts || []).forEach((amount) => {
        if (amount != null && amount > 0 && keyFrom(amount) !== key) {
          data.relatedAmounts.add(Number(amount));
        }
      });
    }
  });
  return map;
}

function parseTransportRows(rows) {
  const out = [];

  (Array.isArray(rows) ? rows : []).forEach((row, rowIndex) => {
    const date = dateToISO(row.data_cadastro || row.data_embarque);
    if (!date) {
      return;
    }

    const adiantamento =
      row.valor_adiantamento_num != null
        ? Number(row.valor_adiantamento_num)
        : parseBrCurrencyToNumber(row.valor_adiantamento);
    const saldo =
      row.valor_saldo_num != null
        ? Number(row.valor_saldo_num)
        : parseBrCurrencyToNumber(row.valor_saldo);
    const frete =
      row.valor_frete_num != null
        ? Number(row.valor_frete_num)
        : parseBrCurrencyToNumber(row.valor_frete);

    const parsedTotal = row.valor_total_num != null
      ? Number(row.valor_total_num)
      : parseBrCurrencyToNumber(row.valor_total);
    // O Excel normalmente registra o frete total, enquanto o extrato registra
    // as parcelas ADT/SDO. Mantemos o frete como elo entre essas fontes.
    const total = frete != null && frete > 0 ? frete : parsedTotal;
    const tripKey = String(row.id_viagem || row.numero_documento || `pdf-row-${rowIndex}`);
    const cte = normalizeCte(row.numero_documento);

    const hasParcelas = (adiantamento != null && adiantamento > 0) || (saldo != null && saldo > 0);

    // Extrato normalmente vem por parcelas (ADT/SDO). Quando existir, prioriza essa comparacao.
    if (hasParcelas) {
      if (adiantamento != null && adiantamento > 0) {
        out.push({
          date,
          amount: adiantamento,
          origem: "ADT",
          total,
          tripKey,
          cte,
          relatedAmounts: saldo != null && saldo > 0 ? [saldo] : [],
        });
      }
      if (saldo != null && saldo > 0) {
        out.push({
          date,
          amount: saldo,
          origem: "SDO",
          total,
          tripKey,
          cte,
          relatedAmounts: adiantamento != null && adiantamento > 0 ? [adiantamento] : [],
        });
      }
      return;
    }

    if (frete != null && frete > 0) {
      out.push({ date, amount: frete, origem: "FRETE", total, tripKey, cte });
    }
  });

  return out;
}

function parseExtratoTextLines(lines, yearFallback) {
  let currentDay = "";
  let currentMonth = "";
  const rows = [];

  lines.forEach((line) => {
    const dayMonthInline = line.match(
      /^(\d{1,2})\s+(jan\.|fev\.|mar\.|abr\.|mai\.|jun\.|jul\.|ago\.|set\.|out\.|nov\.|dez\.)\s+/i
    );
    if (dayMonthInline) {
      currentDay = String(dayMonthInline[1]).padStart(2, "0");
      currentMonth = EXTRATO_MONTH_MAP[dayMonthInline[2].toLowerCase()] || currentMonth;
    }

    const dayOnly = line.match(/^(\d{1,2})$/);
    if (dayOnly) {
      currentDay = String(dayOnly[1]).padStart(2, "0");
      return;
    }

    const monthInline = line.match(
      /^(jan\.|fev\.|mar\.|abr\.|mai\.|jun\.|jul\.|ago\.|set\.|out\.|nov\.|dez\.)\s+/i
    );
    if (monthInline) {
      currentMonth = EXTRATO_MONTH_MAP[monthInline[1].toLowerCase()] || "";
    }

    if (!/AUTH PAGAMENTO\*\*/i.test(line)) {
      return;
    }

    const valueMatch = line.match(/R\$\s*([+-]\s*[0-9][0-9.,]*[.,][0-9]{2})$/);
    if (!valueMatch) {
      return;
    }

    const signedAmount = parseExtratoCurrencyToNumber(valueMatch[0]);
    if (signedAmount == null || signedAmount === 0 || !currentDay || !currentMonth) {
      return;
    }

    rows.push({
      date: `${yearFallback}-${currentMonth}-${currentDay}`,
      amount: Math.abs(signedAmount),
    });
  });

  return rows;
}

function findLayoutDateMarkers(items, yearFallback) {
  const monthItems = items.filter(
    (item) => item.x < 63 && EXTRATO_MONTH_MAP[item.text.toLowerCase()]
  );

  return items
    .filter((item) => item.x < 63 && /^\d{1,2}$/.test(item.text))
    .map((dayItem) => {
      const day = Number(dayItem.text);
      if (day < 1 || day > 31) return null;

      const monthItem = monthItems
        .map((item) => ({ item, distance: Math.abs(dayItem.y - item.y) }))
        .filter(({ item, distance }) => item.y <= dayItem.y + 2 && distance <= 24)
        .sort((a, b) => a.distance - b.distance)[0]?.item;
      if (!monthItem) return null;

      const month = EXTRATO_MONTH_MAP[monthItem.text.toLowerCase()];
      return {
        y: dayItem.y,
        date: `${yearFallback}-${month}-${String(day).padStart(2, "0")}`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.y - a.y);
}

async function parseExtratoPdfByLayout(buffer, yearFallback, password = "") {
  const pdfParseEntry = require.resolve("pdf-parse");
  const pdfjsEntry = require.resolve("pdfjs-dist/legacy/build/pdf.mjs", {
    paths: [path.dirname(pdfParseEntry)],
  });
  const pdfjsLib = await import(pathToFileURL(pdfjsEntry).href);
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(Buffer.from(buffer)),
    password,
  });
  const pdf = await loadingTask.promise;
  const rows = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items
        .filter((item) => item.str?.trim())
        .map((item) => ({
          text: item.str.trim(),
          x: Number(item.transform[4]),
          y: Number(item.transform[5]),
        }));
      const dateMarkers = findLayoutDateMarkers(items, yearFallback);

      items
        .filter((item) => /AUTH PAGAMENTO\*\*/i.test(item.text))
        .forEach((authItem) => {
          const valueItem = items
            .filter(
              (item) =>
                item.x > authItem.x &&
                Math.abs(item.y - authItem.y) <= 2 &&
                /^R\$\s*[+-]\s*[0-9][0-9.,]*[.,][0-9]{2}$/i.test(item.text)
            )
            .sort((a, b) => a.x - b.x)[0];
          if (!valueItem) return;

          const signedAmount = parseExtratoCurrencyToNumber(valueItem.text);
          if (signedAmount == null || signedAmount === 0) return;

          const dateMarker = dateMarkers
            .map((marker) => ({ marker, distance: marker.y - authItem.y }))
            .filter(({ distance }) => distance >= -3)
            .sort((a, b) => a.distance - b.distance)[0]?.marker;
          if (!dateMarker) return;

          rows.push({ date: dateMarker.date, amount: Math.abs(signedAmount) });
        });
    }

    return rows;
  } finally {
    await pdf.destroy();
  }
}

async function parseExtratoPdf(buffer, yearFallback, password = "") {
  const parser = new PDFParse({ data: buffer, password });
  let result;
  try {
    result = await parser.getText();
  } catch (error) {
    if (error.name === "PasswordException" || String(error.message).includes("Password") || String(error.message).includes("encrypted")) {
      throw new Error("ENCRYPTED");
    }
    throw error;
  }
  
  try {
    const text = result.text.replace(/\r/g, "");
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    const textRows = parseExtratoTextLines(lines, yearFallback);
    return textRows.length > 0
      ? textRows
      : await parseExtratoPdfByLayout(buffer, yearFallback, password);
  } finally {
    await parser.destroy();
  }
}

function parseExcelFile(buffer) {
  try {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const sheetNames = wb.SheetNames;
    console.log("Excel Sheets found:", sheetNames);
    
    const targetIndexes = [
      sheetNames.findIndex((n) => n.toLowerCase().includes("detalhes")),
      sheetNames.findIndex((n) => n.toLowerCase().includes("dados")),
      sheetNames[1] ? 1 : -1,
      0
    ].filter(i => i >= 0);

    const uniqueIndexes = [...new Set(targetIndexes)];
    const allPossibleIndexes = [...uniqueIndexes, ...sheetNames.map((_, i) => i).filter(i => !uniqueIndexes.includes(i))];

    for (const idx of allPossibleIndexes) {
      const sheetName = sheetNames[idx];
      const ws = wb.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      const formattedData = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: "",
        raw: false,
      });

      if (rawData.length === 0) continue;

      let headerRowIndex = -1;
      let dateColIdx = -1;
      let freteColIdx = -1;
      let placaColIdx = -1;
      let cteColIdx = -1;
      let fallbackHeader = null;

      for (let i = 0; i < Math.min(rawData.length, 50); i++) {
        const row = rawData[i];
        if (!Array.isArray(row)) continue;

        const dIdx = row.findIndex((cell) => {
          const c = String(cell || "").toLowerCase().trim();
          return ["data", "dt", "vencimento", "emissao", "dta"].includes(c) || /^(data|dt|venc)/i.test(c);
        });

        const fIdx = row.findIndex((cell) => {
          const c = String(cell || "").toLowerCase().trim();
          return ["frete", "vlr frete", "valor frete", "vlr", "valor", "total", "mecanico", "frete (r$)"].includes(c) || 
                 /^frete/i.test(c) || 
                 (/valor/i.test(c) && !/tonel/i.test(c) && !/unit/i.test(c));
        });

        const pIdx = row.findIndex((cell) => {
          const c = String(cell || "").toLowerCase().trim();
          return ["placa", "placas", "veiculo", "veículo", "caminhão", "caminhao"].includes(c) || /^placa/i.test(c) || /^caminh/i.test(c);
        });

        const cIdx = row.findIndex((cell) => {
          const c = String(cell || "").toLowerCase().trim().replace(/\s+/g, " ");
          return ["cte", "ct-e", "n cte", "nº cte", "numero cte", "número cte"].includes(c) ||
            /^(n(umero|úmero)?\.?\s*)?ct-?e$/i.test(c);
        });

        if (dIdx >= 0 && fIdx >= 0) {
          headerRowIndex = i;
          dateColIdx = dIdx;
          freteColIdx = fIdx;
          placaColIdx = pIdx;
          cteColIdx = cIdx;
          break;
        }

        // A data do Excel e apenas informativa. Quando a planilha nao possui
        // uma coluna de data reconhecivel, placa + frete ainda identificam a tabela.
        if (!fallbackHeader && fIdx >= 0 && pIdx >= 0) {
          fallbackHeader = { headerRowIndex: i, dateColIdx: dIdx, freteColIdx: fIdx, placaColIdx: pIdx, cteColIdx: cIdx };
        }
      }

      if (headerRowIndex < 0 && fallbackHeader) {
        ({ headerRowIndex, dateColIdx, freteColIdx, placaColIdx, cteColIdx } = fallbackHeader);
      }

      if (headerRowIndex >= 0) {
        const parsedRows = [];
        for (let i = headerRowIndex + 1; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row || row.length <= freteColIdx) continue;
          
          const date = dateColIdx >= 0 ? excelDateToISO(row[dateColIdx]) : "";
          const amount = parseBrCurrencyToNumber(row[freteColIdx]);
          const placa = placaColIdx >= 0 ? String(row[placaColIdx] || "").trim() : "";
          const formattedCte = cteColIdx >= 0
            ? formattedData[i]?.[cteColIdx]
            : "";
          const rawCte = cteColIdx >= 0 ? row[cteColIdx] : "";
          const cteDisplay = String(formattedCte || rawCte || "")
            .trim()
            .replace(/^'+/, "");
          const cte = normalizeCte(cteDisplay);
          
          if (amount != null && amount > 0) {
            parsedRows.push({ date, amount, placa, cte, cteDisplay, originalRow: row });
          }
        }

        console.log(`Success on sheet ${sheetName}: found ${parsedRows.length} rows`);
        return { 
          rows: parsedRows, 
          debug: { 
            success: true, 
            sheet: sheetName, 
            headerRow: headerRowIndex + 1,
            dateCol: dateColIdx >= 0 ? String(rawData[headerRowIndex][dateColIdx]) : "(nao encontrada)",
            freteCol: String(rawData[headerRowIndex][freteColIdx]),
            placaCol: placaColIdx >= 0 ? String(rawData[headerRowIndex][placaColIdx]) : "(não encontrada)",
            cteCol: cteColIdx >= 0 ? String(rawData[headerRowIndex][cteColIdx]) : "(nao encontrada)",
            cteSamples: parsedRows.slice(0, 5).map((row) => row.cteDisplay),
            rowCount: parsedRows.length
          } 
        };
      }
    }

    return { 
      rows: [], 
      debug: { 
        error: "Colunas Data/Frete nao encontradas", 
        sheetsSearched: sheetNames,
        firstRowSample: rawData[0] ? rawData[0].slice(0, 5) : []
      } 
    };
  } catch (err) {
    console.error("Excel parse error:", err);
    return { rows: [], debug: { error: "Erro fatal: " + err.message } };
  }
}

function buildOccurrenceResult(row, hasExcelSource) {
  const sources = [
    { count: row.transport, label: "PDF" },
    { count: row.extrato, label: "extrato" },
  ];
  if (hasExcelSource) {
    sources.push({ count: row.excel, label: "Excel" });
  }

  const maxCount = Math.max(...sources.map((source) => source.count));
  const deficits = sources
    .map((source) => ({ ...source, missing: maxCount - source.count }))
    .filter((source) => source.missing > 0);

  if (deficits.length === 0) {
    const occurrenceLabel = maxCount === 1 ? "ocorrência" : "ocorrências";
    return `Quantidades conferem (${maxCount} ${occurrenceLabel})`;
  }

  return deficits
    .map((source) => {
      const verb = source.missing === 1 ? "Falta" : "Faltam";
      const item = source.missing === 1 ? "lançamento" : "lançamentos";
      return `${verb} ${source.missing} ${item} no ${source.label}`;
    })
    .join("; ");
}

function reconcileData(transportRows, extratoRows, excelResult) {
  const excelRows = excelResult?.rows || [];
  const hasExcelSource = excelRows.length > 0;
  const map = new Map();
  [groupByKey(transportRows, "transport"), groupByKey(extratoRows, "extrato"), groupByKey(excelRows, "excel")].forEach((sourceMap) => {
    sourceMap.forEach((value, key) => {
      if (!map.has(key)) {
        map.set(key, { ...value, origens: value.origens ? new Set(value.origens) : new Set() });
      } else {
        const current = map.get(key);
        current.transport += value.transport;
        current.extrato += value.extrato;
        current.excel += value.excel;
        if (value.origens) {
          if (!current.origens) current.origens = new Set();
          value.origens.forEach(o => current.origens.add(o));
        }
        if (value.tripTotals) {
          if (!current.tripTotals) current.tripTotals = new Set();
          value.tripTotals.forEach(t => current.tripTotals.add(t));
        }
        if (value.tripTotalCounts) {
          if (!current.tripTotalCounts) current.tripTotalCounts = new Map();
          value.tripTotalCounts.forEach((count, totalKey) => {
            current.tripTotalCounts.set(
              totalKey,
              (current.tripTotalCounts.get(totalKey) || 0) + count
            );
          });
        }
        if (value.tripKeysByTotal) {
          if (!current.tripKeysByTotal) current.tripKeysByTotal = new Map();
          value.tripKeysByTotal.forEach((tripKeys, totalKey) => {
            if (!current.tripKeysByTotal.has(totalKey)) {
              current.tripKeysByTotal.set(totalKey, new Set());
            }
            tripKeys.forEach((tripKey) => current.tripKeysByTotal.get(totalKey).add(tripKey));
          });
        }
        if (value.tripLinks) {
          if (!current.tripLinks) current.tripLinks = new Map();
          value.tripLinks.forEach((trip, tripKey) => current.tripLinks.set(tripKey, trip));
        }
        if (value.relatedAmounts) {
          if (!current.relatedAmounts) current.relatedAmounts = new Set();
          value.relatedAmounts.forEach((amount) => current.relatedAmounts.add(amount));
        }
      }
    });
  });

  const transportTrips = new Map();
  map.forEach((row) => {
    row.tripLinks?.forEach((trip, tripKey) => transportTrips.set(tripKey, trip));
  });

  const indexedExcelRows = excelRows.map((row, index) => ({ row, index }));
  const excelByCte = new Map();
  const excelByAmount = new Map();
  indexedExcelRows.forEach((entry) => {
    const cte = normalizeCte(entry.row.cte);
    const amountKey = keyFrom(entry.row.amount);
    if (cte) {
      if (!excelByCte.has(cte)) excelByCte.set(cte, []);
      excelByCte.get(cte).push(entry);
    }
    if (!excelByAmount.has(amountKey)) excelByAmount.set(amountKey, []);
    excelByAmount.get(amountKey).push(entry);
  });

  const hasExcelCtes = excelByCte.size > 0;
  const usedExcelIndexes = new Set();
  const tripExcelMatches = new Map();

  transportTrips.forEach((trip, tripKey) => {
    const cte = normalizeCte(trip.cte);
    const total = Number(trip.total || 0);
    let candidates = [];
    let matchType = "frete";

    if (cte && hasExcelCtes) {
      candidates = excelByCte.get(cte) || [];
      matchType = "cte";
    } else if (total > 0) {
      candidates = excelByAmount.get(keyFrom(total)) || [];
    }

    const available = candidates
      .filter((entry) => !usedExcelIndexes.has(entry.index))
      .sort((a, b) =>
        Math.abs(Number(a.row.amount || 0) - total) -
        Math.abs(Number(b.row.amount || 0) - total)
      )[0];
    if (!available) return;

    usedExcelIndexes.add(available.index);
    tripExcelMatches.set(tripKey, {
      excelRow: available.row,
      difference: Number(available.row.amount || 0) - total,
      matchType,
    });
  });

  map.forEach((row) => {
    if (!hasExcelSource || !row.tripLinks?.size) return;
    const matches = [...row.tripLinks.keys()]
      .map((tripKey) => tripExcelMatches.get(tripKey))
      .filter(Boolean);
    row.excel = matches.length;
    row.excelValueMismatchCount = matches.filter(
      (match) => Math.abs(match.difference) >= 0.005
    ).length;
    row.excelValueDifference = matches.reduce((sum, match) => sum + match.difference, 0);
    row.excelMatchedAmounts = new Set(matches.map((match) => Number(match.excelRow.amount)));
    row.excelMatchedCtes = new Set(matches.map((match) => normalizeCte(match.excelRow.cte)).filter(Boolean));
    row.excelMatchByCte = matches.filter((match) => match.matchType === "cte").length;
  });

  const usedExcelCountsByAmount = new Map();
  usedExcelIndexes.forEach((index) => {
    const amountKey = keyFrom(excelRows[index].amount);
    usedExcelCountsByAmount.set(amountKey, (usedExcelCountsByAmount.get(amountKey) || 0) + 1);
  });
  usedExcelCountsByAmount.forEach((matchedCount, amountKey) => {
    const row = map.get(amountKey);
    if (row && row.transport === 0 && row.extrato === 0 && row.excel > 0) {
      row.excel = Math.max(0, row.excel - matchedCount);
    }
  });

  const rows = [...map.values()]
    .filter((row) => !(
      row.transport === 0 &&
      row.extrato === 0 &&
      row.excel === 0
    ))
    .map((row) => {
      let status = "DIVERGENTE";
      const hasTransport = row.transport > 0;
      const hasExtrato = row.extrato > 0;
      const hasExcel = row.excel > 0;
      const activeCounts = hasExcelSource
        ? [row.transport, row.extrato, row.excel]
        : [row.transport, row.extrato];
      const quantitiesMatch = activeCounts.every((count) => count === activeCounts[0]);
      const hasExcelValueMismatch = Number(row.excelValueMismatchCount || 0) > 0;

      if (!hasExcelSource) {
        if (hasTransport && hasExtrato && quantitiesMatch) {
          status = "MATCH_PDF_EXTRATO";
        } else if (hasTransport && hasExtrato) {
          status = "QUANTIDADE_DIVERGENTE";
        } else if (hasTransport && !hasExtrato) {
          status = "SEM_EXTRATO";
        } else if (!hasTransport && hasExtrato) {
          status = "SEM_PDF_VIAGEM";
        }
      } else if (hasTransport && hasExtrato && hasExcel && quantitiesMatch) {
        status = hasExcelValueMismatch ? "VALOR_EXCEL_DIVERGENTE" : "CONCILIADO_3_FONTES";
      } else if (hasTransport && hasExtrato && hasExcel) {
        status = "QUANTIDADE_DIVERGENTE";
      } else if (hasTransport && hasExtrato && !hasExcel) {
        status = row.transport === row.extrato
          ? "MATCH_PDF_EXTRATO_SEM_EXCEL"
          : "QUANTIDADE_DIVERGENTE";
      } else if (hasTransport && hasExcel && !hasExtrato) {
        status = row.transport === row.excel
          ? "MATCH_PDF_EXCEL_SEM_EXTRATO"
          : "QUANTIDADE_DIVERGENTE";
      } else if (!hasTransport && hasExtrato && hasExcel) {
        status = row.extrato === row.excel
          ? "MATCH_EXTRATO_EXCEL_SEM_PDF"
          : "QUANTIDADE_DIVERGENTE";
      } else if (hasTransport && !hasExtrato && !hasExcel) {
        status = "SO_PDF_VIAGEM";
      } else if (!hasTransport && hasExtrato && !hasExcel) {
        status = "SO_EXTRATO";
      } else if (!hasTransport && !hasExtrato && hasExcel) {
        status = "SO_EXCEL";
      }
      return { 
        ...row, 
        status, 
        occurrenceResult: buildOccurrenceResult(row, hasExcelSource),
        excelSourceEnabled: hasExcelSource,
        origens: row.origens ? Array.from(row.origens).join(", ") : "",
        tripTotals: row.tripTotals ? Array.from(row.tripTotals) : [],
        tripTotalCounts: undefined,
        tripKeysByTotal: undefined,
        tripLinks: undefined,
        excelMatchedAmounts: row.excelMatchedAmounts ? Array.from(row.excelMatchedAmounts) : [],
        excelMatchedCtes: row.excelMatchedCtes ? Array.from(row.excelMatchedCtes) : [],
        relatedAmounts: row.relatedAmounts ? Array.from(row.relatedAmounts) : []
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const summary = rows.reduce(
    (acc, row) => {
      acc.totalKeys += 1;
      if (row.status.startsWith("MATCH") || row.status.startsWith("CONCILIADO")) {
        acc.conciliados += 1;
      } else {
        acc.divergentes += 1;
      }
      return acc;
    },
    { totalKeys: 0, conciliados: 0, divergentes: 0 }
  );

  return { summary, rows, rawExcel: excelRows, excelDebug: excelResult?.debug };
}

module.exports = {
  parseTransportRows,
  parseExtratoPdf,
  parseExcelFile,
  reconcileData,
};
