// code, name, currency, dial code, main time zone, typical gents haircut price (local currency)
type Row = [string, string, string, string, string, number];

const ROWS: Row[] = [
  ["LK", "Sri Lanka", "LKR", "94", "Asia/Colombo", 1000],
  ["IN", "India", "INR", "91", "Asia/Kolkata", 300],
  ["PK", "Pakistan", "PKR", "92", "Asia/Karachi", 800],
  ["BD", "Bangladesh", "BDT", "880", "Asia/Dhaka", 300],
  ["NP", "Nepal", "NPR", "977", "Asia/Kathmandu", 400],
  ["MV", "Maldives", "MVR", "960", "Indian/Maldives", 200],
  ["AE", "United Arab Emirates", "AED", "971", "Asia/Dubai", 60],
  ["SA", "Saudi Arabia", "SAR", "966", "Asia/Riyadh", 50],
  ["QA", "Qatar", "QAR", "974", "Asia/Qatar", 60],
  ["KW", "Kuwait", "KWD", "965", "Asia/Kuwait", 5],
  ["OM", "Oman", "OMR", "968", "Asia/Muscat", 5],
  ["BH", "Bahrain", "BHD", "973", "Asia/Bahrain", 5],
  ["SG", "Singapore", "SGD", "65", "Asia/Singapore", 25],
  ["MY", "Malaysia", "MYR", "60", "Asia/Kuala_Lumpur", 30],
  ["TH", "Thailand", "THB", "66", "Asia/Bangkok", 250],
  ["ID", "Indonesia", "IDR", "62", "Asia/Jakarta", 50000],
  ["PH", "Philippines", "PHP", "63", "Asia/Manila", 250],
  ["VN", "Vietnam", "VND", "84", "Asia/Ho_Chi_Minh", 100000],
  ["JP", "Japan", "JPY", "81", "Asia/Tokyo", 3500],
  ["KR", "South Korea", "KRW", "82", "Asia/Seoul", 20000],
  ["CN", "China", "CNY", "86", "Asia/Shanghai", 60],
  ["HK", "Hong Kong", "HKD", "852", "Asia/Hong_Kong", 150],
  ["TW", "Taiwan", "TWD", "886", "Asia/Taipei", 400],
  ["AU", "Australia", "AUD", "61", "Australia/Sydney", 35],
  ["NZ", "New Zealand", "NZD", "64", "Pacific/Auckland", 35],
  ["GB", "United Kingdom", "GBP", "44", "Europe/London", 20],
  ["IE", "Ireland", "EUR", "353", "Europe/Dublin", 25],
  ["DE", "Germany", "EUR", "49", "Europe/Berlin", 25],
  ["FR", "France", "EUR", "33", "Europe/Paris", 25],
  ["IT", "Italy", "EUR", "39", "Europe/Rome", 20],
  ["ES", "Spain", "EUR", "34", "Europe/Madrid", 15],
  ["PT", "Portugal", "EUR", "351", "Europe/Lisbon", 12],
  ["NL", "Netherlands", "EUR", "31", "Europe/Amsterdam", 25],
  ["BE", "Belgium", "EUR", "32", "Europe/Brussels", 25],
  ["AT", "Austria", "EUR", "43", "Europe/Vienna", 25],
  ["CH", "Switzerland", "CHF", "41", "Europe/Zurich", 40],
  ["SE", "Sweden", "SEK", "46", "Europe/Stockholm", 350],
  ["NO", "Norway", "NOK", "47", "Europe/Oslo", 400],
  ["DK", "Denmark", "DKK", "45", "Europe/Copenhagen", 250],
  ["FI", "Finland", "EUR", "358", "Europe/Helsinki", 25],
  ["PL", "Poland", "PLN", "48", "Europe/Warsaw", 60],
  ["CZ", "Czechia", "CZK", "420", "Europe/Prague", 400],
  ["GR", "Greece", "EUR", "30", "Europe/Athens", 12],
  ["RO", "Romania", "RON", "40", "Europe/Bucharest", 50],
  ["TR", "Turkey", "TRY", "90", "Europe/Istanbul", 400],
  ["RU", "Russia", "RUB", "7", "Europe/Moscow", 1000],
  ["UA", "Ukraine", "UAH", "380", "Europe/Kyiv", 300],
  ["IL", "Israel", "ILS", "972", "Asia/Jerusalem", 80],
  ["EG", "Egypt", "EGP", "20", "Africa/Cairo", 200],
  ["ZA", "South Africa", "ZAR", "27", "Africa/Johannesburg", 150],
  ["NG", "Nigeria", "NGN", "234", "Africa/Lagos", 5000],
  ["KE", "Kenya", "KES", "254", "Africa/Nairobi", 500],
  ["GH", "Ghana", "GHS", "233", "Africa/Accra", 50],
  ["MA", "Morocco", "MAD", "212", "Africa/Casablanca", 50],
  ["US", "United States", "USD", "1", "America/New_York", 25],
  ["CA", "Canada", "CAD", "1", "America/Toronto", 30],
  ["MX", "Mexico", "MXN", "52", "America/Mexico_City", 200],
  ["BR", "Brazil", "BRL", "55", "America/Sao_Paulo", 50],
  ["AR", "Argentina", "ARS", "54", "America/Argentina/Buenos_Aires", 10000],
  ["CL", "Chile", "CLP", "56", "America/Santiago", 10000],
  ["CO", "Colombia", "COP", "57", "America/Bogota", 25000],
  ["PE", "Peru", "PEN", "51", "America/Lima", 30],
];

export type Country = { code: string; name: string; currency: string; dial: string; tz: string; haircut: number };

export const COUNTRIES: Country[] = ROWS.map(([code, name, currency, dial, tz, haircut]) => ({ code, name, currency, dial, tz, haircut }))
  .sort((a, b) => a.name.localeCompare(b.name));

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));
export const DEFAULT_COUNTRY = BY_CODE.get("US")!;

export function getCountry(code?: string | null): Country {
  return (code && BY_CODE.get(code.toUpperCase())) || DEFAULT_COUNTRY;
}

export function flag(code: string) {
  return code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

/** Round to a "nice" price: 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10 × 10^k */
export function nicePrice(x: number) {
  if (x <= 0) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 7.5, 8, 9, 10];
  const n = x / p;
  const best = steps.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
  return Math.round(best * p * 100) / 100;
}

// NopeQ plan prices per currency (Free / Pro / AI). Others fall back to USD.
const PLAN_PRICES: Record<string, [number, number, number]> = {
  LKR: [0, 2500, 5500],
  INR: [0, 499, 999],
  PKR: [0, 1500, 3500],
  BDT: [0, 600, 1400],
  NPR: [0, 700, 1500],
  USD: [0, 9, 19],
  EUR: [0, 9, 19],
  GBP: [0, 8, 16],
  AUD: [0, 14, 29],
  NZD: [0, 15, 32],
  CAD: [0, 12, 25],
  SGD: [0, 12, 25],
  MYR: [0, 29, 59],
  AED: [0, 35, 69],
  SAR: [0, 35, 69],
  QAR: [0, 35, 69],
  PHP: [0, 299, 599],
  THB: [0, 199, 449],
  IDR: [0, 99000, 199000],
  ZAR: [0, 99, 199],
  NGN: [0, 7500, 15000],
  KES: [0, 799, 1599],
  JPY: [0, 1200, 2500],
  BRL: [0, 29, 59],
  MXN: [0, 149, 299],
  TRY: [0, 199, 399],
};
export function planPrices(currency: string): { currency: string; prices: [number, number, number] } {
  return PLAN_PRICES[currency] ? { currency, prices: PLAN_PRICES[currency] } : { currency: "USD", prices: PLAN_PRICES.USD };
}

export function formatMoney(amount: number, currency: string, locale = "en") {
  if (currency === "LKR") return `Rs. ${amount.toLocaleString("en", { maximumFractionDigits: 2 })}`;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

/** Turn what a customer typed into +<country code><number>. Returns null if it doesn't look like a phone number. */
export function normalizePhone(input: string, dial: string): string | null {
  let s = input.replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (!s.startsWith("+")) s = "+" + dial + s.replace(/^0+/, "");
  return /^\+[1-9]\d{6,14}$/.test(s) ? s : null;
}

export function currencySymbol(currency: string) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

/** Template prices are written in LKR; scale them to a country using the typical haircut price. */
export function localPrice(lkr: number, country: Country) {
  return country.code === "LK" ? lkr : nicePrice((lkr * country.haircut) / 1000);
}
