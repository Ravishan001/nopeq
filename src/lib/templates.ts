export type TemplateService = { section: string; name: string; price: number; duration: number; on: boolean };

export const BUSINESS_TYPES = [
  { id: "salon", icon: "✂️", si: "Salon / Barber", en: "Salon / Barber", ready: true },
  { id: "beauty", icon: "💅", si: "Beauty / Bridal", en: "Beauty / Bridal", ready: false },
  { id: "clinic", icon: "🩺", si: "Clinic", en: "Clinic", ready: false },
  { id: "dental", icon: "🦷", si: "Dental", en: "Dental", ready: false },
  { id: "cake", icon: "🎂", si: "Cake shop", en: "Cake shop", ready: false },
  { id: "tuition", icon: "📚", si: "Tuition", en: "Tuition", ready: false },
] as const;

export const SALON_SECTIONS = ["Gents", "Ladies", "Kids", "Bridal"];

export const SALON_SERVICES: TemplateService[] = [
  { section: "Gents", name: "Haircut", price: 1000, duration: 30, on: true },
  { section: "Gents", name: "Beard trim", price: 500, duration: 15, on: true },
  { section: "Gents", name: "Haircut + beard", price: 1300, duration: 45, on: true },
  { section: "Gents", name: "Hair wash", price: 300, duration: 15, on: false },
  { section: "Ladies", name: "Haircut + blow-dry", price: 2500, duration: 60, on: true },
  { section: "Ladies", name: "Hair colour", price: 6500, duration: 120, on: true },
  { section: "Ladies", name: "Hair straightening", price: 12000, duration: 180, on: false },
  { section: "Ladies", name: "Facial", price: 4500, duration: 60, on: false },
  { section: "Ladies", name: "Threading", price: 300, duration: 15, on: false },
  { section: "Kids", name: "Kids haircut", price: 700, duration: 20, on: true },
  { section: "Bridal", name: "Bridal dressing", price: 35000, duration: 240, on: false },
];

export const RESERVED_SLUGS = new Set([
  "login", "signup", "dashboard", "onboarding", "auth", "api", "b", "admin", "settings",
  "icons", "manifest", "forgot", "reset", "about", "pricing", "help", "terms", "privacy", "nopeq", "ravion",
]);

export function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}
