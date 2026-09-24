const express = require('express');
const path = require('path');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

function parseCurrency(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value
    .replace(/[^\d,.-]/g, '')
    .replace('.', '')
    .replace(',', '.');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDimensionValue(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeDimensionValue(item))
      .filter(Boolean)
      .join(' x ');
  }

  if (typeof value === 'object') {
    const width = value.width ?? value.W ?? value.largura ?? value.Width ?? value.length ?? value.L ?? value.a ?? value.A;
    const height = value.height ?? value.H ?? value.altura ?? value.Height ?? value.depth ?? value.P ?? value.p ?? value.profundidade;
    const depth = value.depth ?? value.D ?? value.profundidade ?? value.prof ?? value.thickness ?? value.espessura ?? value.comprimento ?? value.C;
    const parts = [width, height, depth]
      .map((item) => normalizeDimensionValue(item))
      .filter(Boolean);

    if (parts.length) {
      return parts.join(' x ');
    }

    const objectValue = Object.values(value)
      .map((item) => normalizeDimensionValue(item))
      .filter(Boolean)
      .slice(0, 3)
      .join(' x ');

    return objectValue;
  }

  return '';
}

function getDimensionInfo(product) {
  const candidates = [
    product?.dimensions,
    product?.packageDimensions,
    product?.productDimensions,
    product?.measurements,
    product?.size,
    product?.dimension,
    product?.specifications?.dimensions,
    product?.nicheDimensions,
    product?.nicheSize,
    product?.niche,
    product?.niche?.dimensions,
    product?.niche?.size,
    product?.product?.dimensions,
    product?.product?.nicheDimensions,
    product?.product?.niche?.dimensions
  ];

  const productDimensions = candidates
    .map((item) => normalizeDimensionValue(item))
    .find((item) => item && item !== '');

  const nicheDimensions = normalizeDimensionValue(
    product?.nicheDimensions ||
    product?.niche?.dimensions ||
    product?.niche?.size ||
    product?.nicheSize ||
    product?.nicheDimensionsAxlxp ||
    product?.nicheMeasurements ||
    ''
  );

  return {
    productDimensions: productDimensions || '',
    nicheDimensions: nicheDimensions || ''
  };
}

function getMetaContent($, name) {
  return (
    $(`meta[property="${name}"]`).attr('content') ||
    $(`meta[name="${name}"]`).attr('content') ||
    $('meta[property="og:' + name + '"]').attr('content') ||
    $('meta[name="og:' + name + '"]').attr('content') ||
    ''
  ).trim();
}

function parseJsonFromNextData(html) {
  const match = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;

  try {
    return JSON.parse(match[1]);
  } catch (error) {
    return null;
  }
}

function normalizeInstallmentEntries(product) {
  const rawInstallments = Array.isArray(product?.installments) ? product.installments : [];
  const normalized = {};

  for (const item of rawInstallments) {
    const installments = Number(item?.NumberOfInstallments || item?.numberOfInstallments || 0);
    if (!Number.isFinite(installments) || installments <= 0) continue;

    const monthlyValue = Number(item?.Value ?? item?.value ?? item?.MonthlyValue ?? item?.TotalValuePlusInterestRate ?? 0);
    const totalValue = Number(item?.TotalValuePlusInterestRate ?? item?.totalValuePlusInterestRate ?? monthlyValue * installments ?? 0);
    const rate = Number(item?.InterestRate ?? item?.interestRate ?? 1.49);

    normalized[installments] = {
      value: Number.isFinite(monthlyValue) ? Number(monthlyValue.toFixed(2)) : 0,
      total: Number.isFinite(totalValue) ? Number(totalValue.toFixed(2)) : 0,
      rate: Number.isFinite(rate) ? rate : 1.49,
      paymentSystem: item?.PaymentSystemName || item?.paymentSystemName || 'Cartão'
    };
  }

  return normalized;
}

function getFastShopProductData(html) {
  const json = parseJsonFromNextData(html);
  if (!json) return null;

  const product =
    json?.props?.pageProps?.data?.product ||
    json?.props?.pageProps?.data?.search?.products?.edges?.[0]?.node ||
    null;

  if (!product) return null;

  const offer =
    product?.offers?.offers?.[0] ||
    product?.offers ||
    {};

  const imageCandidates = [
    product?.image,
    product?.image?.[0],
    product?.image?.url,
    product?.image?.imageUrl,
    product?.items?.[0]?.images?.[0]?.imageUrl,
    product?.items?.[0]?.images?.[0]?.url,
    product?.items?.[0]?.imageUrls,
    product?.items?.[0]?.images,
    product?.gallery,
    product?.video
  ];

  const flattenImages = (value, collected = []) => {
    if (!value) return collected;
    if (Array.isArray(value)) {
      value.forEach((item) => flattenImages(item, collected));
    } else if (typeof value === 'object') {
      const keys = ['url', 'imageUrl', 'src', 'value', 'https'];
      for (const key of keys) {
        if (typeof value[key] === 'string' && value[key].trim()) {
          collected.push(value[key]);
        }
      }
      Object.values(value).forEach((item) => flattenImages(item, collected));
    } else if (typeof value === 'string' && value.trim()) {
      collected.push(value);
    }
    return collected;
  };

  const image = flattenImages(imageCandidates).find((candidate) => /https?:\/\//.test(candidate)) || '';

  const price = Number(
    product?.offers?.lowPrice ??
    product?.offers?.highPrice ??
    offer?.price ??
    offer?.listPrice ??
    offer?.priceWithTaxes ??
    product?.price ??
    0
  );

  const installmentOptions = normalizeInstallmentEntries(product);
  const defaultInstallments = 10;
  const selectedOption = installmentOptions[defaultInstallments] || Object.values(installmentOptions).find(Boolean) || null;
  const installmentValue = selectedOption ? selectedOption.value : price / defaultInstallments;
  const installmentTotal = selectedOption ? selectedOption.total : price;
  const monthlyRate = selectedOption ? Number(selectedOption.rate || 1.49) : 1.49;
  const annualRate = monthlyRate > 0 ? ((Math.pow(1 + monthlyRate / 100, 12) - 1) * 100) : 0;
  const dimensionInfo = getDimensionInfo(product);

  return {
    title: product?.name || product?.productName || 'Produto',
    description: product?.description || product?.seo?.description || product?.meta?.description || 'Sem descrição disponível para este produto.',
    image,
    price: Number.isFinite(price) ? Number(price.toFixed(2)) : 0,
    pixPrice: Number.isFinite(price) ? Number(price.toFixed(2)) : 0,
    installmentPrice: Number.isFinite(installmentValue) ? Number(installmentValue.toFixed(2)) : Number((price / defaultInstallments).toFixed(2)),
    installmentTotal: Number(Number(installmentTotal || price).toFixed(2)),
    installments: defaultInstallments,
    interestRate: monthlyRate,
    interestAnnualRate: Number(annualRate.toFixed(2)),
    annualInterestRate: Number(annualRate.toFixed(2)),
    installmentLabel: selectedOption ? `Cartão ${defaultInstallments}x` : '10x',
    installmentOptions,
    dimensoes: dimensionInfo.productDimensions,
    nichoDimensoes: dimensionInfo.nicheDimensions
  };
}

function extractJsonLdProducts($) {
  const scripts = $('script[type="application/ld+json"]').toArray();
  const products = [];

  for (const script of scripts) {
    const raw = $(script).html();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      const queue = [parsed];

      while (queue.length) {
        const current = queue.shift();
        if (!current || typeof current !== 'object') continue;

        if (Array.isArray(current)) {
          queue.push(...current);
          continue;
        }

        const type = current['@type'];
        const types = Array.isArray(type) ? type : [type];

        if (types.some((item) => item === 'Product' || item === 'Offer')) {
          products.push(current);
        }

        queue.push(...Object.values(current));
      }
    } catch (error) {
      // Ignora JSON-LD inválido
    }
  }

  return products;
}

function findProductFromJsonLd(products) {
  for (const product of products) {
    if (product && typeof product === 'object') {
      const type = product['@type'];
      const types = Array.isArray(type) ? type : [type];
      if (types.some((item) => item === 'Product')) {
        return product;
      }
    }
  }
  return products[0] || null;
}

function pickProductImage(product) {
  const imageCandidates = [
    product?.image,
    product?.images,
    product?.['image']?.[0],
    product?.['image']?.url,
    product?.['image']?.['@id'],
    product?.offers
  ];

  const flatten = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap(flatten);
    if (typeof value === 'object') {
      return [value.url, value.contentUrl, value.src, value['@id'], value['@value']].filter(Boolean);
    }
    return [String(value)];
  };

  const found = flatten(imageCandidates).find((candidate) => typeof candidate === 'string' && candidate.trim());
  return found || '';
}

function getOfferData(product) {
  const offers = Array.isArray(product?.offers) ? product.offers : [product?.offers].filter(Boolean);
  const offer = offers.find((item) => item && typeof item === 'object') || offers[0] || product || {};

  const price =
    offer?.price ||
    offer?.lowPrice ||
    offer?.highPrice ||
    offer?.priceSpecification?.price ||
    product?.offers?.price ||
    product?.price ||
    product?.lowPrice ||
    product?.highPrice ||
    product?.offers?.priceSpecification?.price ||
    null;

  const rawCurrency = offer?.priceCurrency || product?.priceCurrency || 'BRL';
  const payment = offer?.priceSpecification?.description || offer?.paymentAccepted || product?.paymentAccepted || '';
  const installment = offer?.priceSpecification?.billingIncrement || offer?.billingIncrement || null;
  const installments = offer?.priceSpecification?.numberOfInstallments || offer?.numberOfInstallments || 10;

  return { price, rawCurrency, payment, installment, installments };
}

function extractPriceFromText(html) {
  const regexes = [
    /R\$\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})?/g,
    /\d{1,3}(?:\.\d{3})*(?:,\d{2})/g,
    /\d+(?:,\d{2})/g
  ];

  for (const regex of regexes) {
    const matches = html.match(regex) || [];
    if (matches.length) {
      const value = matches
        .map((match) => match.replace(/[^\d,.-]/g, '').replace('.', '').replace(',', '.'))
        .map(Number)
        .filter((num) => Number.isFinite(num))
        .sort((a, b) => a - b);

      if (value.length) {
        return value[value.length - 1];
      }
    }
  }

  return null;
}

async function fetchProduct(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
    },
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error('Não foi possível acessar este link. Verifique se a URL está correta.');
  }

  const html = await response.text();
  const nextDataProduct = getFastShopProductData(html);

  if (nextDataProduct && nextDataProduct.price > 0) {
    const annualInterestRate = nextDataProduct.annualInterestRate ?? nextDataProduct.interestAnnualRate ?? 0;
    const installmentTotal = nextDataProduct.installmentTotal ?? (Number(nextDataProduct.installmentPrice || 0) * Number(nextDataProduct.installments || 10));
    const title = typeof nextDataProduct.title === 'string' ? nextDataProduct.title.trim() : String(nextDataProduct.title || 'Produto');
    const description = typeof nextDataProduct.description === 'string' ? nextDataProduct.description.trim() : String(nextDataProduct.description || 'Sem descrição disponível para este produto.');
    const image = typeof nextDataProduct.image === 'string' ? nextDataProduct.image : '';

    return {
      title,
      description,
      image: image ? (image.startsWith('http') ? image : new URL(image, url).toString()) : '',
      price: Number(nextDataProduct.price.toFixed(2)),
      currency: 'BRL',
      pixPrice: Number(nextDataProduct.pixPrice.toFixed(2)),
      installmentPrice: Number(nextDataProduct.installmentPrice.toFixed(2)),
      installmentTotal: Number(installmentTotal.toFixed(2)),
      installments: Number(nextDataProduct.installments || 10),
      interestRate: nextDataProduct.interestRate || 0,
      annualInterestRate,
      interestAnnualRate: annualInterestRate,
      sourceUrl: url,
      installmentLabel: nextDataProduct.installmentLabel || '10x',
      installmentOptions: nextDataProduct.installmentOptions || {},
      dimensoes: nextDataProduct.dimensoes || '',
      nichoDimensoes: nextDataProduct.nichoDimensoes || ''
    };
  }

  const $ = cheerio.load(html);

  const productJson = findProductFromJsonLd(extractJsonLdProducts($));
  const title =
    getMetaContent($, 'og:title') ||
    productJson?.name ||
    $('h1').first().text().trim() ||
    $('title').text().trim() ||
    'Produto';

  const description =
    getMetaContent($, 'og:description') ||
    getMetaContent($, 'description') ||
    productJson?.description ||
    $('meta[name="description"]').attr('content')?.trim() ||
    'Sem descrição disponível para este produto.';

  const image =
    getMetaContent($, 'og:image') ||
    productJson?.image?.[0]?.url ||
    productJson?.image ||
    pickProductImage(productJson) ||
    $('img').first().attr('src') ||
    '';

  let productPrice = null;
  const offerData = productJson ? getOfferData(productJson) : {};

  if (offerData.price) {
    productPrice = parseCurrency(String(offerData.price));
  }

  if (productPrice === null) {
    const textPrice = getMetaContent($, 'product:price:amount') || getMetaContent($, 'price');
    if (textPrice) {
      productPrice = parseCurrency(textPrice);
    }
  }

  if (productPrice === null) {
    productPrice = parseCurrency(extractPriceFromText(html));
  }

  if (productPrice === null) {
    throw new Error('Não foi possível encontrar o preço do produto nesta página.');
  }

  const discountPercent = productJson?.offers?.discount || productJson?.discount || null;
  const pixPrice = discountPercent ? productPrice * (1 - Number(discountPercent) / 100) : productPrice;
  const productDimensionsInfo = getDimensionInfo(productJson || {});
  const selectedInstallments = Number(offerData.installments || 10);
  const installmentPrice = productPrice / selectedInstallments;
  const installmentTotal = installmentPrice * selectedInstallments;

  return {
    title: String(title || 'Produto').trim(),
    description: String(description || 'Sem descrição disponível para este produto.').trim(),
    image: image ? (image.startsWith('http') ? image : new URL(image, url).toString()) : '',
    price: Number(productPrice.toFixed(2)),
    currency: 'BRL',
    pixPrice: Number(pixPrice.toFixed(2)),
    installmentPrice: Number(installmentPrice.toFixed(2)),
    installmentTotal: Number(installmentTotal.toFixed(2)),
    installments: selectedInstallments,
    interestRate: 0,
    annualInterestRate: 0,
    interestAnnualRate: 0,
    sourceUrl: url,
    installmentLabel: `${selectedInstallments}x`,
    dimensoes: productDimensionsInfo.productDimensions || '',
    nichoDimensoes: productDimensionsInfo.nicheDimensions || ''
  };
}

app.get('/api/product', async (req, res) => {
  const { url } = req.query;

  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'Informe o link do produto.' });
  }

  try {
    const product = await fetchProduct(url);
    return res.json(product);
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Não foi possível carregar o produto.'
    });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

module.exports = {
  app,
  fetchProduct,
  getFastShopProductData,
  parseCurrency
};
