import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Store owner. To manage this seeded store inside the admin dashboard you MUST
// own it in Clerk. Set SEED_STORE_OWNER_ID to YOUR Clerk user id and re-run the
// seed, otherwise the store will belong to the placeholder id below and will
// not show up under your account.
// ---------------------------------------------------------------------------
const OWNER_ID = process.env.SEED_STORE_OWNER_ID || "seed-demo-user";

// ---------------------------------------------------------------------------
// Image URL helpers. Every Unsplash photo id referenced below was curl-verified
// to return HTTP 200 with an image/* content-type before being embedded.
// picsum.photos is used as an always-available fallback that also gives each
// product a unique third image for variety.
// ---------------------------------------------------------------------------
const u = (id: string, w = 800) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;
const pic = (slug: string) => `https://picsum.photos/seed/${slug}/800/800`;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// ---------------------------------------------------------------------------
// Category definitions. Each category owns a billboard whose label matches the
// category name and whose imageUrl is a verified wide Unsplash photo.
// ---------------------------------------------------------------------------
const CATEGORIES: { name: string; billboardImg: string }[] = [
  { name: "Electronics", billboardImg: "1498049794561-7780e7231661" },
  { name: "Laptops", billboardImg: "1517336714731-489689fd1ca8" },
  { name: "Smartphones", billboardImg: "1511707171634-5f897ff02aa9" },
  { name: "Fashion", billboardImg: "1441986300917-64674bd600d8" },
  { name: "Shoes", billboardImg: "1542291026-7eec264c27ff" },
  { name: "Accessories", billboardImg: "1523275335684-37898b6baf30" },
  { name: "Furniture", billboardImg: "1555041469-a586c61ea9bc" },
  { name: "Home Decor", billboardImg: "1513694203232-719a280e022f" },
  { name: "Kitchen", billboardImg: "1544716278-ca5e3f4abd8c" },
  { name: "Books", billboardImg: "1512820790803-83ca734da794" },
  { name: "Beauty", billboardImg: "1596462502278-27bfdc403348" },
  { name: "Fitness", billboardImg: "1571019613454-1cb2f99b2d8b" },
];

const HERO_LABEL = "Summer Collection 2024 — Up to 40% Off";
const HERO_IMG = "1607082348824-0a96f2a4b9da";

// ---------------------------------------------------------------------------
// Per-category pools of verified Unsplash photo ids used for product imagery.
// Each product draws two ids from its category pool (cycled for variety) plus a
// unique picsum image, so every product ends up with three working images.
// ---------------------------------------------------------------------------
const CATEGORY_IMAGES: Record<string, string[]> = {
  Electronics: [
    "1505740420928-5e560c06d30e",
    "1583394838336-acd977736f90",
    "1550009158-9ebf69173e03",
    "1526170375885-4d8ecf77b99f",
    "1587049352846-4a222e784d38",
    "1498049794561-7780e7231661",
    "1546435770-a3e426bf472b",
    "1484704849700-f032a568e944",
  ],
  Laptops: [
    "1541807084-5c52b6b3adef",
    "1496181133206-80ce9b88a853",
    "1519389950473-47ba0277781c",
    "1593642702821-c8da6771f0c6",
    "1517059224940-d4af9eec41b7",
    "1517336714731-489689fd1ca8",
    "1525547719571-a2d4ac8945e2",
    "1531297484001-80022131f5a1",
  ],
  Smartphones: [
    "1592899677977-9c10ca588bbd",
    "1523206489230-c012c64b2b48",
    "1512499617640-c74ae3a79d37",
    "1567016432779-094069958ea5",
    "1511707171634-5f897ff02aa9",
    "1580910051074-3eb694886505",
    "1510557880182-3d4d3cba35a5",
  ],
  Fashion: [
    "1523170335258-f5ed11844a49",
    "1434056886845-dac89ffe9b56",
    "1524592094714-0f0654e20314",
    "1567401893414-76b7b1e5a7a5",
    "1441986300917-64674bd600d8",
    "1490114538077-0a7f8cb49891",
    "1489987707025-afc232f7ea0f",
  ],
  Shoes: [
    "1595950653106-6c9ebd614d3a",
    "1600269452121-4f2416e55c28",
    "1549298916-b41d501d3772",
    "1560343090-f0409e92791a",
    "1608231387042-66d1773070a5",
    "1606107557195-0e29a4b5b4aa",
    "1487412720507-e7ab37603c6f",
    "1542291026-7eec264c27ff",
  ],
  Accessories: [
    "1524805444758-089113d48a6d",
    "1572569511254-d8f925fe2cbb",
    "1546868871-7041f2a55e12",
    "1546938576-6e6a64f317cc",
    "1585386959984-a4155224a1ad",
    "1523275335684-37898b6baf30",
    "1508685096489-7aacd43bd3b1",
    "1611085583191-a3b181a88401",
  ],
  Furniture: [
    "1533090161767-e6ffed986c88",
    "1586023492125-27b2c045efd7",
    "1567538096630-e0c55bd6374c",
    "1524758631624-e2822e304c36",
    "1555041469-a586c61ea9bc",
    "1493663284031-b7e3aefcae8e",
    "1538688525198-9b88f6f53126",
  ],
  "Home Decor": [
    "1616486338812-3dadae4b4ace",
    "1583847268964-b28dc8f51f92",
    "1522708323590-d24dbb6b0267",
    "1556909114-f6e7ad7d3136",
    "1513694203232-719a280e022f",
    "1507473885765-e6ed057f782c",
    "1493552152660-f915ab47ae9d",
  ],
  Kitchen: [
    "1602810318383-e386cc2a3ccf",
    "1517836357463-d25dfeac3438",
    "1608571423902-eed4a5ad8108",
    "1594633312681-425c7b97ccd1",
    "1583743814966-8936f5b7be1a",
    "1544716278-ca5e3f4abd8c",
    "1556910103-1c02745aae4d",
    "1585515320310-259814833e62",
  ],
  Books: [
    "1544947950-fa07a98d237f",
    "1524995997946-a1c2e315a42f",
    "1481627834876-b7833e8f5570",
    "1476275466078-4007374efbbe",
    "1543002588-bfa74002ed7e",
    "1507003211169-0a1dd7228f2d",
    "1512756290469-ec264b7fbf87",
    "1512820790803-83ca734da794",
    "1519682337058-a94d519337bc",
    "1497633762265-9d179a990aa6",
  ],
  Beauty: [
    "1583454110551-21f2fa2afe61",
    "1522335789203-aabd1fc54bc9",
    "1526506118085-60ce8714f8c5",
    "1571781926291-c477ebfd024b",
    "1517649763962-0c623066013b",
    "1596462502278-27bfdc403348",
    "1512496015851-a90fb38ba796",
    "1620916566398-39f1143ab7be",
  ],
  Fitness: [
    "1534438327276-14e5300c3a48",
    "1518611012118-696072aa579a",
    "1526947425960-945c6e72858f",
    "1571019613454-1cb2f99b2d8b",
    "1541534741688-6078c6bfb5c5",
    "1517963879433-6ad2b056d712",
  ],
};

// ---------------------------------------------------------------------------
// Size + color master data.
// ---------------------------------------------------------------------------
const SIZES: { name: string; value: string }[] = [
  { name: "Small", value: "S" },
  { name: "Medium", value: "M" },
  { name: "Large", value: "L" },
  { name: "X-Large", value: "XL" },
  { name: "One Size", value: "OS" },
];

const COLORS: { name: string; value: string }[] = [
  { name: "Black", value: "#000000" },
  { name: "White", value: "#FFFFFF" },
  { name: "Blue", value: "#2563EB" },
  { name: "Red", value: "#DC2626" },
  { name: "Green", value: "#16A34A" },
  { name: "Silver", value: "#C0C0C0" },
  { name: "Gray", value: "#6B7280" },
  { name: "Beige", value: "#E3DAC9" },
];

// ---------------------------------------------------------------------------
// Product catalog. Each product is fully populated: name, brand, description,
// price and (for most) a higher originalPrice so a discount shows. `size` is a
// size value (S/M/L/XL/OS), `color` a color name. `orig` is omitted where we
// want a no-discount product for variety. `oos: true` marks out-of-stock.
// Images are assigned in the create loop from CATEGORY_IMAGES + a picsum image.
// ---------------------------------------------------------------------------
type ProductSeed = {
  name: string;
  brand: string;
  description: string;
  price: number;
  orig?: number;
  category: string;
  size: string;
  color: string;
  featured?: boolean;
  oos?: boolean;
};

const PRODUCTS: ProductSeed[] = [
  // ------------------------------------------------------------- Electronics
  { name: "Sony WH-1000XM5 Wireless Headphones", brand: "Sony", price: 349.99, orig: 399.99, category: "Electronics", size: "OS", color: "Black", featured: true, description: "Industry-leading noise cancellation with 30-hour battery life and crystal-clear hands-free calling." },
  { name: "Bose SoundLink Flex Bluetooth Speaker", brand: "Bose", price: 129.0, category: "Electronics", size: "OS", color: "Blue", description: "Portable waterproof speaker with PositionIQ technology for balanced sound anywhere you go." },
  { name: "Anker 737 Power Bank 24000mAh", brand: "Anker", price: 89.99, orig: 109.99, category: "Electronics", size: "OS", color: "Black", description: "Massive 24,000mAh capacity with 140W fast charging to power laptops and phones on the go." },
  { name: "Logitech MX Master 3S Wireless Mouse", brand: "Logitech", price: 89.99, orig: 99.99, category: "Electronics", size: "OS", color: "Gray", description: "Ultra-precise 8K DPI tracking with near-silent clicks and a sculpted ergonomic shape." },
  { name: "GoPro HERO12 Black Action Camera", brand: "GoPro", price: 349.99, orig: 399.99, category: "Electronics", size: "OS", color: "Black", featured: true, description: "5.3K60 video with HyperSmooth 6.0 stabilization in a rugged, waterproof body." },
  { name: "Apple AirPods Pro (2nd Generation)", brand: "Apple", price: 199.99, orig: 249.0, category: "Electronics", size: "OS", color: "White", description: "Adaptive audio and active noise cancellation with a longer-lasting rechargeable case." },
  { name: "Samsung T7 Portable SSD 1TB", brand: "Samsung", price: 99.99, category: "Electronics", size: "OS", color: "Gray", description: "Pocket-sized 1TB SSD with 1,050MB/s transfer speeds and a shock-resistant build." },
  { name: "JBL Charge 5 Portable Speaker", brand: "JBL", price: 149.99, orig: 179.95, category: "Electronics", size: "OS", color: "Red", description: "20 hours of bold JBL Pro Sound plus a built-in power bank to charge your devices." },
  { name: "Ring Video Doorbell 4", brand: "Ring", price: 159.99, category: "Electronics", size: "OS", color: "Black", oos: true, description: "1080p HD video with color pre-roll and advanced motion detection for your front door." },
  { name: "Kindle Paperwhite 16GB", brand: "Amazon", price: 139.99, category: "Electronics", size: "OS", color: "Black", description: "6.8-inch glare-free display with an adjustable warm light and weeks of battery life." },
  { name: "TP-Link Deco XE75 Mesh WiFi System", brand: "TP-Link", price: 199.99, orig: 229.99, category: "Electronics", size: "OS", color: "White", description: "Tri-band WiFi 6E mesh covering up to 5,500 sq ft with seamless roaming across rooms." },

  // ----------------------------------------------------------------- Laptops
  { name: 'Apple MacBook Pro 14" M3', brand: "Apple", price: 1799.0, orig: 1999.0, category: "Laptops", size: "OS", color: "Silver", featured: true, description: "14-inch Liquid Retina XDR display powered by the M3 chip for pro-grade performance." },
  { name: "Dell XPS 13 Plus", brand: "Dell", price: 1199.0, orig: 1299.0, category: "Laptops", size: "OS", color: "Silver", description: "InfinityEdge 13.4-inch display, 12th-gen Intel Core and a seamless glass touchpad." },
  { name: "ASUS ROG Zephyrus G14", brand: "ASUS", price: 1499.99, orig: 1599.99, category: "Laptops", size: "OS", color: "Black", featured: true, description: "Compact 14-inch gaming powerhouse with Ryzen 9 and dedicated RTX graphics." },
  { name: "Lenovo ThinkPad X1 Carbon Gen 11", brand: "Lenovo", price: 1349.0, orig: 1449.0, category: "Laptops", size: "OS", color: "Black", description: "Featherlight business ultrabook with a legendary keyboard and MIL-STD durability." },
  { name: "HP Spectre x360 14", brand: "HP", price: 1249.99, orig: 1399.99, category: "Laptops", size: "OS", color: "Silver", description: "Convertible 2-in-1 with a vivid OLED touch display and all-day battery life." },
  { name: "Microsoft Surface Laptop 5", brand: "Microsoft", price: 999.0, category: "Laptops", size: "OS", color: "Silver", description: "Sleek 13.5-inch PixelSense touchscreen with responsive 12th-gen Intel performance." },
  { name: "Acer Swift 3 Ultrabook", brand: "Acer", price: 699.99, category: "Laptops", size: "OS", color: "Gray", description: "Lightweight aluminum laptop with Ryzen 7 and a bright Full HD IPS display." },
  { name: "Razer Blade 15 Gaming Laptop", brand: "Razer", price: 1999.0, orig: 2199.0, category: "Laptops", size: "OS", color: "Black", oos: true, description: "15.6-inch QHD 240Hz display with RTX 4070 in a precision CNC aluminum chassis." },
  { name: "LG Gram 17", brand: "LG", price: 1399.99, category: "Laptops", size: "OS", color: "White", description: "Remarkably light 17-inch laptop weighing under 3 lbs with a long-lasting 80Wh battery." },
  { name: "MSI Creator Z16", brand: "MSI", price: 1799.99, category: "Laptops", size: "OS", color: "Black", description: "16-inch QHD+ touch display tuned for creators with Core i7 and RTX graphics." },
  { name: "Framework Laptop 13", brand: "Framework", price: 1099.0, orig: 1199.0, category: "Laptops", size: "OS", color: "Silver", description: "Modular, repairable laptop with swappable ports and fully upgradeable internals." },

  // ------------------------------------------------------------- Smartphones
  { name: "Apple iPhone 15 Pro Max", brand: "Apple", price: 1099.0, orig: 1199.0, category: "Smartphones", size: "OS", color: "Silver", featured: true, description: "Titanium design, the A17 Pro chip and a 5x telephoto camera for pro-level shots." },
  { name: "Samsung Galaxy S24 Ultra", brand: "Samsung", price: 1199.99, orig: 1299.99, category: "Smartphones", size: "OS", color: "Black", featured: true, description: "Built-in S Pen, a 200MP camera and a brilliant 6.8-inch Dynamic AMOLED display." },
  { name: "Google Pixel 8 Pro", brand: "Google", price: 899.0, orig: 999.0, category: "Smartphones", size: "OS", color: "Blue", description: "Google Tensor G3 with best-in-class computational photography and 7 years of updates." },
  { name: "OnePlus 12", brand: "OnePlus", price: 749.99, orig: 799.99, category: "Smartphones", size: "OS", color: "Green", description: "Snapdragon 8 Gen 3, blazing 100W SUPERVOOC charging and a smooth 120Hz display." },
  { name: "Nothing Phone (2)", brand: "Nothing", price: 599.0, category: "Smartphones", size: "OS", color: "White", description: "Signature Glyph Interface and clean Nothing OS on a 6.7-inch OLED screen." },
  { name: "Xiaomi 14 Pro", brand: "Xiaomi", price: 899.99, category: "Smartphones", size: "OS", color: "Black", description: "Leica-tuned quad camera system paired with a bright LTPO AMOLED display." },
  { name: "Motorola Edge 40 Pro", brand: "Motorola", price: 699.99, orig: 799.99, category: "Smartphones", size: "OS", color: "Black", oos: true, description: "Curved 165Hz pOLED display with rapid 125W TurboPower charging." },
  { name: "Samsung Galaxy Z Flip5", brand: "Samsung", price: 899.99, orig: 999.99, category: "Smartphones", size: "OS", color: "Green", description: "Compact foldable with a larger Flex Window and a pocketable folded design." },
  { name: "Apple iPhone 15", brand: "Apple", price: 749.0, orig: 799.0, category: "Smartphones", size: "OS", color: "Blue", description: "Dynamic Island, a 48MP main camera and USB-C in a durable aluminum frame." },
  { name: "Google Pixel 8a", brand: "Google", price: 499.0, category: "Smartphones", size: "OS", color: "Blue", description: "Flagship Tensor performance and clean Android in an affordable, compact package." },
  { name: "ASUS ROG Phone 8", brand: "ASUS", price: 999.99, category: "Smartphones", size: "OS", color: "Black", description: "Gaming-first phone with a 165Hz AMOLED screen, AirTriggers and a huge battery." },

  // ----------------------------------------------------------------- Fashion
  { name: "Classic Denim Trucker Jacket", brand: "Levi's", price: 79.99, orig: 98.0, category: "Fashion", size: "M", color: "Blue", description: "Timeless denim jacket with a tailored fit and a durable button-front closure." },
  { name: "Merino Wool Crewneck Sweater", brand: "Uniqlo", price: 59.99, orig: 79.99, category: "Fashion", size: "L", color: "Beige", description: "Soft, breathable merino knit that layers easily from the office to the weekend." },
  { name: "Oxford Cotton Button-Down Shirt", brand: "Ralph Lauren", price: 49.99, orig: 69.5, category: "Fashion", size: "M", color: "White", description: "Crisp everyday oxford shirt with a classic collar and a single chest pocket." },
  { name: "Slim Fit Chino Trousers", brand: "Dockers", price: 54.99, category: "Fashion", size: "L", color: "Beige", description: "Stretch cotton chinos with a modern slim leg cut for all-day comfort." },
  { name: "Puffer Winter Coat", brand: "The North Face", price: 179.99, orig: 229.99, category: "Fashion", size: "XL", color: "Black", featured: true, description: "Insulated water-repellent puffer that keeps you warm through the harshest winters." },
  { name: "Graphic Cotton T-Shirt", brand: "Nike", price: 24.99, category: "Fashion", size: "M", color: "White", description: "Soft ringspun cotton tee with a relaxed fit and a bold front print." },
  { name: "Tailored Wool Blazer", brand: "Hugo Boss", price: 199.99, orig: 249.99, category: "Fashion", size: "L", color: "Gray", description: "Sharp single-breasted blazer in Italian wool for a polished, versatile look." },
  { name: "Fleece Zip-Up Hoodie", brand: "Adidas", price: 44.99, category: "Fashion", size: "M", color: "Gray", description: "Cozy brushed-fleece hoodie with a full zip and roomy kangaroo pockets." },
  { name: "Pleated Midi Skirt", brand: "Zara", price: 39.99, orig: 49.99, category: "Fashion", size: "S", color: "Black", oos: true, description: "Flowing pleated midi skirt with an elastic waist for effortless movement." },
  { name: "Linen Summer Dress", brand: "H&M", price: 49.99, category: "Fashion", size: "S", color: "White", description: "Breezy pure-linen dress with a relaxed silhouette made for warm days." },
  { name: "Cashmere Blend Scarf", brand: "Burberry", price: 89.99, orig: 120.0, category: "Fashion", size: "M", color: "Beige", description: "Luxuriously soft cashmere-blend scarf that adds warmth and refinement to any outfit." },

  // ------------------------------------------------------------------- Shoes
  { name: "Nike Air Max 270", brand: "Nike", price: 139.99, orig: 160.0, category: "Shoes", size: "L", color: "Black", featured: true, description: "A big-window Max Air unit delivers all-day comfort with a bold street look." },
  { name: "Adidas Ultraboost Light", brand: "Adidas", price: 159.99, orig: 190.0, category: "Shoes", size: "M", color: "White", description: "Responsive BOOST Light midsole for the lightest, springiest Ultraboost ride yet." },
  { name: "Converse Chuck 70 High Top", brand: "Converse", price: 84.99, orig: 95.0, category: "Shoes", size: "M", color: "Red", description: "Premium canvas reissue of the iconic high-top with vintage-inspired details." },
  { name: "Timberland 6-Inch Premium Boots", brand: "Timberland", price: 189.99, orig: 218.0, category: "Shoes", size: "XL", color: "Beige", description: "Waterproof nubuck boots built to last with a padded collar for extra comfort." },
  { name: "New Balance 990v6", brand: "New Balance", price: 199.99, orig: 219.99, category: "Shoes", size: "L", color: "Gray", featured: true, description: "Made-in-USA classic with ENCAP midsole cushioning and premium suede uppers." },
  { name: "Vans Old Skool", brand: "Vans", price: 69.99, category: "Shoes", size: "M", color: "Black", description: "Low-top skate shoe with the signature side stripe and a durable suede toe cap." },
  { name: "Dr. Martens 1460 Boots", brand: "Dr. Martens", price: 149.99, orig: 170.0, category: "Shoes", size: "L", color: "Black", description: "Iconic 8-eye leather boots with air-cushioned soles and yellow welt stitching." },
  { name: "ASICS Gel-Kayano 30", brand: "ASICS", price: 159.99, orig: 165.0, category: "Shoes", size: "M", color: "Blue", oos: true, description: "Stability running shoe with the 4D Guidance System and plush FF Blast+ cushioning." },
  { name: "Puma Suede Classic", brand: "Puma", price: 64.99, category: "Shoes", size: "M", color: "Green", description: "Retro suede sneaker with the timeless Formstrip and cushioned everyday comfort." },
  { name: "Salomon XT-6 Trail Shoe", brand: "Salomon", price: 179.99, category: "Shoes", size: "L", color: "Black", description: "Technical trail runner with Quicklace and an aggressive grip for any terrain." },
  { name: "Birkenstock Arizona Sandals", brand: "Birkenstock", price: 99.99, category: "Shoes", size: "M", color: "Beige", description: "Contoured cork footbed sandals with adjustable straps for a custom, supportive fit." },

  // ------------------------------------------------------------- Accessories
  { name: "Casio G-Shock GA-2100", brand: "Casio", price: 99.99, orig: 120.0, category: "Accessories", size: "OS", color: "Black", featured: true, description: "Slim carbon-core-guard watch with shock resistance and 200m water resistance." },
  { name: "Ray-Ban Wayfarer Sunglasses", brand: "Ray-Ban", price: 139.99, orig: 163.0, category: "Accessories", size: "OS", color: "Black", description: "Iconic acetate frames fitted with 100% UV-protective G-15 lenses." },
  { name: "Leather Weekender Duffle Bag", brand: "Fossil", price: 179.99, orig: 228.0, category: "Accessories", size: "OS", color: "Beige", description: "Full-grain leather duffle with a roomy interior sized for weekend getaways." },
  { name: "Minimalist Steel Watch", brand: "Daniel Wellington", price: 179.99, orig: 229.0, category: "Accessories", size: "OS", color: "Silver", description: "Clean Scandinavian design with a slim case and easily interchangeable straps." },
  { name: "Genuine Leather Bifold Wallet", brand: "Bellroy", price: 89.99, category: "Accessories", size: "OS", color: "Black", description: "Slim RFID-blocking wallet crafted from environmentally certified leather." },
  { name: "Woven Leather Belt", brand: "Tommy Hilfiger", price: 49.99, category: "Accessories", size: "OS", color: "Beige", description: "Braided leather belt with an adjustable fit and a polished metal buckle." },
  { name: "Cashmere-Blend Beanie", brand: "Carhartt", price: 29.99, orig: 34.99, category: "Accessories", size: "OS", color: "Gray", description: "Warm ribbed-knit beanie made with a soft cashmere blend and a classic cuff." },
  { name: "Aviator Polarized Sunglasses", brand: "Oakley", price: 129.99, category: "Accessories", size: "OS", color: "Black", oos: true, description: "Lightweight metal aviators with polarized lenses that cut glare on bright days." },
  { name: "Silk Neck Tie", brand: "Brooks Brothers", price: 59.99, category: "Accessories", size: "OS", color: "Blue", description: "Handcrafted silk tie with a subtle woven pattern for formal occasions." },
  { name: "Travel Backpack 30L", brand: "Herschel", price: 89.99, orig: 109.99, category: "Accessories", size: "OS", color: "Gray", featured: true, description: "Durable 30L daypack with a padded laptop sleeve and signature striped lining." },
  { name: "Apple Watch Sport Band", brand: "Apple", price: 39.99, orig: 49.0, category: "Accessories", size: "OS", color: "Blue", description: "Comfortable fluoroelastomer band with a secure pin-and-tuck closure." },

  // --------------------------------------------------------------- Furniture
  { name: "Herman Miller Aeron Chair", brand: "Herman Miller", price: 1195.0, orig: 1395.0, category: "Furniture", size: "OS", color: "Black", featured: true, description: "Ergonomic icon with PostureFit SL support and breathable 8Z Pellicle mesh." },
  { name: "Mid-Century Fabric Sofa", brand: "West Elm", price: 799.0, orig: 999.0, category: "Furniture", size: "OS", color: "Gray", description: "Three-seat sofa with tapered wood legs and plush high-resiliency cushions." },
  { name: "Solid Oak Coffee Table", brand: "IKEA", price: 299.99, category: "Furniture", size: "OS", color: "Beige", description: "Handsome solid-oak table with a lower shelf for books, remotes and magazines." },
  { name: "Ergonomic Standing Desk", brand: "Fully", price: 549.0, orig: 649.0, category: "Furniture", size: "OS", color: "White", description: "Electric height-adjustable desk with programmable presets and a rock-stable frame." },
  { name: "Velvet Accent Armchair", brand: "Article", price: 449.0, orig: 549.0, category: "Furniture", size: "OS", color: "Blue", description: "Sink-in velvet armchair with solid wood legs and a supportive high back." },
  { name: "Queen Platform Bed Frame", brand: "Zinus", price: 279.99, category: "Furniture", size: "OS", color: "Gray", description: "Upholstered platform bed with sturdy slats and no box spring required." },
  { name: "5-Shelf Bookcase", brand: "IKEA", price: 129.99, orig: 149.99, category: "Furniture", size: "OS", color: "Beige", oos: true, description: "Versatile open bookcase in durable engineered wood that suits any room." },
  { name: "Reclining Leather Sofa", brand: "La-Z-Boy", price: 1299.0, orig: 1499.0, category: "Furniture", size: "OS", color: "Black", description: "Top-grain leather recliner sofa with power reclining and built-in USB charging." },
  { name: "Round Marble Dining Table", brand: "CB2", price: 899.0, orig: 1099.0, category: "Furniture", size: "OS", color: "White", description: "Elegant Carrara-style marble top set on a sculptural pedestal base." },
  { name: "Adjustable Bar Stool Set", brand: "Amazon Basics", price: 149.99, category: "Furniture", size: "OS", color: "Black", description: "Set of two swivel bar stools with footrests and comfortably cushioned seats." },

  // -------------------------------------------------------------- Home Decor
  { name: "Scandinavian Table Lamp", brand: "IKEA", price: 69.99, orig: 89.99, category: "Home Decor", size: "OS", color: "White", description: "Warm ambient light with a linen shade set on a solid ash wood base." },
  { name: "Woven Wall Basket Set", brand: "Anthropologie", price: 44.99, orig: 59.99, category: "Home Decor", size: "OS", color: "Beige", description: "Set of three handwoven seagrass baskets that double as stylish wall decor." },
  { name: "Ceramic Vase Trio", brand: "West Elm", price: 54.99, orig: 69.99, category: "Home Decor", size: "OS", color: "White", description: "Sculptural matte ceramic vases in graduated sizes for fresh or dried stems." },
  { name: "Soy Wax Scented Candle", brand: "Yankee Candle", price: 22.99, category: "Home Decor", size: "OS", color: "Beige", description: "Hand-poured soy candle with 60 hours of cozy, clean-burning fragrance." },
  { name: "Abstract Framed Wall Art", brand: "Society6", price: 79.99, orig: 99.99, category: "Home Decor", size: "OS", color: "Blue", description: "Museum-quality giclee print delivered in a ready-to-hang wood frame." },
  { name: "Chunky Knit Throw Blanket", brand: "Bearaby", price: 89.99, orig: 109.99, category: "Home Decor", size: "OS", color: "Gray", description: "Oversized hand-knit throw in soft chenille for cozy movie nights." },
  { name: "Geometric Area Rug 5x7", brand: "Ruggable", price: 149.99, orig: 199.99, category: "Home Decor", size: "OS", color: "Gray", oos: true, description: "Machine-washable low-pile rug with a modern geometric pattern." },
  { name: "Indoor Plant Pot Set", brand: "Bloomscape", price: 39.99, category: "Home Decor", size: "OS", color: "White", description: "Set of three ceramic planters with drainage holes and matching bamboo saucers." },
  { name: "Decorative Wall Mirror", brand: "Umbra", price: 99.99, orig: 129.99, category: "Home Decor", size: "OS", color: "Silver", featured: true, description: "Round metal-frame mirror that instantly brightens and opens up any space." },
  { name: "String Fairy Lights 33ft", brand: "Twinkle Star", price: 18.99, category: "Home Decor", size: "OS", color: "White", description: "Warm-white LED string lights with 8 modes for indoor or outdoor ambiance." },

  // ----------------------------------------------------------------- Kitchen
  { name: "Stainless Steel Cookware Set", brand: "All-Clad", price: 229.99, orig: 299.99, category: "Kitchen", size: "OS", color: "Silver", featured: true, description: "10-piece tri-ply bonded set with even heating and oven-safe stainless handles." },
  { name: "Espresso Machine", brand: "Breville", price: 399.0, orig: 449.0, category: "Kitchen", size: "OS", color: "Black", description: "Barista-quality espresso with precise PID temperature control and a steam wand." },
  { name: "Professional Chef's Knife Set", brand: "Wüsthof", price: 119.99, orig: 149.99, category: "Kitchen", size: "OS", color: "Black", description: "Forged German steel knives with a full tang and a balanced ergonomic handle." },
  { name: "Cast Iron Dutch Oven 6qt", brand: "Le Creuset", price: 79.99, orig: 99.99, category: "Kitchen", size: "OS", color: "Red", description: "Enameled cast iron for braising, baking and slow-cooking with even heat retention." },
  { name: "Instant Pot Duo 7-in-1", brand: "Instant Pot", price: 89.99, orig: 119.99, category: "Kitchen", size: "OS", color: "Silver", featured: true, description: "Pressure cooker, slow cooker, rice cooker and more in one 6-quart appliance." },
  { name: "Vitamix Explorian Blender", brand: "Vitamix", price: 299.99, orig: 349.99, category: "Kitchen", size: "OS", color: "Black", description: "Professional-grade blender with variable speed for smoothies, soups and nut butters." },
  { name: "KitchenAid Artisan Stand Mixer", brand: "KitchenAid", price: 379.99, orig: 429.99, category: "Kitchen", size: "OS", color: "Red", description: "Iconic 5-quart tilt-head mixer with 10 speeds and a wide range of attachments." },
  { name: "Nonstick Bakeware Set", brand: "Nordic Ware", price: 49.99, category: "Kitchen", size: "OS", color: "Gray", description: "6-piece aluminized steel bakeware with a durable, easy-release nonstick coating." },
  { name: "Gooseneck Electric Kettle", brand: "Fellow", price: 149.99, orig: 165.0, category: "Kitchen", size: "OS", color: "Black", oos: true, description: "Precision pour-over kettle with variable temperature control and a sleek design." },
  { name: "Food Storage Container Set", brand: "OXO", price: 39.99, category: "Kitchen", size: "OS", color: "White", description: "Airtight POP containers that keep dry goods fresh and stack neatly on the shelf." },
  { name: "Ceramic Dinnerware Set", brand: "Corelle", price: 69.99, category: "Kitchen", size: "OS", color: "White", description: "16-piece chip-resistant dinnerware service for four in a timeless design." },

  // ------------------------------------------------------------------- Books
  { name: "The Pragmatic Programmer", brand: "Addison-Wesley", price: 39.99, orig: 49.99, category: "Books", size: "OS", color: "Beige", description: "Timeless advice on software craftsmanship for developers at every level." },
  { name: "Atomic Habits", brand: "Penguin", price: 21.99, orig: 27.0, category: "Books", size: "OS", color: "White", description: "James Clear's proven framework for building good habits and breaking bad ones." },
  { name: "Clean Code", brand: "Prentice Hall", price: 34.99, orig: 44.99, category: "Books", size: "OS", color: "Black", description: "Robert C. Martin's essential guide to writing readable, maintainable code." },
  { name: "Sapiens: A Brief History of Humankind", brand: "Harper", price: 24.99, orig: 32.5, category: "Books", size: "OS", color: "Beige", description: "Yuval Noah Harari's sweeping account of how humans came to rule the world." },
  { name: "The Midnight Library", brand: "Viking", price: 18.99, orig: 26.0, category: "Books", size: "OS", color: "Blue", description: "Matt Haig's bestselling novel about the infinite lives we could have lived." },
  { name: "Educated: A Memoir", brand: "Random House", price: 19.99, category: "Books", size: "OS", color: "Gray", description: "Tara Westover's remarkable journey from an isolated childhood to Cambridge." },
  { name: "Designing Data-Intensive Applications", brand: "O'Reilly", price: 49.99, orig: 59.99, category: "Books", size: "OS", color: "Black", featured: true, description: "Martin Kleppmann's deep dive into the architecture of modern data systems." },
  { name: "The Psychology of Money", brand: "Harriman House", price: 17.99, category: "Books", size: "OS", color: "Green", description: "Morgan Housel on the surprising ways emotion shapes our financial decisions." },
  { name: "Dune", brand: "Ace Books", price: 15.99, orig: 19.99, category: "Books", size: "OS", color: "Beige", description: "Frank Herbert's epic science-fiction saga of politics, religion and survival." },
  { name: "Thinking, Fast and Slow", brand: "Farrar, Straus and Giroux", price: 22.99, orig: 30.0, category: "Books", size: "OS", color: "White", description: "Daniel Kahneman explores the two systems that drive the way we think and choose." },
  { name: "The Song of Achilles", brand: "Ecco", price: 16.99, category: "Books", size: "OS", color: "Red", description: "Madeline Miller's lyrical retelling of the legend of Achilles and Patroclus." },

  // ------------------------------------------------------------------ Beauty
  { name: "Vitamin C Facial Serum", brand: "The Ordinary", price: 29.99, orig: 34.99, category: "Beauty", size: "OS", color: "White", description: "Brightening 15% vitamin C serum that evens skin tone and boosts radiance." },
  { name: "Matte Liquid Lipstick Set", brand: "Maybelline", price: 24.99, orig: 32.99, category: "Beauty", size: "OS", color: "Red", description: "Long-wear set of four richly pigmented, transfer-resistant matte lipsticks." },
  { name: "Signature Eau de Parfum", brand: "Chanel", price: 129.0, orig: 149.0, category: "Beauty", size: "OS", color: "Black", description: "Elegant floral-woody fragrance with lasting sillage for day or evening wear." },
  { name: "Hydrating Skincare Kit", brand: "CeraVe", price: 49.99, orig: 64.99, category: "Beauty", size: "OS", color: "White", description: "Cleanser, moisturizer and serum with ceramides to restore the skin barrier." },
  { name: "Retinol Night Cream", brand: "Olay", price: 34.99, orig: 42.99, category: "Beauty", size: "OS", color: "White", description: "Firming overnight cream with retinol to smooth fine lines while you sleep." },
  { name: "Volumizing Mascara", brand: "L'Oréal", price: 12.99, category: "Beauty", size: "OS", color: "Black", description: "Buildable mascara that adds dramatic volume and length without clumping." },
  { name: "Argan Oil Hair Mask", brand: "Moroccanoil", price: 39.99, category: "Beauty", size: "OS", color: "Beige", description: "Deep-conditioning mask that restores shine and softness to dry, damaged hair." },
  { name: "Rose Quartz Facial Roller", brand: "Herbivore", price: 24.99, category: "Beauty", size: "OS", color: "White", description: "Cooling facial roller that de-puffs and elevates your daily skincare routine." },
  { name: "SPF 50 Daily Sunscreen", brand: "Supergoop", price: 34.99, orig: 38.0, category: "Beauty", size: "OS", color: "White", featured: true, description: "Invisible, weightless sunscreen that layers seamlessly under makeup." },
  { name: "Eyeshadow Palette 18 Shades", brand: "Urban Decay", price: 44.99, orig: 54.0, category: "Beauty", size: "OS", color: "Beige", description: "Highly blendable matte and shimmer shades for endless everyday looks." },

  // ----------------------------------------------------------------- Fitness
  { name: "Adjustable Dumbbell Set", brand: "Bowflex", price: 279.99, orig: 349.99, category: "Fitness", size: "OS", color: "Black", description: "Space-saving pair that adjusts from 5 to 52.5 lbs with a quick turn of a dial." },
  { name: "Premium Yoga Mat", brand: "Manduka", price: 79.99, orig: 99.99, category: "Fitness", size: "OS", color: "Blue", description: "Dense 6mm cushioned mat with a non-slip surface built to last a lifetime." },
  { name: "Resistance Bands Set", brand: "TheraBand", price: 29.99, orig: 39.99, category: "Fitness", size: "OS", color: "Green", description: "Five stackable bands up to 150 lbs with handles, a door anchor and ankle straps." },
  { name: "Smart Jump Rope", brand: "Tangram", price: 39.99, category: "Fitness", size: "OS", color: "Black", description: "LED counting rope that tracks jumps, time and calories via a companion app." },
  { name: "Kettlebell 35 lb", brand: "Rogue Fitness", price: 69.99, orig: 84.99, category: "Fitness", size: "OS", color: "Black", description: "Cast iron kettlebell with a smooth, wide handle ideal for swings and presses." },
  { name: "High-Density Foam Roller", brand: "TriggerPoint", price: 34.99, orig: 44.99, category: "Fitness", size: "OS", color: "Black", description: "GRID foam roller with a multi-density surface for effective muscle recovery." },
  { name: "Adjustable Weight Bench", brand: "REP Fitness", price: 199.99, orig: 249.99, category: "Fitness", size: "OS", color: "Black", featured: true, description: "Heavy-duty flat-incline-decline bench that supports up to 1,000 lbs." },
  { name: "Fitness Tracker Watch", brand: "Fitbit", price: 149.99, orig: 179.99, category: "Fitness", size: "OS", color: "Black", oos: true, description: "Tracks heart rate, sleep and 40+ exercise modes with a 6-day battery life." },
  { name: "Neoprene Dumbbell Pair 15 lb", brand: "CAP Barbell", price: 39.99, category: "Fitness", size: "OS", color: "Blue", description: "Comfortable-grip neoprene dumbbells ideal for toning and aerobic workouts." },
  { name: "Doorway Pull-Up Bar", brand: "Iron Gym", price: 29.99, category: "Fitness", size: "OS", color: "Silver", description: "Leverage-mount doorway bar with multiple grips and no screws required." },
  { name: "Percussion Massage Gun", brand: "Theragun", price: 199.99, orig: 249.99, category: "Fitness", size: "OS", color: "Black", description: "Quiet percussive-therapy device with five speeds for deep muscle relief." },
];

async function clearData() {
  // Delete in FK-safe order. Tolerant of empty / not-yet-created tables.
  const deletions: [string, () => Promise<unknown>][] = [
    ["orderItem", () => prisma.orderItem.deleteMany()],
    ["order", () => prisma.order.deleteMany()],
    ["image", () => prisma.image.deleteMany()],
    ["product", () => prisma.product.deleteMany()],
    ["category", () => prisma.category.deleteMany()],
    ["billboard", () => prisma.billboard.deleteMany()],
    ["size", () => prisma.size.deleteMany()],
    ["color", () => prisma.color.deleteMany()],
    ["store", () => prisma.store.deleteMany()],
  ];
  for (const [name, fn] of deletions) {
    try {
      await fn();
    } catch (e) {
      console.warn(`  (skip) could not clear ${name}:`, (e as Error).message);
    }
  }
}

async function main() {
  console.log("Seeding QuickCart Demo Store...\n");

  if (OWNER_ID === "seed-demo-user") {
    console.log(
      "NOTE: SEED_STORE_OWNER_ID is not set — the store will be owned by the\n" +
        '      placeholder id "seed-demo-user". To manage this store in the admin\n' +
        "      dashboard, set SEED_STORE_OWNER_ID to your Clerk user id and re-run:\n" +
        "        SEED_STORE_OWNER_ID=user_xxx npx prisma db seed\n"
    );
  } else {
    console.log(`Using store owner id: ${OWNER_ID}\n`);
  }

  console.log("Clearing existing data...");
  await clearData();

  // 1. Store
  const store = await prisma.store.create({
    data: { name: "QuickCart Demo Store", userId: OWNER_ID },
  });
  console.log(`Created store: ${store.name} (${store.id})`);

  // 2. Sizes
  const sizeByValue = new Map<string, string>();
  for (const s of SIZES) {
    const created = await prisma.size.create({
      data: { storeId: store.id, name: s.name, value: s.value },
    });
    sizeByValue.set(s.value, created.id);
  }
  console.log(`Created ${SIZES.length} sizes`);

  // 3. Colors
  const colorByName = new Map<string, string>();
  for (const c of COLORS) {
    const created = await prisma.color.create({
      data: { storeId: store.id, name: c.name, value: c.value },
    });
    colorByName.set(c.name, created.id);
  }
  console.log(`Created ${COLORS.length} colors`);

  // 4. Hero billboard (homepage) + per-category billboards
  const heroBillboard = await prisma.billboard.create({
    data: { storeId: store.id, label: HERO_LABEL, imageUrl: u(HERO_IMG, 1600) },
  });
  console.log(`Created hero billboard: "${heroBillboard.label}" (${heroBillboard.id})`);

  const categoryByName = new Map<string, string>();
  for (const cat of CATEGORIES) {
    const billboard = await prisma.billboard.create({
      data: {
        storeId: store.id,
        label: cat.name,
        imageUrl: u(cat.billboardImg, 1600),
      },
    });
    const category = await prisma.category.create({
      data: { storeId: store.id, billboardId: billboard.id, name: cat.name },
    });
    categoryByName.set(cat.name, category.id);
  }
  console.log(`Created ${CATEGORIES.length} categories (each with its own billboard)`);

  // 5. Products (+ nested images). Each product gets two verified Unsplash
  //    images drawn from its category pool (cycled for variety) plus a unique
  //    picsum image, giving three working images per product.
  let featuredCount = 0;
  let outOfStockCount = 0;
  let discountedCount = 0;
  const catCounter = new Map<string, number>();

  for (const p of PRODUCTS) {
    const categoryId = categoryByName.get(p.category);
    const sizeId = sizeByValue.get(p.size);
    const colorId = colorByName.get(p.color);
    const pool = CATEGORY_IMAGES[p.category];
    if (!categoryId || !sizeId || !colorId || !pool) {
      throw new Error(
        `Bad reference for product "${p.name}" (category=${p.category}, size=${p.size}, color=${p.color})`
      );
    }

    const n = catCounter.get(p.category) ?? 0;
    catCounter.set(p.category, n + 1);
    const urls = [
      { url: u(pool[(n * 2) % pool.length]) },
      { url: u(pool[(n * 2 + 1) % pool.length]) },
      { url: pic(slugify(p.name)) },
    ];

    const isInStock = p.oos !== true;
    const hasDiscount = p.orig !== undefined && p.orig > p.price;
    if (p.featured) featuredCount++;
    if (!isInStock) outOfStockCount++;
    if (hasDiscount) discountedCount++;

    await prisma.product.create({
      data: {
        storeId: store.id,
        categoryId,
        name: p.name,
        description: p.description,
        brand: p.brand,
        price: p.price,
        originalPrice: p.orig, // undefined => Prisma leaves it unset
        isInStock,
        isFeatured: Boolean(p.featured),
        isArchived: false,
        sizeId,
        colorId,
        images: { createMany: { data: urls } },
      },
    });
  }
  console.log(
    `Created ${PRODUCTS.length} products (${featuredCount} featured, ${outOfStockCount} out of stock, ${discountedCount} discounted)`
  );

  // ------------------------------------------------------------------ summary
  const apiUrl = `http://localhost:3000/api/${store.id}`;
  console.log("\n=====================================================");
  console.log("SEED COMPLETE");
  console.log("=====================================================");
  console.log(`Store id            : ${store.id}`);
  console.log(`Store owner (userId): ${OWNER_ID}`);
  console.log(`Hero billboard id   : ${heroBillboard.id}`);
  console.log(`Sizes               : ${SIZES.length}`);
  console.log(`Colors              : ${COLORS.length}`);
  console.log(`Categories          : ${CATEGORIES.length}`);
  console.log(`Billboards          : ${CATEGORIES.length + 1} (incl. hero)`);
  console.log(
    `Products            : ${PRODUCTS.length} (${featuredCount} featured, ${outOfStockCount} out of stock, ${discountedCount} discounted)`
  );
  console.log("-----------------------------------------------------");
  console.log("QuickCart storefront .env — set NEXT_PUBLIC_API_URL to:");
  console.log(`  NEXT_PUBLIC_API_URL=${apiUrl}`);
  console.log("-----------------------------------------------------");
  console.log("Homepage billboard: QuickCart/app/(routes)/page.tsx currently");
  console.log("hardcodes a billboard id. Update that id to the hero id above:");
  console.log(`  ${heroBillboard.id}`);
  console.log("=====================================================\n");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("SEED FAILED:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
