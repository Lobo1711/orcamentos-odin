function decodeHtml(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function getAttribute(tag, name) {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}

function getMetaContent(html, key) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const wanted = key.toLowerCase();

  for (const tag of tags) {
    const property = getAttribute(tag, "property").toLowerCase();
    const name = getAttribute(tag, "name").toLowerCase();
    if (property === wanted || name === wanted) {
      return getAttribute(tag, "content");
    }
  }
  return "";
}

function parseCurrency(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=.*[,])/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getJsonLdProducts(html) {
  const scripts =
    html.match(
      /<script\b(?=[^>]*\btype\s*=\s*["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi,
    ) || [];
  const products = [];

  for (const script of scripts) {
    const raw = script.replace(/^<script\b[^>]*>|<\/script>$/gi, "").trim();
    try {
      const queue = [JSON.parse(raw)];
      while (queue.length) {
        const current = queue.shift();
        if (!current || typeof current !== "object") continue;
        if (Array.isArray(current)) {
          queue.push(...current);
          continue;
        }

        const types = Array.isArray(current["@type"])
          ? current["@type"]
          : [current["@type"]];
        if (types.includes("Product") || types.includes("Offer")) {
          products.push(current);
        }
        queue.push(...Object.values(current));
      }
    } catch {
      // Ignore invalid structured data and continue with other page metadata.
    }
  }

  return products;
}

function findProduct(products) {
  return (
    products.find((product) => {
      const types = Array.isArray(product["@type"])
        ? product["@type"]
        : [product["@type"]];
      return types.includes("Product");
    }) ||
    products[0] ||
    null
  );
}

function findFastShopProduct(html) {
  const match = html.match(
    /<script\b(?=[^>]*\bid\s*=\s*["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!match) return null;

  try {
    const json = JSON.parse(match[1]);
    return (
      json?.props?.pageProps?.data?.product ||
      json?.props?.pageProps?.data?.search?.products?.edges?.[0]?.node ||
      null
    );
  } catch {
    return null;
  }
}

function getProductImage(product) {
  const candidates = [
    product?.image,
    product?.images,
    product?.items?.[0]?.images,
    product?.gallery,
  ];
  const queue = [...candidates];

  while (queue.length) {
    const item = queue.shift();
    if (typeof item === "string" && item.trim()) return item.trim();
    if (Array.isArray(item)) {
      queue.push(...item);
    } else if (item && typeof item === "object") {
      queue.push(
        item.url,
        item.imageUrl,
        item.contentUrl,
        item.src,
        item["@id"],
      );
    }
  }
  return "";
}

function getOffer(product) {
  const fastShopOffer = product?.offers?.offers?.[0];
  if (fastShopOffer) return fastShopOffer;

  const offers = Array.isArray(product?.offers)
    ? product.offers
    : [product?.offers].filter(Boolean);
  return offers.find((offer) => offer && typeof offer === "object") || product;
}

function getPriceFromPage(html, product) {
  const offer = getOffer(product);
  const candidates = [
    offer?.price,
    offer?.lowPrice,
    offer?.highPrice,
    offer?.priceSpecification?.price,
    product?.price,
    product?.lowPrice,
    getMetaContent(html, "product:price:amount"),
    getMetaContent(html, "price"),
  ];

  for (const candidate of candidates) {
    const price = parseCurrency(candidate);
    if (price !== null && price > 0) return price;
  }

  const matches = html.match(/R\$\s*\d[\d.]*,\d{2}/g) || [];
  const prices = matches.map(parseCurrency).filter((price) => price > 0);
  return prices.length ? Math.max(...prices) : null;
}

function getPageTitle(html, product) {
  const title =
    getMetaContent(html, "og:title") ||
    product?.name ||
    html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]*>/g, "") ||
    html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]*>/g, "") ||
    "Produto";
  return decodeHtml(title).trim();
}

function getPageImage(html, product, pageUrl) {
  const image =
    getMetaContent(html, "og:image") ||
    getProductImage(product) ||
    html.match(/<img\b[^>]*>/i)?.[0] &&
      getAttribute(html.match(/<img\b[^>]*>/i)[0], "src");
  if (!image) return "";

  try {
    return new URL(image, pageUrl).toString();
  } catch {
    return "";
  }
}

function normalizeInstallments(product) {
  const entries = Array.isArray(product?.installments)
    ? product.installments
    : [];
  const options = {};

  for (const entry of entries) {
    const count = Number(
      entry?.NumberOfInstallments || entry?.numberOfInstallments || 0,
    );
    if (!Number.isInteger(count) || count < 1) continue;

    const monthly = Number(
      entry?.Value ??
        entry?.value ??
        entry?.MonthlyValue ??
        entry?.TotalValuePlusInterestRate ??
        0,
    );
    const total = Number(
      entry?.TotalValuePlusInterestRate ??
        entry?.totalValuePlusInterestRate ??
        monthly * count,
    );
    if (!Number.isFinite(monthly) || !Number.isFinite(total)) continue;

    options[count] = {
      value: Number(monthly.toFixed(2)),
      total: Number(total.toFixed(2)),
      rate: Number(entry?.InterestRate ?? entry?.interestRate ?? 1.49),
      paymentSystem:
        entry?.PaymentSystemName || entry?.paymentSystemName || "Cartão",
    };
  }
  return options;
}

function getDimensions(product) {
  const candidates = [
    product?.dimensions,
    product?.productDimensions,
    product?.measurements,
    product?.size,
    product?.specifications?.dimensions,
  ];
  const value = candidates.find((candidate) => candidate);
  if (Array.isArray(value)) return value.map(String).join(" x ");
  if (typeof value === "object" && value) {
    return Object.values(value).slice(0, 3).map(String).join(" x ");
  }
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

async function scrapeProduct(pageUrl) {
  const response = await fetch(pageUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(
      "Não foi possível acessar este link. Verifique se a URL está correta.",
    );
  }

  const html = await response.text();
  const fastShopProduct = findFastShopProduct(html);
  const structuredProduct = findProduct(getJsonLdProducts(html));
  const product = fastShopProduct || structuredProduct || {};
  const price = getPriceFromPage(html, product);

  if (price === null) {
    throw new Error("Não foi possível encontrar o preço do produto nesta página.");
  }

  const offers = product.offers?.offers?.[0] || product.offers || {};
  const installmentOptions = normalizeInstallments(product);
  const defaultInstallments = 10;
  const selectedPlan =
    installmentOptions[defaultInstallments] ||
    Object.values(installmentOptions)[0];
  const installments = Number(
    selectedPlan ? defaultInstallments : offers.numberOfInstallments || 10,
  );
  const monthly =
    selectedPlan?.value || Number((price / installments).toFixed(2));
  const installmentTotal = selectedPlan?.total || price;
  const discount = Number(product.discount || offers.discount || 0);
  const pixPrice = discount > 0 ? price * (1 - discount / 100) : price;
  const description =
    getMetaContent(html, "og:description") ||
    getMetaContent(html, "description") ||
    product.description ||
    "Sem descrição disponível para este produto.";

  return {
    title: getPageTitle(html, product),
    description: decodeHtml(description).trim(),
    image: getPageImage(html, product, pageUrl),
    price: Number(price.toFixed(2)),
    currency: "BRL",
    pixPrice: Number(pixPrice.toFixed(2)),
    installmentPrice: Number(monthly.toFixed(2)),
    installmentTotal: Number(installmentTotal.toFixed(2)),
    installments,
    interestRate: selectedPlan?.rate || 0,
    annualInterestRate: 0,
    interestAnnualRate: 0,
    sourceUrl: pageUrl,
    installmentLabel: `${installments}x`,
    installmentOptions,
    dimensoes: getDimensions(product),
    nichoDimensoes: "",
  };
}

export async function onRequestGet({ request }) {
  const requestUrl = new URL(request.url);
  const productUrl = requestUrl.searchParams.get("url");

  if (!productUrl) {
    return Response.json({ error: "Informe o link do produto." }, { status: 400 });
  }

  let pageUrl;
  try {
    pageUrl = new URL(productUrl);
  } catch {
    return Response.json({ error: "Informe um link válido para o produto." }, { status: 400 });
  }

  if (!["http:", "https:"].includes(pageUrl.protocol)) {
    return Response.json({ error: "O link do produto deve usar HTTP ou HTTPS." }, { status: 400 });
  }

  try {
    const product = await scrapeProduct(pageUrl.toString());
    return Response.json(product);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar o produto.",
      },
      { status: 502 },
    );
  }
}
