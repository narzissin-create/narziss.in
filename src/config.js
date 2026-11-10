export const config = {
  brand: "Narziss",
  logo: "/assets/logo-narziss.png",
  announcement: "Complimentary Express Delivery on orders above ₹1,999 | Use Code FIRST10 for 10% Off",
  about: "Narziss is a contemporary Indian menswear label defined by sculptural tailoring, tactile textiles, and effortless modern silhouettes. Every piece is crafted in small batches with meticulous attention to detail.",
  contact: {
    email: { label: "Email", display: "concierge@narziss.com", href: "mailto:concierge@narziss.com" },
    instagram: { label: "Instagram", display: "@narziss.official", href: "https://instagram.com" },
    whatsapp: { label: "WhatsApp", display: "+91 98765 43210", href: "https://wa.me/919876543210" },
  },
  terms: "All Narziss garments are eligible for 7-day hassle-free exchanges and returns. Items must be unworn with original tags attached.",
  mock: false,
  shipping: 0,
  gstPercent: 0,
  pricesIncludeGst: true,
  chargesConfirmed: true,
  maxQuantity: 3,
  assets: {
    heroes: [
      { desktop: "/assets/hero.png", mobile: "/assets/hero.png" },
    ],
    categoryImages: {
      trending: "/assets/hero.png",
      casual: "/assets/hero.png",
      formal: "/assets/hero.png",
    },
    collectionHeroes: {
      trending: "/assets/hero.png",
      casual: "/assets/hero.png",
      formal: "/assets/hero.png",
    },
    banner: "/assets/hero.png",
    shopImages: ["/assets/hero.png", "/assets/hero.png", "/assets/hero.png"],
  },
};
export const categories = [
  ["acid-wash-tees", "Acid Wash Tees", "upper"],
  ["printed-shirts", "Printed Shirts", "upper"],
  ["plain-shirts", "Plain Shirts", "upper"],
  ["trousers", "Trousers", "bottom"],
  ["cargo", "Cargo", "bottom"],
  ["pants", "Pants", "bottom"],
  ["bonkers-pants", "Bonkers Pants", "bottom"],
  ["japanese-cut-pants", "Japanese-Cut Pants", "bottom"],
].map(([slug, name, type]) => ({ slug, name, type }));
export const collections = ["formal", "casual", "trending"];
export const colours = [
  "violet",
  "black",
  "blue",
  "green",
  "yellow",
  "orange",
  "red",
  "white",
];
export const materials = {
  upper: ["cotton", "lycra", "polyester", "linen", "wool"],
  bottom: ["denim", "cotton", "wool", "polyester", "fleece"],
};
export const sizeCharts = {
  upper: [
    ["S", "36–38 (91–97)", "17 (43)", "27 (69)"],
    ["M", "38–40 (97–102)", "17.5 (44)", "28 (71)"],
    ["L", "40–42 (102–107)", "18 (46)", "29 (74)"],
    ["XL", "42–44 (107–112)", "18.5 (47)", "30 (76)"],
    ["XXL", "44–46 (112–117)", "19 (48)", "31 (79)"],
    ["3XL", "46–48 (117–122)", "19.5 (50)", "32 (81)"],
  ],
  bottom: [
    ["28", "28 (71)", "35 (89)", "30–32 (76–81)"],
    ["30", "30 (76)", "37 (94)", "30–32 (76–81)"],
    ["32", "32 (81)", "39 (99)", "31–33 (79–84)"],
    ["34", "34 (86)", "41 (104)", "31–33 (79–84)"],
    ["36", "36 (91)", "43 (109)", "31–33 (79–84)"],
    ["38", "38 (97)", "45 (114)", "31–33 (79–84)"],
  ],
};
