export type Mode = "slots" | "orders";
export type SizeOpt = { label: string; price: number };
export type ServiceOptions = { sizes?: SizeOpt[]; flavours?: string[] };
export type TemplateService = {
  section: string; name: string; price: number; duration: number; on: boolean;
  description?: string; options?: ServiceOptions;
};
export type BusinessKind = {
  id: string; icon: string; en: string; si: string; mode: Mode;
  sections: string[]; defaultSections: string[]; services: TemplateService[];
  staffWord?: { en: string; si: string }; // "Artist", "Doctor" …
  refs?: boolean;      // customers can attach reference photos
  placement?: boolean; // tattoo: "where on the body?"
  hint?: { en: string; si: string };
};

const S = (section: string, name: string, price: number, duration: number, on = true, description?: string): TemplateService =>
  ({ section, name, price, duration, on, description });
const P = (section: string, name: string, price: number, opts: ServiceOptions = {}, on = true, description?: string): TemplateService =>
  ({ section, name, price, duration: 30, on, description, options: opts });
const sizes = (...x: [string, number][]) => x.map(([label, price]) => ({ label, price }));

export const KINDS: BusinessKind[] = [
  // ---------- appointments (time slots) ----------
  {
    id: "salon", icon: "💇", en: "Salon", si: "Salon", mode: "slots",
    sections: ["Gents", "Ladies", "Kids", "Bridal"], defaultSections: ["Gents", "Ladies"],
    services: [
      S("Gents", "Haircut", 1000, 30), S("Gents", "Beard trim", 500, 15), S("Gents", "Haircut + beard", 1300, 45), S("Gents", "Hair wash", 300, 15, false),
      S("Ladies", "Haircut + blow-dry", 2500, 60), S("Ladies", "Hair colour", 6500, 120), S("Ladies", "Hair straightening", 12000, 180, false),
      S("Ladies", "Facial", 4500, 60, false), S("Ladies", "Threading", 300, 15, false),
      S("Kids", "Kids haircut", 700, 20), S("Bridal", "Bridal dressing", 35000, 240, false),
    ],
  },
  {
    id: "barber", icon: "💈", en: "Barber", si: "Barber", mode: "slots",
    sections: ["Gents", "Kids"], defaultSections: ["Gents"],
    services: [S("Gents", "Haircut", 800, 30), S("Gents", "Beard trim", 400, 15), S("Gents", "Haircut + beard", 1100, 45),
      S("Gents", "Hot towel shave", 700, 30, false), S("Kids", "Kids haircut", 600, 20)],
  },
  {
    id: "tattoo", icon: "🖋️", en: "Tattoo", si: "Tattoo", mode: "slots", refs: true, placement: true,
    staffWord: { en: "Artist", si: "Artist" },
    sections: ["Tattoo", "Piercing"], defaultSections: ["Tattoo"],
    hint: { en: "Long sessions, artist portfolios, reference photo upload and an optional deposit.", si: "දිග sessions, artist portfolio, reference photos, deposit එකක් දාන්නත් පුළුවන්." },
    services: [
      S("Tattoo", "Free consultation", 0, 30, true, "Talk about your idea"),
      S("Tattoo", "Small tattoo", 8000, 60, true, "Up to 5 cm"),
      S("Tattoo", "Medium tattoo", 25000, 180, true, "Palm size"),
      S("Tattoo", "Large session", 45000, 300, true, "Sleeve / back · one sitting"),
      S("Tattoo", "Touch-up", 3000, 60, false),
      S("Piercing", "Ear piercing", 2500, 30), S("Piercing", "Nose piercing", 3000, 30, false),
    ],
  },
  {
    id: "nails", icon: "💅", en: "Nails", si: "Nails", mode: "slots", refs: true,
    sections: ["Nails"], defaultSections: ["Nails"],
    services: [S("Nails", "Manicure", 2000, 45), S("Nails", "Pedicure", 2500, 60), S("Nails", "Gel nails", 4500, 90), S("Nails", "Nail art", 3500, 60)],
  },
  {
    id: "spa", icon: "💆", en: "Spa", si: "Spa", mode: "slots",
    sections: ["Massage", "Face"], defaultSections: ["Massage", "Face"],
    services: [S("Massage", "Full body massage", 6000, 60), S("Massage", "Head & shoulder", 2500, 30), S("Massage", "Foot reflexology", 3000, 45), S("Face", "Facial", 4500, 60)],
  },
  {
    id: "clinic", icon: "🩺", en: "Clinic", si: "Clinic", mode: "slots", staffWord: { en: "Doctor", si: "Doctor" },
    sections: ["General"], defaultSections: ["General"],
    services: [S("General", "Consultation", 2000, 15), S("General", "Follow-up", 1000, 10), S("General", "Medical check-up", 5000, 30)],
  },
  {
    id: "dental", icon: "🦷", en: "Dental", si: "Dental", mode: "slots", staffWord: { en: "Dentist", si: "Dentist" },
    sections: ["Dental"], defaultSections: ["Dental"],
    services: [S("Dental", "Check-up", 2000, 20), S("Dental", "Cleaning", 5000, 45), S("Dental", "Filling", 6000, 45), S("Dental", "Whitening", 25000, 60, false)],
  },
  {
    id: "pet", icon: "🐶", en: "Pet grooming", si: "Pet grooming", mode: "slots",
    sections: ["Grooming"], defaultSections: ["Grooming"],
    services: [S("Grooming", "Bath & dry", 2500, 60), S("Grooming", "Full groom", 5000, 120), S("Grooming", "Nail trim", 800, 15)],
  },
  {
    id: "car", icon: "🚗", en: "Car service", si: "Car service", mode: "slots",
    sections: ["Service"], defaultSections: ["Service"],
    services: [S("Service", "Body wash", 1500, 45), S("Service", "Interior clean", 4000, 90), S("Service", "Full service", 12000, 180)],
  },
  {
    id: "other_slots", icon: "📅", en: "Other appointments", si: "වෙනත් appointments", mode: "slots",
    sections: ["General"], defaultSections: ["General"],
    services: [S("General", "Appointment", 0, 30)],
  },

  // ---------- orders (pick a day) ----------
  {
    id: "cake", icon: "🎂", en: "Cake shop", si: "Cake shop", mode: "orders", refs: true,
    sections: ["Cakes", "Cupcakes"], defaultSections: ["Cakes", "Cupcakes"],
    hint: { en: "Customers pick a cake, size, flavour and a day. You set how many orders a day you can take.", si: "Customer cake එක, size එක, flavour එක, දවස තෝරනවා. දවසකට ගන්න පුළුවන් orders ගාණ ඔයා දානවා." },
    services: [
      P("Cakes", "Birthday cake", 3500, { sizes: sizes(["0.5 kg", 2000], ["1 kg", 3500], ["1.5 kg", 5000], ["2 kg", 6500]), flavours: ["Chocolate", "Vanilla", "Red velvet", "Ribbon"] }),
      P("Cakes", "Wedding cake", 18000, { sizes: sizes(["2 tier", 18000], ["3 tier", 28000]), flavours: ["Chocolate", "Butter"] }),
      P("Cakes", "Chocolate gateau", 4200, { sizes: sizes(["1 kg", 4200], ["2 kg", 8000]) }),
      P("Cupcakes", "Cupcakes ×12", 2400, { flavours: ["Chocolate", "Vanilla"] }),
    ],
  },
  {
    id: "bakery", icon: "🥐", en: "Bakery", si: "Bakery", mode: "orders",
    sections: ["Orders"], defaultSections: ["Orders"],
    services: [P("Orders", "Party pack ×20", 3000), P("Orders", "Short eats ×50", 4500), P("Orders", "Bread loaves ×10", 1500)],
  },
  {
    id: "florist", icon: "💐", en: "Florist", si: "Florist", mode: "orders", refs: true,
    sections: ["Flowers"], defaultSections: ["Flowers"],
    services: [
      P("Flowers", "Bouquet", 3500, { sizes: sizes(["Small", 3500], ["Medium", 6000], ["Large", 9500]), flavours: ["Roses", "Mixed", "Lilies"] }),
      P("Flowers", "Table arrangement", 5000), P("Flowers", "Wedding flowers", 25000, {}, false),
    ],
  },
  {
    id: "catering", icon: "🍱", en: "Catering", si: "Catering", mode: "orders",
    sections: ["Catering"], defaultSections: ["Catering"],
    services: [
      P("Catering", "Lunch packets", 15000, { sizes: sizes(["×25", 15000], ["×50", 29000], ["×100", 56000]), flavours: ["Chicken", "Fish", "Veg"] }),
      P("Catering", "Short eats platter", 6000), P("Catering", "Buffet (50 people)", 75000, {}, false),
    ],
  },
  {
    id: "gifts", icon: "🎁", en: "Custom gifts", si: "Custom gifts", mode: "orders", refs: true,
    sections: ["Gifts"], defaultSections: ["Gifts"],
    services: [P("Gifts", "Gift box", 3500, { sizes: sizes(["Small", 3500], ["Medium", 5500], ["Large", 8000]) }), P("Gifts", "Custom mug", 1800), P("Gifts", "Photo frame", 2500)],
  },
  {
    id: "other_orders", icon: "📦", en: "Other orders", si: "වෙනත් orders", mode: "orders",
    sections: ["Orders"], defaultSections: ["Orders"],
    services: [P("Orders", "Order", 0)],
  },
];

export const getKind = (id?: string | null) => KINDS.find((k) => k.id === id) ?? KINDS[0];

/** Read service options safely (the column is free-form JSON). */
export function readOptions(o: unknown): { sizes: SizeOpt[]; flavours: string[] } {
  const x = (o && typeof o === "object" ? o : {}) as ServiceOptions;
  return {
    sizes: Array.isArray(x.sizes) ? x.sizes.filter((s) => s && typeof s.label === "string" && Number.isFinite(Number(s.price))).map((s) => ({ label: s.label, price: Number(s.price) })) : [],
    flavours: Array.isArray(x.flavours) ? x.flavours.filter((f) => typeof f === "string") : [],
  };
}

export const RESERVED_SLUGS = new Set([
  "login", "signup", "dashboard", "onboarding", "auth", "api", "b", "o", "admin", "settings",
  "icons", "manifest", "forgot", "reset", "about", "pricing", "help", "terms", "privacy", "nopeq", "ravion",
]);

export function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}
