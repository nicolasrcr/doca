import { todayISO } from "./format";
import type { DayRecord } from "./types";

// Dia de referência das análises: o último dia com dados salvos. Assim os gráficos aparecem mesmo
// quando o arquivo importado não é de hoje (por exemplo, o relatório de ontem ou de semana passada).
export const diaRef = (history: DayRecord[]): string => (history.length ? history[history.length - 1].data : todayISO());
