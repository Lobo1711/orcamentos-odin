const searchStack = document.getElementById("product-search-stack"); // Stack de busca de produtos
const statusMessage = document.getElementById("status-message"); // Elemento para exibir mensagens de status
const productList = document.getElementById("product-list"); // Lista de produtos adicionados ao orçamento
const addProductBtn = document.getElementById("add-product-btn"); // Botão para adicionar um novo produto
const pdfButton = document.getElementById("pdf-button"); // Botão para gerar PDF do orçamento
const totalPixEl = document.getElementById("total-pix"); // Elemento para exibir o valor total à vista (Pix)
const totalInstallmentEl = document.getElementById("total-installment"); // Elemento para exibir o valor total parcelado
const monthlyInstallmentEl = document.getElementById("monthly-installment"); // Elemento para exibir o valor da parcela mensal
const installmentLabelEl = document.getElementById("summary-installment-label"); // Elemento para exibir o rótulo das parcelas
const totalProductsEl = document.getElementById("total-products"); // Elemento para exibir o total de produtos adicionados
const garantiaSummaryEl = document.getElementById("summary-garantia"); // Elemento para exibir o valor total da garantia
const instalacaoSummaryEl = document.getElementById("summary-instalacao"); // Elemento para exibir o valor total da instalação
const seguroSummaryEl = document.getElementById("summary-seguro"); // Elemento para exibir o valor total do seguro
const freteSummaryEl = document.getElementById("summary-frete"); // Elemento para exibir o valor total do frete
const quoteFooterNoteEl = document.getElementById("quote-footer-note"); // Elemento para exibir a nota de rodapé do orçamento
const deliveryDateInput = document.getElementById("delivery-date"); // Input para selecionar a data de entrega do orçamento
const quoteNameInput = document.getElementById("quote-name");
const savedQuotesSelect = document.getElementById("saved-quotes-select");
const saveQuoteButton = document.getElementById("save-quote-btn");
const loadQuoteButton = document.getElementById("load-quote-btn");
const deleteQuoteButton = document.getElementById("delete-quote-btn");
const newQuoteButton = document.getElementById("new-quote-btn");
const legacySavedQuotesStorageKey = "orcamentos-odin:saved-quotes:v1";

const fields = {
  // Objeto contendo referências aos campos de entrada do formulário
  frete: document.getElementById("frete"), // Input para o valor do frete
};

let products = []; // Array para armazenar os produtos adicionados ao orçamento
let rowCounter = 1; // Contador para gerar IDs únicos para as linhas de busca de produtos
let savedQuotes = [];
let currentQuoteId = null;
let persistTimer;
let quoteSaveQueue = Promise.resolve();

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  // Instância do formatador de moeda para o Brasil
  style: "currency", // Define o estilo como moeda
  currency: "BRL", // Define a moeda como Real Brasileiro
  minimumFractionDigits: 2, // Define o número mínimo de casas decimais como 2
  maximumFractionDigits: 2, // Define o número máximo de casas decimais como 2
});

function money(value) {
  // Função para converter valores em formato monetário
  if (typeof value === "number" && Number.isFinite(value)) {
    // Verifica se o valor é um número finito
    return value; // Retorna o valor se for um número finito
  }

  if (typeof value === "string") {
    // Verifica se o valor é uma string
    const normalized = value // Normaliza a string removendo espaços, símbolos de moeda e caracteres não numéricos
      .trim() //remove espaços em branco no início e no final da string
      .replace(/R\$\s*/gi, "") // remove o símbolo de moeda "R$" e quaisquer espaços em branco que possam estar presentes na string, ignorando maiúsculas e minúsculas
      .replace(/\s+/g, "") // remove todos os espaços em branco restantes na string
      .replace(/[^\d,.-]/g, ""); // remove todos os caracteres que não sejam dígitos, vírgulas, pontos ou sinais de menos

    if (!normalized) {
      // Verifica se a string normalizada está vazia
      return 0; // Retorna 0 se a string estiver vazia
    }

    if (normalized.includes(",") && normalized.includes(".")) {
      // Verifica se a string contém tanto vírgulas quanto pontos
      return Number(normalized.replace(/\./g, "").replace(",", ".")); // Substitui os pontos por nada e a vírgula por ponto, convertendo a string em número
    }

    if (normalized.includes(",")) {
      // Verifica se a string contém apenas vírgulas
      return Number(normalized.replace(",", ".")); // Substitui a vírgula por ponto, convertendo a string em número
    }

    return Number(normalized); // Converte a string normalizada em número
  }

  const number = Number(value ?? 0); // Converte o valor em número, usando 0 como valor padrão se for null ou undefined
  return Number.isFinite(number) ? number : 0; // Retorna o número se for finito, caso contrário retorna 0
}

function sanitizeDecimalInput(value) {
  // Função para sanitizar a entrada de valores decimais
  return String(value ?? "")
    .replace(/[^\d,.-]/g, "")
    .replace(/(,.*),(?=.*\.)/g, "")
    .replace(/,(?=\d*$)/g, ".");
}

function escapeHtml(value) { // Função para escapar caracteres especiais em HTML
  return String(value ?? "") // Converte o valor em string, usando uma string vazia como valor padrão se for null ou undefined
    .replace(/&/g, "&amp;") // Substitui o caractere "&" por "&amp;"
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatBrazilDate(dateValue) { // Função para formatar datas no formato brasileiro (dd/mm/yyyy)
  if (!dateValue) {
    return "";
  }

  const date = new Date(dateValue + "T00:00:00"); // Cria um objeto Date a partir do valor da data, adicionando "T00:00:00" para evitar problemas de fuso horário
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("pt-BR").format(date); // Formata a data usando o formato brasileiro (dd/mm/yyyy) e retorna a string formatada
}

function updateQuoteFooterNote() {
  if (!quoteFooterNoteEl) {
    return;
  }

  const createdAt = new Date();
  const deliveryDate =
    deliveryDateInput && deliveryDateInput.value
      ? formatBrazilDate(deliveryDateInput.value)
      : "a confirmar";
  const createdLabel = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(createdAt);

  quoteFooterNoteEl.textContent = `Orçamento emitido em ${createdLabel}. Este orçamento pode sofrer alteração de preço a qualquer momento.`; // Atualiza o conteúdo do elemento de nota de rodapé do orçamento com a data de emissão e uma mensagem informando que os preços podem mudar
}

function getProductExtraTotal(product) { // Função para calcular o total de adicionais de um produto
  return (
    money(product?.garantia) +
    money(product?.instalacao) +
    money(product?.seguro)
  );
}

function getProductQuantity(product) {
  const quantity = Number(product?.quantity || 1);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
}

function getProductBaseInstallmentValues( // Função para calcular os valores de parcelamento base de um produto
  product,
  selectedInstallments = Number(product?.installments || 10), // Valor padrão de parcelas selecionadas, caso não seja fornecido, será o valor do produto ou 10
) {
  const installments = Number(selectedInstallments || 1); // Valor de parcelas selecionadas, garantindo que seja pelo menos 1
  const basePrice = Number(product?.price || 0);
  const directPlan = product?.installmentOptions?.[installments];
  const overrideInstallments = Number(product?.installmentOverrideInstallments);
  const overrideTotal = Number(product?.installmentTotalOverride);

  if (
    overrideInstallments === installments &&
    Number.isFinite(overrideTotal) &&
    overrideTotal >= 0
  ) {
    return {
      monthly: overrideTotal / installments,
      total: overrideTotal,
      installments,
    };
  }

  if (
    directPlan && // Verifica se existe um plano de parcelamento direto para o número de parcelas selecionado
    Number.isFinite(Number(directPlan.value)) &&
    Number.isFinite(Number(directPlan.total))
  ) {
    return {
      monthly: Number(directPlan.value || 0),
      total: Number(directPlan.total || 0),
      installments,
    };
  }

  const monthlyRate = // Calcula a taxa de juros mensal com base na taxa de juros anual do produto, ou usa uma taxa padrão de 1,49% se não estiver disponível
    Number(
      product?.interestRate ||
        (product?.annualInterestRate ? product.annualInterestRate / 12 : 1.49),
    ) / 100;

  if (!installments || installments <= 1 || monthlyRate <= 0) {
    return {
      monthly: basePrice / (installments || 1),
      total: basePrice,
      installments,
    };
  }

  const factor = Math.pow(1 + monthlyRate, installments);
  const monthly = basePrice * ((monthlyRate * factor) / (factor - 1));
  const total = monthly * installments;

  return {
    monthly,
    total,
    installments,
  };
}

function getProductInstallmentValues( // Função para calcular os valores de parcelamento de um produto, incluindo adicionais
  product,
  selectedInstallments = Number(product?.installments || 10), // Valor padrão de parcelas selecionadas, caso não seja fornecido, será o valor do produto ou 10
) {
  const baseValues = getProductBaseInstallmentValues( // Obtém os valores de parcelamento base do
    product,
    selectedInstallments,
  );
  const extras = getProductExtraTotal(product); // Calcula o total de adicionais do produto
  const installments = Number(selectedInstallments || 1); // Valor de parcelas selecionadas, garantindo que seja pelo menos 1
  const extraMonthly = extras / Math.max(installments, 1); // Calcula o valor mensal dos adicionais, dividindo o total de adicionais pelo número de parcelas (garantindo que seja pelo menos 1)
 
  return {
    monthly: baseValues.monthly + extraMonthly,
    total: baseValues.total + extras,
    installments,
  };
}

function getProductInstallmentTotal(
  product,
  selectedInstallments = Number(product?.installments || 10),
) {
  return getProductInstallmentValues(product, selectedInstallments).total;
}

function getProductMonthlyInstallment(
  product,
  selectedInstallments = Number(product?.installments || 10),
) {
  return getProductInstallmentValues(product, selectedInstallments).monthly;
}

function getProductBaseInstallmentTotal(
  product,
  selectedInstallments = Number(product?.installments || 10),
) {
  return getProductBaseInstallmentValues(product, selectedInstallments).total;
}

function getProductBaseMonthlyInstallment(
  product,
  selectedInstallments = Number(product?.installments || 10),
) {
  return getProductBaseInstallmentValues(product, selectedInstallments).monthly;
}

function renderProducts({ persist = true } = {}) { // Função para renderizar a lista de produtos adicionados ao orçamento
  if (!products.length) { // Verifica se não há produtos na lista
    productList.innerHTML = // Atualiza o conteúdo do elemento de lista de produtos com uma mensagem indicando que não há produtos adicionados
      '<div class="empty-state">Nenhum produto adicionado. Cole um link para começar o orçamento.</div>'; // Mensagem de estado vazio
    updateTotals();
    updateQuoteFooterNote();
    if (persist) persistCurrentQuote();
    return;
  }

  productList.innerHTML = products
    .map((product, index) => {
      const selectedInstallments = Number(product.installments || 10);
      const installmentTotal = getProductBaseInstallmentTotal(
        product,
        selectedInstallments,
      );
      const installmentMonthly = getProductBaseMonthlyInstallment(
        product,
        selectedInstallments,
      );
      const quantity = getProductQuantity(product);
      const pixPrice = money(product.pixPrice);
      const pixTotal =
        (pixPrice + getProductExtraTotal(product)) * quantity;
      const installmentTotalForQuantity = installmentTotal * quantity;
      const dimensaoNicho =
        product.nichoDimensoes || product.nicheDimensions || "";

      return `
        <article class="quote-product">
          <img src="${product.image || "https://via.placeholder.com/600x600?text=Produto"}" alt="${escapeHtml(product.title)}" />
          <div class="quote-product-body">
            <div class="quote-product-head">
              <div>
                <h3>${escapeHtml(product.title)}</h3>
                <span class="product-quantity">${quantity} ${quantity === 1 ? "unidade" : "unidades"}</span>
              </div>
              <div class="quote-product-actions">
                <button type="button" class="duplicate-product" data-index="${index}">+ 1 unidade</button>
                ${quantity > 1 ? `<button type="button" class="remove-duplicate-unit" data-index="${index}">− 1 unidade</button>` : ""}
                <button type="button" class="remove-product" data-index="${index}">Remover</button>
              </div>
            </div>
            <div class="quote-product-values">
              <div>
                <span>Pix (${quantity}x)</span>
                <strong>${currencyFormatter.format(pixTotal)}</strong>
              </div>
              <div>
                <span>${selectedInstallments}x</span>
                <strong>${currencyFormatter.format(installmentMonthly * quantity)}</strong>
              </div>
              <div>
                <span>Valor total</span>
                <strong>${currencyFormatter.format(installmentTotalForQuantity)}</strong>
              </div>
            </div>
        
            <div class="manual-extra-grid">
              <label>
                <span>Valor Pix (por unidade)</span>
                <input class="product-value-input" data-index="${index}" data-field="pixPrice" type="text" inputmode="decimal" value="${pixPrice.toFixed(2)}" />
              </label>
              <label>
                <span>Total parcelado (por unidade)</span>
                <input class="product-value-input" data-index="${index}" data-field="installmentTotalOverride" type="text" inputmode="decimal" value="${installmentTotal.toFixed(2)}" />
              </label>
              <label>
                <span>Garantia</span> 
                <input class="product-extra-input" data-index="${index}" data-field="garantia" type="text" inputmode="decimal" value="${money(product.garantia)}" />
              </label>
              <label>
                <span>Instalação</span>
                <input class="product-extra-input" data-index="${index}" data-field="instalacao" type="text" inputmode="decimal" value="${money(product.instalacao)}" />
              </label>
              <label>
                <span>Seguro</span>
                <input class="product-extra-input" data-index="${index}" data-field="seguro" type="text" inputmode="decimal" value="${money(product.seguro)}" />
              </label>
              <label>
                <span>Parcelas</span>
                <select class="product-installments-select" data-index="${index}">
                  ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((value) => `<option value="${value}" ${Number(product.installments || 10) === value ? "selected" : ""}>${value}x</option>`).join("")}
                </select>
              </label>
              <label>
                <span>Dimensões</span>
                <input class="product-dimensions-input" data-index="${index}" data-field="dimensoes" type="text" value="${escapeHtml(product.dimensoes || "")}" placeholder="Ex: 120x80x40 cm" />
              </label>
              <label>
                <span>Nicho do produto</span>
                <input class="product-dimensions-input" data-index="${index}" data-field="nichoDimensoes" type="text" value="${escapeHtml(dimensaoNicho)}" placeholder="Ex: 125x85x45 cm" />
              </label>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  productList.querySelectorAll(".remove-product").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      products.splice(index, 1);
      renderProducts();
    });
  });

  productList.querySelectorAll(".remove-duplicate-unit").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      const product = products[index];

      if (!product || getProductQuantity(product) <= 1) {
        return;
      }

      product.quantity = getProductQuantity(product) - 1;
      renderProducts();
      setStatus("Uma unidade duplicada foi removida.");
    });
  });

  productList.querySelectorAll(".duplicate-product").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      const product = products[index];

      if (!product) {
        return;
      }

      product.quantity = getProductQuantity(product) + 1;
      renderProducts();
      setStatus("Unidade adicionada ao produto.");
    });
  });

  productList
    .querySelectorAll(".product-value-input, .product-extra-input")
    .forEach((input) => {
      input.addEventListener("input", () => {
        const index = Number(input.dataset.index);
        const field = input.dataset.field;
        input.value = sanitizeDecimalInput(input.value);
        products[index][field] = money(input.value);
        if (field === "installmentTotalOverride") {
          products[index].installmentOverrideInstallments = Number(
            products[index].installments || 10,
          );
        }
        updateTotals();
        updateProductValueCards();
        updateQuoteFooterNote();
        persistCurrentQuote();
      });
    });

  productList.querySelectorAll(".product-dimensions-input").forEach((input) => {
    input.addEventListener("input", () => {
      const index = Number(input.dataset.index);
      products[index][input.dataset.field] = input.value;
      updateQuoteFooterNote();
      persistCurrentQuote();
    });
  });

  productList
    .querySelectorAll(".product-value-input, .product-extra-input")
    .forEach((input) => {
      input.addEventListener("blur", () => {
        if (
          input.classList.contains("product-value-input") ||
          input.classList.contains("product-extra-input")
        ) {
          input.value = sanitizeDecimalInput(input.value);
        }
      });
    });

  productList
    .querySelectorAll(".product-installments-select")
    .forEach((select) => {
      select.addEventListener("change", () => {
        const index = Number(select.dataset.index);
        products[index].installments = Number(select.value || 10);
        delete products[index].installmentTotalOverride;
        delete products[index].installmentOverrideInstallments;
        renderProducts();
      });
    });

  updateTotals();
  updateQuoteFooterNote();
  updateProductValueCards();
  if (persist) persistCurrentQuote();
}

function updateProductValueCards() {
  productList.querySelectorAll(".quote-product").forEach((card, index) => {
    const product = products[index];
    if (!product) return;

    const quantity = getProductQuantity(product);
    const installmentCount = Number(product.installments || 10);
    const values = card.querySelectorAll(".quote-product-values strong");
    const pixTotal =
      (money(product.pixPrice) + getProductExtraTotal(product)) * quantity;

    if (values[0]) values[0].textContent = currencyFormatter.format(pixTotal);
    if (values[1]) {
      values[1].textContent = currencyFormatter.format(
        getProductBaseMonthlyInstallment(product, installmentCount) * quantity,
      );
    }
    if (values[2]) {
      values[2].textContent = currencyFormatter.format(
        getProductBaseInstallmentTotal(product, installmentCount) * quantity,
      );
    }
  });
}

function updateTotals() {
  const frete = money(fields.frete.value);
  const productGarantia = products.reduce(
    (sum, product) => sum + money(product.garantia) * getProductQuantity(product),
    0,
  );
  const productInstalacao = products.reduce(
    (sum, product) => sum + money(product.instalacao) * getProductQuantity(product),
    0,
  );
  const productSeguro = products.reduce(
    (sum, product) => sum + money(product.seguro) * getProductQuantity(product),
    0,
  );

  const totalPix =
    products.reduce(
      (sum, product) =>
        sum + (money(product.pixPrice) + getProductExtraTotal(product)) * getProductQuantity(product),
      0,
    ) + frete;
  const totalInstallment =
    products.reduce(
      (sum, product) =>
        sum +
        getProductInstallmentTotal(product, Number(product.installments || 10)) *
          getProductQuantity(product),
      0,
    ) + frete;
  const installmentPeriods = products.length
    ? Math.max(...products.map((product) => Number(product.installments || 10)))
    : 10;
  const monthlyInstallment = totalInstallment / installmentPeriods;

  totalProductsEl.textContent = String(
    products.reduce((sum, product) => sum + getProductQuantity(product), 0),
  ); // Atualiza o total de produtos adicionados
  totalPixEl.textContent = currencyFormatter.format(totalPix); // Atualiza o valor total à vista (Pix)
  totalInstallmentEl.textContent = currencyFormatter.format(totalInstallment); // Atualiza o valor total parcelado
  installmentLabelEl.textContent = `Parcelado em ${installmentPeriods}x`; // Atualiza o rótulo das parcelas
  monthlyInstallmentEl.textContent = `${installmentPeriods}x de ${currencyFormatter.format(monthlyInstallment)}`; // Atualiza o valor da parcela mensal

  garantiaSummaryEl.textContent = currencyFormatter.format(productGarantia); // Atualiza o valor total da garantia
  instalacaoSummaryEl.textContent = currencyFormatter.format(productInstalacao); // Atualiza o valor total da instalação
  seguroSummaryEl.textContent = currencyFormatter.format(productSeguro); // Atualiza o valor total do seguro
  freteSummaryEl.textContent = currencyFormatter.format(frete); // Atualiza o valor total do frete
}

function setStatus(message, isError = false) {
  // Função para exibir mensagens de status na interface
  statusMessage.textContent = message; // Atualiza o conteúdo do elemento de mensagem de status com a mensagem fornecida
  statusMessage.style.color = isError ? "#a91d1d" : "#5a6477"; // Define a cor do texto com base no tipo de mensagem (erro ou não)
}

async function migrateLegacyQuotes() {
  let raw;
  try {
    raw = localStorage.getItem(legacySavedQuotesStorageKey);
  } catch (error) {
    setStatus(`Não foi possível ler orçamentos antigos deste navegador: ${error.message}`, true);
    return;
  }
  if (!raw) return;

  let legacyQuotes;
  try {
    legacyQuotes = JSON.parse(raw);
    if (
      !Array.isArray(legacyQuotes) ||
      legacyQuotes.some(
        (quote) =>
          !quote ||
          typeof quote.id !== "string" ||
          typeof quote.name !== "string" ||
          !Array.isArray(quote.products),
      )
    ) {
      throw new Error("A lista antiga tem um formato inválido.");
    }
  } catch (error) {
    setStatus(`Não foi possível migrar orçamentos antigos: ${error.message}`, true);
    return;
  }

  try {
    for (const quote of legacyQuotes) {
      await apiRequest(`/api/quotes/${encodeURIComponent(quote.id)}`, {
        method: "PUT",
        body: JSON.stringify(quote),
      });
    }
    localStorage.removeItem(legacySavedQuotesStorageKey);
    setStatus(`${legacyQuotes.length} orçamento(s) deste navegador foram migrados para a nuvem.`);
  } catch (error) {
    setStatus(`A migração dos orçamentos antigos não foi concluída: ${error.message}`, true);
  }
}

async function fetchProduct(url) {
  const response = await fetch(`/api/product?url=${encodeURIComponent(url)}`);

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Não foi possível carregar o produto.");
  }

  return response.json();
}

function createQuoteProduct(product) {
  return {
    ...product,
    garantia: 0,
    instalacao: 0,
    seguro: 0,
    dimensoes: product.dimensoes || "",
    nichoDimensoes: product.nichoDimensoes || product.nicheDimensions || "",
    installments: Number(product.installments || 10),
    installmentTotal: getProductInstallmentTotal(product),
  };
}

async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  const contentType = response.headers.get("Content-Type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;
  if (!response.ok) {
    throw new Error(payload?.error || `Falha na solicitação (${response.status}).`);
  }
  return payload;
}

function renderSavedQuotes() {
  const selectedId = savedQuotesSelect.value;
  savedQuotesSelect.replaceChildren(
    new Option("Selecione um orçamento", ""),
  );

  [...savedQuotes]
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .forEach((quote) => {
      const option = new Option(
        quote.clientName ? `${quote.name} — ${quote.clientName}` : quote.name,
        quote.id,
      );
      savedQuotesSelect.add(option);
    });

  if (savedQuotes.some((quote) => quote.id === selectedId)) {
    savedQuotesSelect.value = selectedId;
  }
}

async function refreshSavedQuotes() {
  const payload = await apiRequest("/api/quotes");
  savedQuotes = payload.quotes || [];
  renderSavedQuotes();
}

function queueQuoteSave(id, body) {
  const save = quoteSaveQueue
    .catch(() => {})
    .then(() =>
      apiRequest(`/api/quotes/${encodeURIComponent(id)}`, {
        method: "PUT",
        body,
      }),
    );
  quoteSaveQueue = save;
  return save;
}

async function flushCurrentQuote() {
  if (!currentQuoteId) return;
  const quoteId = currentQuoteId;
  clearTimeout(persistTimer);
  await queueQuoteSave(
    quoteId,
    JSON.stringify(
      getCurrentQuoteSnapshot(
        quoteId,
        savedQuotes.find((item) => item.id === quoteId)?.createdAt,
      ),
    ),
  );
  await refreshSavedQuotes();
}

function getCurrentQuoteSnapshot(id, createdAt = new Date().toISOString()) {
  return {
    id,
    name: quoteNameInput.value.trim(),
    clientName: document.getElementById("client-name").value.trim(),
    sellerName: document.getElementById("seller-name").value.trim(),
    frete: fields.frete.value,
    deliveryDate: deliveryDateInput.value,
    products: JSON.parse(JSON.stringify(products)),
    createdAt,
    updatedAt: new Date().toISOString(),
  };
}

function persistCurrentQuote() {
  if (!currentQuoteId) return;
  const quoteId = currentQuoteId;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    if (currentQuoteId !== quoteId) return;
    try {
      const quote = getCurrentQuoteSnapshot(
        quoteId,
        savedQuotes.find((item) => item.id === quoteId)?.createdAt,
      );
      await queueQuoteSave(quoteId, JSON.stringify(quote));
      await refreshSavedQuotes();
      setStatus("Alterações sincronizadas com a nuvem.");
    } catch (error) {
      setStatus(`Não foi possível sincronizar o orçamento: ${error.message}`, true);
    }
  }, 500);
}

async function saveCurrentQuote() {
  const name = quoteNameInput.value.trim();
  if (!name) {
    setStatus("Informe um nome para salvar o orçamento.", true);
    quoteNameInput.focus();
    return;
  }

  const existingQuote = savedQuotes.find((quote) => quote.id === currentQuoteId);
  const id =
    currentQuoteId ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const quote = getCurrentQuoteSnapshot(id, existingQuote?.createdAt);
  try {
    clearTimeout(persistTimer);
    await queueQuoteSave(id, JSON.stringify(quote));
    currentQuoteId = id;
    await refreshSavedQuotes();
    savedQuotesSelect.value = id;
    setStatus(`Orçamento "${name}" salvo na nuvem.`);
  } catch (error) {
    setStatus(`Não foi possível salvar o orçamento: ${error.message}`, true);
  }
}

async function loadSelectedQuote() {
  const id = savedQuotesSelect.value;
  if (!id) {
    setStatus("Selecione um orçamento salvo para abrir.", true);
    return;
  }

  try {
    await flushCurrentQuote();
  } catch (error) {
    setStatus(`Não foi possível sincronizar o orçamento atual: ${error.message}`, true);
    return;
  }

  let quote;
  try {
    quote = await apiRequest(`/api/quotes/${encodeURIComponent(id)}`);
  } catch (error) {
    setStatus(`Não foi possível abrir o orçamento: ${error.message}`, true);
    return;
  }

  quoteNameInput.value = quote.name;
  document.getElementById("client-name").value = quote.clientName || "";
  document.getElementById("seller-name").value = quote.sellerName || "";
  fields.frete.value = quote.frete ?? "0";
  deliveryDateInput.value = quote.deliveryDate || "";
  products = JSON.parse(JSON.stringify(quote.products));
  currentQuoteId = quote.id;
  renderProducts({ persist: false });
  updateQuoteFooterNote();
  setStatus(`Orçamento "${quote.name}" carregado para edição.`);
}

async function deleteSelectedQuote() {
  const quote = savedQuotes.find(
    (item) => item.id === savedQuotesSelect.value,
  );
  if (!quote) {
    setStatus("Selecione um orçamento salvo para excluir.", true);
    return;
  }
  if (!window.confirm(`Excluir o orçamento salvo "${quote.name}"?`)) return;

  const wasCurrentQuote = currentQuoteId === quote.id;
  if (wasCurrentQuote) {
    clearTimeout(persistTimer);
    currentQuoteId = null;
    await quoteSaveQueue.catch(() => {});
  }
  try {
    await apiRequest(`/api/quotes/${encodeURIComponent(quote.id)}`, {
      method: "DELETE",
    });
    await refreshSavedQuotes();
    if (wasCurrentQuote) {
      currentQuoteId = null;
      quoteNameInput.value = "";
    }
    setStatus(`Orçamento salvo "${quote.name}" excluído.`);
  } catch (error) {
    if (wasCurrentQuote) {
      currentQuoteId = quote.id;
      persistCurrentQuote();
    }
    setStatus(`Não foi possível excluir o orçamento: ${error.message}`, true);
  }
}

async function startNewQuote() {
  if (
    !window.confirm(
      "Iniciar um orçamento novo? Alterações do orçamento salvo serão sincronizadas; alterações não salvas serão descartadas.",
    )
  ) {
    return;
  }

  try {
    await flushCurrentQuote();
  } catch (error) {
    setStatus(`Não foi possível sincronizar o orçamento atual: ${error.message}`, true);
    return;
  }
  clearTimeout(persistTimer);
  currentQuoteId = null;
  quoteNameInput.value = "";
  document.getElementById("client-name").value = "";
  document.getElementById("seller-name").value = "";
  fields.frete.value = "0";
  deliveryDateInput.value = "";
  products = [];
  savedQuotesSelect.value = "";
  searchStack.querySelectorAll(".search-row").forEach((row, index) => {
    if (index > 0) row.remove();
    else row.querySelector(".product-link-input").value = "";
  });
  renderProducts({ persist: false });
  updateQuoteFooterNote();
  setStatus("Novo orçamento iniciado.");
}

function addSearchRow() {
  const row = document.createElement("div");
  row.className = "search-row";
  row.dataset.rowId = String(rowCounter++);
  row.innerHTML = `
    <input type="url" class="product-link-input" placeholder="Cole outro link do produto" autocomplete="off" required />
    <button type="button" class="search-row-button">Buscar</button>
    <button type="button" class="remove-row-button" aria-label="Remover campo">×</button>
  `;

  const input = row.querySelector(".product-link-input");
  const searchButton = row.querySelector(".search-row-button");
  const removeButton = row.querySelector(".remove-row-button");

  searchButton.addEventListener("click", async () => {
    const url = input.value.trim();
    if (!url) {
      setStatus("Informe um link válido para continuar.", true);
      return;
    }

    setStatus("Buscando informações do produto...");

    try {
      const product = await fetchProduct(url);
      products.push(createQuoteProduct(product));
      renderProducts();
      setStatus("Produto adicionado ao orçamento.");
      row.remove();
      addSearchRow();
    } catch (error) {
      setStatus(error.message || "Não foi possível buscar o produto.", true);
    }
  });

  removeButton.addEventListener("click", () => {
    row.remove();
  });

  searchStack.appendChild(row);
}

Object.values(fields).forEach((field) => {
  field.addEventListener("input", () => {
    updateTotals();
    updateQuoteFooterNote();
    persistCurrentQuote();
  });
});

deliveryDateInput.addEventListener("input", () => {
  updateQuoteFooterNote();
  persistCurrentQuote();
});

["client-name", "seller-name"].forEach((id) => {
  document.getElementById(id).addEventListener("input", persistCurrentQuote);
});

quoteNameInput.addEventListener("input", () => {
  if (quoteNameInput.value.trim()) persistCurrentQuote();
});

saveQuoteButton.addEventListener("click", saveCurrentQuote);
loadQuoteButton.addEventListener("click", loadSelectedQuote);
deleteQuoteButton.addEventListener("click", deleteSelectedQuote);
newQuoteButton.addEventListener("click", startNewQuote);

addProductBtn.addEventListener("click", () => {
  addSearchRow();
  const latestInput = searchStack.querySelector(
    ".product-link-input:last-of-type",
  );
  if (latestInput) latestInput.focus();
});

function populatePrintArea() {
  const printClient = document.getElementById("print-client");
  const printSeller = document.getElementById("print-seller");
  const printDelivery = document.getElementById("print-delivery");
  const printBody = document.getElementById("print-products-body");

  const printFrete = document.getElementById("print-frete");
  const printGarantia = document.getElementById("print-garantia");
  const printInstalacao = document.getElementById("print-instalacao");
  const printSeguro = document.getElementById("print-seguro");

  const printTotalPix = document.getElementById("print-total-pix");

  const printTotalInstallment = document.getElementById(
    "print-total-installment",
  );

  const printMonthly = document.getElementById("print-monthly-installment");

  /*
    ============================
    DADOS DO CLIENTE
    ============================
  */

  if (printClient) {
    printClient.textContent =
      document.getElementById("client-name")?.value || "-";
  }

  if (printSeller) {
    printSeller.textContent =
      document.getElementById("seller-name")?.value || "-";
  }

  if (printDelivery) {
    printDelivery.textContent =
      formatBrazilDate(document.getElementById("delivery-date")?.value) || "-";
  }

  /*
    ============================
    PRODUTOS
    ============================
  */

  if (printBody) {
    printBody.innerHTML = products
      .map((product) => {
        const installments = Number(product.installments || 10);
        const quantity = getProductQuantity(product);

        /*
          Valores parcelados do produto
          SEM os adicionais
        */

        const baseMonthly = getProductBaseMonthlyInstallment(
          product,
          installments,
        );

        const baseTotal = getProductBaseInstallmentTotal(product, installments);

        /*
          Valores individuais
          de cada adicional
        */

        const garantia = money(product.garantia) * quantity;

        const instalacao = money(product.instalacao) * quantity;

        const seguro = money(product.seguro) * quantity;

        /*
          Soma dos adicionais
        */

        const extrasTotal = garantia + instalacao + seguro;

        /*
          Mantém o PIX original do produto na primeira coluna do PDF.
          A soma com quantidade e adicionais continua sendo feita no total geral.
        */

        const pixValue = money(product.pixPrice) * quantity;

        const installmentTotal = (baseTotal + extrasTotal) * quantity;

        /*
          Valor mensal com adicionais
        */

        /*
          Dimensões
        */

        const dimensoes =
          product.dimensoes && String(product.dimensoes).trim()
            ? String(product.dimensoes).trim()
            : "Não informado";
        const nichoDimensoes =
          product.nichoDimensoes && String(product.nichoDimensoes).trim()
            ? String(product.nichoDimensoes).trim()
            : "Não informado";

        /*
          Monta somente os adicionais
          que possuem valor maior que zero
        */

        const extras = [];

        if (garantia > 0) {
          extras.push(`
            <div class="print-extra-item">
              <span>Garantia</span>
              <strong>
                ${currencyFormatter.format(garantia)}
              </strong>
            </div>
          `);
        }

        if (instalacao > 0) {
          extras.push(`
            <div class="print-extra-item">
              <span>Instalação</span>
              <strong>
                ${currencyFormatter.format(instalacao)}
              </strong>
            </div>
          `);
        }

        if (seguro > 0) {
          extras.push(`
            <div class="print-extra-item">
              <span>Seguro</span>
              <strong>
                ${currencyFormatter.format(seguro)}
              </strong>
            </div>
          `);
        }

        /*
          Caso não tenha nenhum adicional
        */

        const extrasHtml =
          extras.length > 0
            ? `
              <div class="print-extras">
                ${extras.join("")}
              </div>
            `
            : `
              <span class="print-no-extra">
                Sem adicionais
              </span>
            `;

        /*
          Linha do produto no PDF
        */

        return `
          <tr>

            <td>
              <img
                src="${product.image || ""}"
                alt="${escapeHtml(product.title)}"
              />
            </td>

            <td>
              <div class="print-model-cell">

                <strong>
                  ${escapeHtml(product.title)}
                </strong>

                <small>
                  Quantidade: ${quantity} ${quantity === 1 ? "unidade" : "unidades"}<br />
                  Dimensões:
                  ${escapeHtml(dimensoes)}<br />
                  Nicho:
                  ${escapeHtml(nichoDimensoes)}
                </small>

              </div>
            </td>

            <td>
              <strong>
                ${currencyFormatter.format(pixValue)}
              </strong>
            </td>

            <td>
              ${installments}x de
              ${currencyFormatter.format(baseMonthly * quantity)}
            </td>

            <td>
              ${extrasHtml}
            </td>

          </tr>
        `;
      })
      .join("");
  }

  /*
    ============================
    TOTAIS GERAIS
    ============================
  */

  const frete = money(document.getElementById("frete")?.value);

  const garantiaTotal = products.reduce(
    (sum, product) => sum + money(product.garantia) * getProductQuantity(product),
    0,
  );

  const instalacaoTotal = products.reduce(
    (sum, product) => sum + money(product.instalacao) * getProductQuantity(product),
    0,
  );

  const seguroTotal = products.reduce(
    (sum, product) => sum + money(product.seguro) * getProductQuantity(product),
    0,
  );

  /*
    ============================
    EXIBE OS TOTAIS NO PDF
    ============================
  */

  if (printFrete) {
    printFrete.textContent = currencyFormatter.format(frete);
  }

  if (printGarantia) {
    printGarantia.textContent = currencyFormatter.format(garantiaTotal);
  }

  if (printInstalacao) {
    printInstalacao.textContent = currencyFormatter.format(instalacaoTotal);
  }

  if (printSeguro) {
    printSeguro.textContent = currencyFormatter.format(seguroTotal);
  }

  /*
    ============================
    TOTAL NO PIX
    ============================
  */

  const totalPix =
    products.reduce(
      (sum, product) =>
        sum + (money(product.pixPrice) + getProductExtraTotal(product)) * getProductQuantity(product),
      0,
    ) + frete;

  /*
    ============================
    TOTAL PARCELADO
    ============================
  */

  const totalInstallment =
    products.reduce(
      (sum, product) =>
        sum +
        getProductInstallmentTotal(product, Number(product.installments || 10)) *
          getProductQuantity(product),
      0,
    ) + frete;

  /*
    ============================
    MAIOR QUANTIDADE DE PARCELAS
    ============================
  */

  const installmentPeriods = products.length
    ? Math.max(...products.map((product) => Number(product.installments || 10)))
    : 10;

  const monthlyInstallment = totalInstallment / installmentPeriods;

  /*
    ============================
    ATUALIZA OS CAMPOS
    ============================
  */

  if (printTotalPix) {
    printTotalPix.textContent = currencyFormatter.format(totalPix);
  }

  if (printTotalInstallment) {
    printTotalInstallment.textContent =
      `${installmentPeriods}x de ${currencyFormatter.format(monthlyInstallment)} ` +
      `(total ${currencyFormatter.format(totalInstallment)})`;
  }

  /*
    ============================
    RODAPÉ
    ============================
  */

  const printFooterNote = document.getElementById("print-footer-note");

  const createdLabel = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  if (printFooterNote) {
    printFooterNote.textContent =
      `Orçamento emitido em ${createdLabel}. ` +
      `Os valores podem sofrer alteração de preço sem aviso prévio.`;
  }
}

pdfButton.addEventListener("click", () => {
  if (!products.length) {
    setStatus("Adicione pelo menos um produto antes de gerar o PDF.", true);
    return;
  }
  populatePrintArea();
  setStatus("Pré-visualize o orçamento e escolha Salvar como PDF na janela de impressão.");
  requestAnimationFrame(() => {
    setTimeout(() => window.print(), 50);
  });
});

const mainInput = document.getElementById("product-url"); // Input principal para inserir o link do produto
mainInput.addEventListener("keydown", (event) => { // Adiciona um listener para o evento de pressionar tecla no input principal
  if (event.key === "Enter") {
    event.preventDefault();
    const url = mainInput.value.trim();
    if (!url) {
      setStatus("Informe um link válido para continuar.", true);
      return;
    }

    fetchProduct(url)
      .then((product) => {
        products.push(createQuoteProduct(product));
        renderProducts();
        mainInput.value = "";
        setStatus("Produto adicionado ao orçamento.");
      })
      .catch((error) => {
        setStatus(error.message || "Não foi possível buscar o produto.", true);
      });
  }
});

const mainSearchButton = document.getElementById("search-button");
mainSearchButton.addEventListener("click", async () => {
  const url = mainInput.value.trim();
  if (!url) {
    setStatus("Informe um link válido para continuar.", true);
    return;
  }

  setStatus("Buscando informações do produto...");

  try {
    const product = await fetchProduct(url);
    products.push(createQuoteProduct(product));
    renderProducts();
    mainInput.value = "";
    setStatus("Produto adicionado ao orçamento.");
  } catch (error) {
    setStatus(error.message || "Não foi possível buscar o produto.", true);
  }
});

renderSavedQuotes();
renderProducts();
updateQuoteFooterNote();
migrateLegacyQuotes()
  .then(refreshSavedQuotes)
  .catch((error) => {
    setStatus(`Não foi possível carregar os orçamentos salvos: ${error.message}`, true);
  });
