// Anthropic API calls — Phase 1: direct from browser; Phase 2: proxied via NAS backend.
// VITE_API_BASE="" → direct calls; VITE_API_BASE="https://..." → NAS proxy.

const API_BASE     = import.meta.env.VITE_API_BASE     || '';
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || '';

const MODEL = 'claude-sonnet-4-6';

function getHeaders() {
  if (API_BASE) {
    // NAS proxy mode — backend adds the API key server-side
    return { 'Content-Type': 'application/json' };
  }
  // Direct browser mode — key from env
  return {
    'Content-Type': 'application/json',
    'x-api-key': ANTHROPIC_KEY,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

function getEndpoint(path) {
  if (API_BASE) return `${API_BASE}${path}`;
  return `https://api.anthropic.com${path}`;
}

// Analyze a Merlot roster image and return parsed JSON schedule.
// imageBase64: data URI string (e.g. "data:image/png;base64,...")
export async function analyzeRosterImage(imageBase64) {
  const base64Data  = imageBase64.split(',')[1];
  const mediaType   = imageBase64.split(';')[0].split(':')[1];

  const body = {
    model: MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Data },
          },
          {
            type: 'text',
            text: ROSTER_EXTRACTION_PROMPT,
          },
        ],
      },
    ],
  };

  const resp = await fetch(getEndpoint('/v1/messages'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Anthropic API error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  const text = data.content?.[0]?.text || '';

  // Extract JSON block from response
  const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) throw new Error('No JSON found in AI response');

  return JSON.parse(jsonMatch[1]);
}

// Merge multiple roster results (for split-month images) by date, deduplicating and sorting
export function mergeRosterResults(results) {
  if (!results || results.length === 0) return null;
  const base = results[0];
  const allEntries = results.flatMap(r => r.entries || []);
  // Deduplicate by date (later result wins for same date)
  const byDate = {};
  for (const e of allEntries) byDate[e.date] = e;
  const merged = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  // Merge totals by summing H:MM fields
  const totalFields = ['flightTime', 'dutyTime', 'tafb', 'restTime'];
  const totals = {};
  for (const field of totalFields) {
    let sum = 0;
    for (const r of results) {
      if (r.totals?.[field]) {
        const [h, m] = r.totals[field].split(':').map(Number);
        sum += h * 60 + (m || 0);
      }
    }
    const h = Math.floor(sum / 60);
    const m = sum % 60;
    totals[field] = `${h}:${String(m).padStart(2, '0')}`;
  }
  return { crew: base.crew, entries: merged, totals };
}

// ─── Mobile Merlot List View extraction ──────────────────────────────────────

// Analyze a Merlot mobile app "Duties List" screenshot.
// Returns a raw array of { dutyCode, route, date, dow, report, release,
//   releaseNextDay, releaseDate } objects — caller does type/block post-processing.
// selectedYear: the calendar year currently selected in the UI (e.g. 2026).
export async function analyzeMobileRoster(imageBase64, selectedYear) {
  const base64Data = imageBase64.split(',')[1];
  const mediaType  = imageBase64.split(';')[0].split(':')[1];
  const yearToUse  = selectedYear || new Date().getFullYear();
  console.log('[Mobile] selectedYear passed in:', selectedYear, '→ yearToUse:', yearToUse);
  const prompt = MOBILE_ROSTER_PROMPT.replace(/\{\{YEAR\}\}/g, yearToUse);

  const body = {
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text',  text: prompt },
        ],
      },
    ],
  };

  const resp = await fetch(getEndpoint('/v1/messages'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Anthropic API error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  const text = data.content?.[0]?.text || '';
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(clean);
  const entries = Array.isArray(parsed) ? parsed : (parsed.entries || []);
  console.log('[Mobile] first date from AI:', entries[0]?.date);
  return entries;
}

const MOBILE_ROSTER_PROMPT = `This is a Merlot mobile app Duties List screenshot from Thai VietJet Air.

Each duty entry has TWO lines:
  Line 1: DUTY_CODE: ROUTE
  Line 2: Mon DD (Day) HH:MM L - [Mon DD (Day)] HH:MM L

Examples:
  "ICN2-1: BKK-ICN" / "Jun 01 (Mo) 00:55 L - 10:30 L"
  "PKX-1: BKK-PKX" / "Jun 08 (Mo) 16:50 L - Jun 09 (Tu) 00:45 L"
  "RERRP36-1: BKKBKK" / "Jun 06 (Sa) 00:00 L - 23:59 L"
  "970 PUR SIC-1: BKK-SGN-BKK" / "Jun 07 (Su) 10:35 L - 16:55 L"

RULES:
- dutyCode: everything before the colon on line 1 (e.g. "ICN2-1", "970 PUR SIC-1")
- route: everything after the colon on line 1 (e.g. "BKK-ICN", "BKK-SGN-BKK")
  If the route has no dashes (e.g. "BKKICN"), split into 3-letter codes: "BKK-ICN"
  If route is "BKKBKK" use "BKK-BKK"
- date: the date from line 2 start, as {{YEAR}}-MM-DD. The year is {{YEAR}} — use {{YEAR}} for ALL dates unless the month clearly wraps to next year (e.g. a Dec 31 entry releasing Jan 01 means that Jan 01 is {{YEAR}}+1)
- dow: 3-letter day abbreviation (Mon/Tue/Wed/Thu/Fri/Sat/Sun) from the (XX) abbreviation
- report: HH:MM — the first time on line 2 (strip the L suffix)
- release: HH:MM — the last time on line 2 (strip the L suffix)
- releaseNextDay: true if line 2 shows a second date before the release time
- IMPORTANT for multi-leg international flights: if the duty departs late night (e.g. 00:00-03:00) and the last arrival is next morning, releaseNextDay should be true even if no explicit second date is shown. Check if release time is earlier than report time — if so, releaseNextDay must be true.
- releaseDate: the release date as YYYY-MM-DD if different from date; otherwise omit

Return ONLY a valid JSON array — no markdown, no explanation, no code fences.
Schema: [{"dutyCode":"ICN2-1","route":"BKK-ICN","date":"{{YEAR}}-06-01","dow":"Mon","report":"00:55","release":"10:30","releaseNextDay":false}]`;

// ─── HR allowance sheet extraction ───────────────────────────────────────────

// Analyze an HR monthly allowance email (image or PDF) and return extracted rows.
// Returns array of { date, route, domMins, interMins, legs, perDiem, code, sim }
export async function analyzeHrSheet(fileBase64, mediaType) {
  const base64Data = fileBase64.split(',')[1];
  const isPdf = mediaType === 'application/pdf';

  const fileBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } }
    : { type: 'image',    source: { type: 'base64', media_type: mediaType,          data: base64Data } };

  const body = {
    model: MODEL,
    max_tokens: 4096,
    messages: [
      { role: 'user', content: [fileBlock, { type: 'text', text: HR_SHEET_PROMPT }] },
    ],
  };

  const resp = await fetch(getEndpoint('/v1/messages'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Anthropic API error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  const text = data.content?.[0]?.text || '';

  // Strip any markdown fences the model might add despite instructions
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(clean);
  return Array.isArray(parsed) ? parsed : (parsed.rows || []);
}

const HR_SHEET_PROMPT = `You are analyzing a Thai VietJet Air HR monthly allowance sheet (People Department email).

The table has these columns left to right:
DATE | ROUTE/DUTY | BLOCK DOM | BLOCK INTER | SEC | DUTY | SIM | TRANSPORT | PERDIEM DOM | PERDIEM INTER | CODE(1-7)

RULES:
- BLOCK DOM and BLOCK INTER are already in MINUTES (e.g. 325 = 5h 25m). Do NOT convert.
- DATE column: only rows where DATE is a number 1–31 are data rows. Skip the header and the totals/footer row.
- The last row (totals) has sums in the footer — skip it entirely.
- perDiem: "DOM" if PERDIEM DOM column has a value; "INTER" if PERDIEM INTER has a value; null if both blank.
- sim: 1 if the SIM column has any mark or value; 0 otherwise.
- legs: SEC column value as integer (e.g. 1.0 → 1); 0 if blank.
- code: CODE 1-7 column as string (e.g. "1", "DH-Sec1"); "" if blank.
- domMins / interMins: 0 if the column is blank or shows a dash.

Return ONLY a valid JSON array — no markdown, no explanation, no code fences. One object per calendar date row.
Schema: [{"date":1,"route":"BKK-ICN","domMins":0,"interMins":325,"legs":1,"perDiem":"INTER","code":"","sim":0}]`;

// ─── Roster prompt ────────────────────────────────────────────────────────────
const ROSTER_EXTRACTION_PROMPT = `You are analyzing a Thai VietJet Air (TVJ) Merlot Employee Roster Report image.

Extract ALL roster entries for every row shown and return ONLY a valid JSON object — no explanation, no markdown outside the JSON block.

MERLOT COLUMN ORDER (left to right):
Day | Date | Duty | Property | From | Report | To | Release | Scheduled Route Block | Flight Time | Duty Time | TAFB Time | Rest Time | Sector(s)/Event(s) | Allowances

SECTOR STRING FORMAT (from Sector(s)/Event(s) column):
  "850 BKK 2:25L ICN 10:00L - ICN <Accom>"
  → flight=850, origin=BKK, depTime=02:25, dest=ICN, arrTime=10:00
  → <Accom> means layover=true
  Times have "L" suffix (local) — strip the L when setting depTime/arrTime
  Multi-sector: each leg on its own line

DUTY TYPE RULES:
- Numeric/pairing codes (ICN2-1, 970-1, etc.) → type="FLIGHT"
- Row where Duty column is "-->" → type="CONTINUATION" (overnight duty continues from prev day)
- "RERRP36-N" in Duty column AND Property="R" → type="RERRP36"
- "RERRP2LD-N" in Duty column AND Property="R" → type="RERRP2LD"
- "SBA_B-N" → type="STANDBY"
- Empty/blank row → type="OFF"
- "[Pairing]: text" row → type="COMMENT", put text in comments[] of the PRECEDING entry
- "[Profile]: text" row → type="PROFILE"

Return this exact JSON schema:

\`\`\`json
{
  "crew": {
    "name": "string",
    "rank": "Captain | First Officer",
    "employeeCode": "string",
    "base": "string",
    "period": "YYYY-MM-DD to YYYY-MM-DD"
  },
  "entries": [
    {
      "date": "YYYY-MM-DD",
      "dow": "Mon|Tue|Wed|Thu|Fri|Sat|Sun",
      "type": "FLIGHT|RERRP36|RERRP2LD|STANDBY|OFF|CONTINUATION|COMMENT|PROFILE",
      "dutyCode": "string or null",
      "property": "R or null",
      "from": "IATA or null",
      "to": "IATA or null",
      "report": "HH:MM or null",
      "release": "HH:MM or null",
      "releaseNextDay": false,
      "scheduledBlock": "H:MM or null",
      "flightTime": "H:MM or null",
      "dutyTime": "H:MM or null",
      "tafb": "H:MM or null",
      "restTime": "H:MM or null",
      "sectors": [
        { "flight": "string", "origin": "IATA", "depTime": "HH:MM", "dest": "IATA", "arrTime": "HH:MM" }
      ],
      "numLegs": 0,
      "layover": false,
      "nightDuty": false,
      "earlyStart": false,
      "lateFinish": false,
      "woclEncroached": false,
      "comments": [],
      "allowances": ""
    }
  ],
  "totals": {
    "flightTime": "H:MM",
    "dutyTime": "H:MM",
    "tafb": "H:MM",
    "restTime": "H:MM"
  }
}
\`\`\`

FIELD RULES:
- scheduledBlock: value from the "Scheduled Route Block" column (H:MM block duration, e.g. "5:35")
- flightTime: value from the "Flight Time" column (H:MM, the column immediately to the RIGHT of Scheduled Route Block). MUST be extracted — never leave null if the column has a value.
- dutyTime: value from the "Duty Time" column (H:MM)
- tafb: value from the "TAFB Time" column — null/omit if the cell is blank
- restTime: value from the "Rest Time" column
- releaseNextDay: true when Release column shows "-->" OR "HH:MM +1"
- nightDuty: true if duty period encroaches 02:00–04:59 local time
- earlyStart: true if Report time is 05:00–05:59
- lateFinish: true if Release time is 23:00–01:59 (next day)
- woclEncroached: true if duty overlaps any part of 02:00–05:59
- numLegs: number of takeoff-landing legs (count of sectors)
- layover: true if TAFB column has a value OR <Accom> appears in sector string
- from/to: IATA codes from the From/To columns
- For CONTINUATION rows: copy report/release/sectors from the preceding FLIGHT row
- Totals row at bottom: put in "totals" field (last row of the table, not an entry)
- Include EVERY row — do not skip any`;

// ─── Swap/Giveaway flight extraction ─────────────────────────────────────────

// Analyze a swap/giveaway flight screenshot from another pilot's mobile Merlot.
// Returns array of { dutyCode, route, date, dow, report, release, releaseNextDay, numLegs }
export async function analyzeSwapFlight(imageBase64, selectedYear) {
  const base64Data = imageBase64.split(',')[1];
  const mediaType  = imageBase64.split(';')[0].split(':')[1];
  const yearToUse  = selectedYear || new Date().getFullYear();
  const prompt = SWAP_FLIGHT_PROMPT.replace(/\{\{YEAR\}\}/g, yearToUse);

  const body = {
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text',  text: prompt },
        ],
      },
    ],
  };

  const resp = await fetch(getEndpoint('/v1/messages'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Anthropic API error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  const text = data.content?.[0]?.text || '';
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(clean);
  return Array.isArray(parsed) ? parsed : (parsed.flights || []);
}

const SWAP_FLIGHT_PROMPT = `This is a Merlot mobile app screenshot showing flight duties for a swap or giveaway request at Thai VietJet Air.

Each entry has TWO lines:
  Line 1: DUTY_CODE: ROUTE  (e.g. "TKIX-1: BKK-TPE-KIX")
  Line 2: Mon DD (Day) HH:MM L - [Mon DD (Day)] HH:MM L  (e.g. "Jun 01 (Mo) 00:25 L - 11:55 L")

RULES:
- dutyCode: everything before the colon on line 1
- route: everything after the colon on line 1, normalized with dashes (e.g. "BKK-TPE-KIX")
- date: start date as {{YEAR}}-MM-DD
- dow: 3-letter abbreviation (Mon/Tue/Wed/Thu/Fri/Sat/Sun)
- report: HH:MM — first time on line 2 (this is the report/check-in time)
- release: HH:MM — last time on line 2 (this is the release time)
- releaseNextDay: true if line 2 shows a second date before the release time
- numLegs: count the number of airport codes minus 1 (e.g. BKK-TPE-KIX = 2 legs)

Return ONLY a valid JSON array — no markdown, no explanation.
Schema: [{"dutyCode":"TKIX-1","route":"BKK-TPE-KIX","date":"{{YEAR}}-06-01","dow":"Mon","report":"00:25","release":"11:55","releaseNextDay":false,"numLegs":2}]`;
