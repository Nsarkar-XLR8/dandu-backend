export interface ParsedCsvRow {
  rowNumber: number;
  values: Record<string, string>;
}

export class CsvParserService {
  /**
   * Parse CSV content, handling RFC 4180 quoted fields (including commas and newlines inside quotes).
   * Linnworks exports use quoted fields extensively.
   */
  parse(content: Buffer): ParsedCsvRow[] {
    const text = content.toString('utf8').trim();
    if (!text) return [];

    const lines = this.splitLines(text);
    if (lines.length === 0) return [];

    const [headerLine, ...dataLines] = lines;
    const headers = this.parseLine(headerLine);

    return dataLines
      .filter((line) => line.trim() !== '')
      .map((line, index) => {
        const values = this.parseLine(line);
        return {
          rowNumber: index + 2,
          values: Object.fromEntries(
            headers.map((header, headerIndex) => [
              header.trim(),
              (values[headerIndex] ?? '').trim(),
            ]),
          ),
        };
      });
  }

  /**
   * Split raw text into logical lines, respecting quoted multi-line fields.
   */
  private splitLines(text: string): string[] {
    const lines: string[] = [];
    let current = '';
    let insideQuote = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (ch === '"') {
        if (insideQuote && next === '"') {
          // Escaped quote ""
          current += '"';
          i++;
        } else {
          insideQuote = !insideQuote;
          current += ch;
        }
      } else if ((ch === '\n' || (ch === '\r' && next === '\n')) && !insideQuote) {
        if (ch === '\r') i++; // consume \n
        lines.push(current);
        current = '';
      } else {
        current += ch;
      }
    }

    if (current.trim()) lines.push(current);
    return lines;
  }

  /**
   * Parse a single CSV line into an array of values, respecting quoted fields.
   */
  parseLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let insideQuote = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const next = line[i + 1];

      if (ch === '"') {
        if (insideQuote && next === '"') {
          current += '"';
          i++;
        } else {
          insideQuote = !insideQuote;
        }
      } else if (ch === ',' && !insideQuote) {
        values.push(current);
        current = '';
      } else {
        current += ch;
      }
    }

    values.push(current);
    return values;
  }
}
