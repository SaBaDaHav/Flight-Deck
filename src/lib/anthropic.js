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

// ─── Prompt ───────────────────────────────────────────────────────────────────
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
- releaseNextDay: true when Release column shows "-->" OR "HH:MM +1"
- nightDuty: true if duty period encroaches 02:00–04:59 local time
- earlyStart: true if Report time is 05:00–05:59
- lateFinish: true if Release time is 23:00–01:59 (next day)
- woclEncroached: true if duty overlaps any part of 02:00–05:59
- numLegs: number of takeoff-landing legs (count of sectors)
- layover: true if TAFB column has a value OR <Accom> appears in sector string
- from/to: IATA codes from the From/To columns
- tafb: blank/null if not away from base
- For CONTINUATION rows: copy report/release/sectors from the preceding FLIGHT row
- Totals row at bottom: put in "totals" field (last row of the table, not an entry)
- Include EVERY row — do not skip any`;
