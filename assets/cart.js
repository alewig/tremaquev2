class CartRemoveButton extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('click', (event) => {
      event.preventDefault();
      const cartItems = this.closest('cart-items') || this.closest('cart-drawer-items');
      cartItems.updateQuantity(this.dataset.index, 0, event);
    });
  }
}

customElements.define('cart-remove-button', CartRemoveButton);

class CartItems extends HTMLElement {
  constructor() {
    super();
    this.lineItemStatusElement =
      document.getElementById('shopping-cart-line-item-status') || document.getElementById('CartDrawer-LineItemStatus');

    const debouncedOnChange = debounce((event) => {
      this.onChange(event);
    }, ON_CHANGE_DEBOUNCE_TIMER);

    this.addEventListener('change', debouncedOnChange.bind(this));
  }

  cartUpdateUnsubscriber = undefined;

  connectedCallback() {
    this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
      if (event.source === 'cart-items') {
        return;
      }
      return this.onCartUpdate();
    });
  }

  disconnectedCallback() {
    if (this.cartUpdateUnsubscriber) {
      this.cartUpdateUnsubscriber();
    }
  }

  resetQuantityInput(id) {
    const input = this.querySelector(`#Quantity-${id}`);
    input.value = input.getAttribute('value');
    this.isEnterPressed = false;
  }

  setValidity(event, index, message) {
    event.target.setCustomValidity(message);
    event.target.reportValidity();
    this.resetQuantityInput(index);
    event.target.select();
  }

  validateQuantity(event) {
    const inputValue = parseInt(event.target.value);
    const index = event.target.dataset.index;
    let message = '';

    if (inputValue < event.target.dataset.min) {
      message = window.quickOrderListStrings.min_error.replace('[min]', event.target.dataset.min);
    } else if (inputValue > parseInt(event.target.max)) {
      message = window.quickOrderListStrings.max_error.replace('[max]', event.target.max);
    } else if (inputValue % parseInt(event.target.step) !== 0) {
      message = window.quickOrderListStrings.step_error.replace('[step]', event.target.step);
    }

    if (message) {
      this.setValidity(event, index, message);
    } else {
      event.target.setCustomValidity('');
      event.target.reportValidity();
      this.updateQuantity(
        index,
        inputValue,
        event,
        document.activeElement.getAttribute('name'),
        event.target.dataset.quantityVariantId
      );
    }
  }

  onChange(event) {
    this.validateQuantity(event);
  }

  onCartUpdate() {
    if (this.tagName === 'CART-DRAWER-ITEMS') {
      return fetch(`${routes.cart_url}?section_id=cart-drawer`)
        .then((response) => response.text())
        .then((responseText) => {
          const html = new DOMParser().parseFromString(responseText, 'text/html');
          const selectors = ['cart-drawer-items', '.cart-drawer__footer'];
          for (const selector of selectors) {
            const targetElement = document.querySelector(selector);
            const sourceElement = html.querySelector(selector);
            if (targetElement && sourceElement) {
              targetElement.replaceWith(sourceElement);
            }
          }
        })
        .catch((e) => {
          console.error(e);
        });
    } else {
      return fetch(`${routes.cart_url}?section_id=main-cart-items`)
        .then((response) => response.text())
        .then((responseText) => {
          const html = new DOMParser().parseFromString(responseText, 'text/html');
          const sourceQty = html.querySelector('cart-items');
          this.innerHTML = sourceQty.innerHTML;
        })
        .catch((e) => {
          console.error(e);
        });
    }
  }

  getSectionsToRender() {
    return [
      {
        id: 'main-cart-items',
        section: document.getElementById('main-cart-items').dataset.id,
        selector: '.js-contents',
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section',
      },
      {
        id: 'cart-live-region-text',
        section: 'cart-live-region-text',
        selector: '.shopify-section',
      },
      {
        id: 'main-cart-footer',
        section: document.getElementById('main-cart-footer').dataset.id,
        selector: '.js-contents',
      },
    ];
  }

  updateQuantity(line, quantity, event, name, variantId) {
    this.enableLoading(line);

    const body = JSON.stringify({
      line,
      quantity,
      sections: this.getSectionsToRender().map((section) => section.section),
      sections_url: window.location.pathname,
    });
    const eventTarget = event.currentTarget instanceof CartRemoveButton ? 'clear' : 'change';

    console.log('[CART DEBUG] Iniciando updateQuantity:', { line, quantity, eventTarget });

    fetch(`${routes.cart_change_url}`, { ...fetchConfig(), ...{ body } })
      .then((response) => {
        console.log('[CART DEBUG] Response status:', response.status);
        return response.text();
      })
      .then((state) => {
        const parsedState = JSON.parse(state);
        console.log('[CART DEBUG] Parsed state:', {
          item_count: parsedState.item_count,
          items_length: parsedState.items?.length,
          errors: parsedState.errors,
          has_sections: !!parsedState.sections
        });

        const paintUpdate = () => {
          // Salvar elementos ANTES de atualizar o DOM
          const quantityElement =
            document.getElementById(`Quantity-${line}`) || document.getElementById(`Drawer-quantity-${line}`);
          const itemsBeforeUpdate = document.querySelectorAll('.cart-item');
          const quantityValueBefore = quantityElement ? parseInt(quantityElement.value) : null;
          
          console.log('[CART DEBUG] Antes da atualização:', {
            quantityElement: !!quantityElement,
            quantityValueBefore,
            itemsBeforeUpdate_length: itemsBeforeUpdate.length
          });

          if (parsedState.errors) {
            console.error('[CART DEBUG] Erros no parsedState:', parsedState.errors);
            if (quantityElement) {
              quantityElement.value = quantityElement.getAttribute('value');
            }
            this.updateLiveRegions(line, parsedState.errors);
            return;
          }

          this.classList.toggle('is-empty', parsedState.item_count === 0);
          const cartDrawerWrapper = document.querySelector('cart-drawer');
          const cartFooter = document.getElementById('main-cart-footer');

          if (cartFooter) cartFooter.classList.toggle('is-empty', parsedState.item_count === 0);
          if (cartDrawerWrapper) cartDrawerWrapper.classList.toggle('is-empty', parsedState.item_count === 0);

          // Atualizar o DOM
          this.getSectionsToRender().forEach((section) => {
            const elementToReplace =
              document.getElementById(section.id)?.querySelector(section.selector) || document.getElementById(section.id);
            if (elementToReplace && parsedState.sections?.[section.section]) {
              elementToReplace.innerHTML = this.getSectionInnerHTML(
                parsedState.sections[section.section],
                section.selector
              );
            } else {
              console.warn('[CART DEBUG] Elemento ou seção não encontrada:', {
                section_id: section.id,
                section_section: section.section,
                elementExists: !!elementToReplace,
                sectionExists: !!parsedState.sections?.[section.section]
              });
            }
          });

          // Verificar se item foi removido (quantity = 0)
          const isItemRemoved = quantity === 0;
          const itemsAfterUpdate = parsedState.items || [];
          const itemsAfterUpdateLength = itemsAfterUpdate.length;
          
          // Tentar encontrar o item no array (pode não estar no mesmo índice após remoção)
          const itemAtIndex = itemsAfterUpdate[line - 1];
          const updatedValue = itemAtIndex ? itemAtIndex.quantity : undefined;
          
          console.log('[CART DEBUG] Após atualização:', {
            isItemRemoved,
            itemsBeforeUpdate_length: itemsBeforeUpdate.length,
            itemsAfterUpdate_length: itemsAfterUpdateLength,
            item_count: parsedState.item_count,
            itemAtIndex: !!itemAtIndex,
            updatedValue,
            line: parseInt(line),
            allItems: itemsAfterUpdate.map((item, idx) => ({ index: idx + 1, id: item.id, quantity: item.quantity }))
          });

          let message = '';
          
          // Se item foi removido com sucesso, não mostrar erro
          if (isItemRemoved) {
            // Item removido - verificar se foi bem-sucedido
            if (itemsAfterUpdateLength < itemsBeforeUpdate.length || parsedState.item_count === 0) {
              console.log('[CART DEBUG] Item removido com sucesso');
              message = '';
            } else {
              console.warn('[CART DEBUG] Tentativa de remover item mas ainda está no carrinho');
              message = window.cartStrings.error;
            }
          } else if (itemsBeforeUpdate.length === itemsAfterUpdateLength && quantityElement) {
            // Quantidade alterada (não removido) - verificar se a mudança foi aplicada
            if (updatedValue !== quantityValueBefore && updatedValue !== undefined) {
              if (updatedValue === 0) {
                // Quantidade foi zerada mas item ainda está no array (não deveria acontecer)
                console.warn('[CART DEBUG] Quantidade zerada mas item ainda no array');
                message = '';
              } else {
                message = window.cartStrings.quantityError.replace('[quantity]', updatedValue);
              }
            }
          } else if (!isItemRemoved && itemsBeforeUpdate.length !== itemsAfterUpdateLength) {
            // Número de itens mudou sem ser remoção - pode ser adição ou problema
            console.log('[CART DEBUG] Número de itens mudou (não foi remoção)');
            message = '';
          }
          
          this.updateLiveRegions(line, message);

          const lineItem =
            document.getElementById(`CartItem-${line}`) || document.getElementById(`CartDrawer-Item-${line}`);
          if (lineItem && lineItem.querySelector(`[name="${name}"]`)) {
            cartDrawerWrapper
              ? trapFocus(cartDrawerWrapper, lineItem.querySelector(`[name="${name}"]`))
              : lineItem.querySelector(`[name="${name}"]`).focus();
          } else if (parsedState.item_count === 0 && cartDrawerWrapper) {
            trapFocus(cartDrawerWrapper.querySelector('.drawer__inner-empty'), cartDrawerWrapper.querySelector('a'));
          } else if (document.querySelector('.cart-item') && cartDrawerWrapper) {
            trapFocus(cartDrawerWrapper, document.querySelector('.cart-item__name'));
          }
        };

        // Executar com ou sem CartPerformance
        try {
          if (typeof window !== 'undefined' && window.CartPerformance && typeof window.CartPerformance.measure === 'function') {
            window.CartPerformance.measure(`${eventTarget}:paint-updated-sections`, paintUpdate);
          } else {
            paintUpdate();
          }
        } catch (e) {
          console.warn('[CART DEBUG] Erro ao usar CartPerformance, executando diretamente:', e);
          paintUpdate();
        }

        try {
          if (typeof window !== 'undefined' && window.CartPerformance && typeof window.CartPerformance.measureFromEvent === 'function') {
            window.CartPerformance.measureFromEvent(`${eventTarget}:user-action`, event);
          }
        } catch (e) {
          console.warn('[CART DEBUG] Erro ao usar CartPerformance.measureFromEvent:', e);
        }

        publish(PUB_SUB_EVENTS.cartUpdate, { source: 'cart-items', cartData: parsedState, variantId: variantId });
      })
      .catch((error) => {
        console.error('[CART DEBUG] Erro no catch:', error);
        this.querySelectorAll('.loading__spinner').forEach((overlay) => overlay.classList.add('hidden'));
        const errors = document.getElementById('cart-errors') || document.getElementById('CartDrawer-CartErrors');
        if (errors) {
          errors.textContent = window.cartStrings.error;
        }
      })
      .finally(() => {
        this.disableLoading(line);
      });
  }

  updateLiveRegions(line, message) {
    const lineItemError =
      document.getElementById(`Line-item-error-${line}`) || document.getElementById(`CartDrawer-LineItemError-${line}`);
    if (lineItemError) lineItemError.querySelector('.cart-item__error-text').textContent = message;

    this.lineItemStatusElement.setAttribute('aria-hidden', true);

    const cartStatus =
      document.getElementById('cart-live-region-text') || document.getElementById('CartDrawer-LiveRegionText');
    cartStatus.setAttribute('aria-hidden', false);

    setTimeout(() => {
      cartStatus.setAttribute('aria-hidden', true);
    }, 1000);
  }

  getSectionInnerHTML(html, selector) {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
  }

  enableLoading(line) {
    const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
    mainCartItems.classList.add('cart__items--disabled');

    const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
    const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

    [...cartItemElements, ...cartDrawerItemElements].forEach((overlay) => overlay.classList.remove('hidden'));

    document.activeElement.blur();
    this.lineItemStatusElement.setAttribute('aria-hidden', false);
  }

  disableLoading(line) {
    const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
    mainCartItems.classList.remove('cart__items--disabled');

    const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
    const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

    cartItemElements.forEach((overlay) => overlay.classList.add('hidden'));
    cartDrawerItemElements.forEach((overlay) => overlay.classList.add('hidden'));
  }
}

customElements.define('cart-items', CartItems);

if (!customElements.get('cart-note')) {
  customElements.define(
    'cart-note',
    class CartNote extends HTMLElement {
      constructor() {
        super();

        this.addEventListener(
          'input',
          debounce((event) => {
            const body = JSON.stringify({ note: event.target.value });
            fetch(`${routes.cart_update_url}`, { ...fetchConfig(), ...{ body } })
              .then(() => {
                if (typeof CartPerformance !== 'undefined' && CartPerformance.measureFromEvent) {
                  CartPerformance.measureFromEvent('note-update:user-action', event);
                }
              });
          }, ON_CHANGE_DEBOUNCE_TIMER)
        );
      }
    }
  );
}

(function () {
  var SHIPPING_CALC_TOKEN = '622110E8R81CER4B0DR97CBRF44173A82224';
  var productDimensionsCache = {};

  function normalizeDimensionValue(value) {
    if (value == null || value === '') return '';
    return String(value).replace(',', '.');
  }

  function formatCep(value) {
    var digits = String(value || '').replace(/\D/g, '').slice(0, 8);
    if (digits.length < 8) return digits.padEnd(8, '0');
    return digits;
  }

  function formatWeight(weightGrams) {
    return parseFloat(((Number(weightGrams) || 0) / 1000).toFixed(3));
  }

  function formatDimension(value, fallback) {
    var parsed = parseFloat(normalizeDimensionValue(value));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function toQueryString(obj, prefix) {
    var str = [];
    for (var p in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, p)) continue;
      var k = prefix ? prefix + '[' + p + ']' : p;
      var v = obj[p];
      str.push(
        v !== null && typeof v === 'object'
          ? toQueryString(v, k)
          : encodeURIComponent(k) + '=' + encodeURIComponent(v)
      );
    }
    return str.join('&');
  }

  function updateCartFooterTotalWithShipping(priceValue) {
    var totalsDiv = document.getElementById('cart-total-with-shipping');
    var totalValueEl = document.getElementById('totals-total-value');
    if (!totalsDiv || !totalValueEl) return;

    var cartTotalCents = parseInt(totalsDiv.getAttribute('data-cart-total-cents') || '0', 10);
    var shippingCents = priceValue ? Math.round(parseFloat(priceValue) * 100) : 0;
    var totalCents = cartTotalCents + shippingCents;
    var symbol = totalsDiv.getAttribute('data-currency-symbol') || 'R$';

    totalValueEl.textContent = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(totalCents / 100).replace('R$', symbol);

    var pixValueEl = document.getElementById('totals-pix-value');
    var parcelasValueEl = document.getElementById('totals-parcelas-value');
    var pixDiscountPct = parseInt(totalsDiv.getAttribute('data-pix-discount-pct') || '0', 10);
    var parcelas = parseInt(totalsDiv.getAttribute('data-parcelas') || '3', 10);
    var pixEnabled = totalsDiv.getAttribute('data-pix-enabled') === 'true';

    if (pixValueEl && pixEnabled && pixDiscountPct > 0) {
      pixValueEl.textContent = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format((Math.round(totalCents * (1 - pixDiscountPct * 0.01))) / 100).replace('R$', symbol);
    }

    if (parcelasValueEl && parcelas > 0) {
      parcelasValueEl.textContent = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format((Math.floor(totalCents / parcelas)) / 100).replace('R$', symbol);
    }
  }

  async function fetchCartJson() {
    var response = await fetch('/cart.js', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('cart.js request failed');
    return response.json();
  }

  async function fetchProductDimensions(itemUrl) {
    if (!itemUrl) return null;
    if (productDimensionsCache[itemUrl]) return productDimensionsCache[itemUrl];

    var request = fetch(itemUrl, { credentials: 'same-origin' })
      .then(function (response) {
        if (!response.ok) throw new Error('product page request failed');
        return response.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');

        function readInput(name) {
          var input = doc.querySelector('input[name="properties[' + name + ']"]');
          return input ? normalizeDimensionValue(input.value) : '';
        }

        return {
          height: readInput('_frenet_altura'),
          length: readInput('_frenet_comprimento'),
          width: readInput('_frenet_largura'),
        };
      })
      .catch(function () {
        return null;
      });

    productDimensionsCache[itemUrl] = request;
    return request;
  }

  async function buildLiveCartShippingData() {
    var cart = await fetchCartJson();
    var items = await Promise.all(
      (cart.items || []).map(async function (item) {
        var properties = item.properties || {};
        var height = normalizeDimensionValue(properties._frenet_altura);
        var length = normalizeDimensionValue(properties._frenet_comprimento);
        var width = normalizeDimensionValue(properties._frenet_largura);

        if (!height || !length || !width) {
          var fallbackDimensions = await fetchProductDimensions(item.url);
          if (fallbackDimensions) {
            height = height || fallbackDimensions.height;
            length = length || fallbackDimensions.length;
            width = width || fallbackDimensions.width;
          }
        }

        return {
          sku: item.sku || '',
          height: height || '21',
          length: length || '7',
          width: width || '14',
          weightGrams: item.grams || 300,
          quantity: item.quantity || 1,
        };
      })
    );

    return {
      shipmentInvoiceValueCents: cart.total_price || 0,
      items: items,
    };
  }

  function renderShippingOptions(opcoesEl, services) {
    var valid = (services || []).filter(function (item) {
      return item.ShippingPrice != null && item.DeliveryTime != null;
    });

    if (!valid.length) {
      opcoesEl.innerHTML = '<p class="shipping-calc-cart__opcoes-empty">Nenhuma opção de frete encontrada para este CEP.</p>';
      return;
    }

    opcoesEl.innerHTML = valid
      .map(function (item, index) {
        var price = parseFloat(item.ShippingPrice);
        var prazo = item.DeliveryTime + ' dias úteis';
        var nome = item.Carrier || item.ServiceDescription || item.CarrierName || 'Forma de Entrega';
        return (
          '<label class="shipping-calc-cart__opcoes-item">' +
          '<input type="radio" name="shipping-calc-cart-option" value="' +
          index +
          '" data-price="' +
          price +
          '" data-name="' +
          nome.replace(/"/g, '&quot;') +
          '" data-prazo="' +
          prazo.replace(/"/g, '&quot;') +
          '">' +
          '<span class="shipping-calc-cart__opcoes-item-radio" aria-hidden="true"></span>' +
          '<span class="shipping-calc-cart__opcoes-item-text"><strong>' +
          nome +
          '</strong><span class="shipping-calc-cart__opcoes-item-prazo">' +
          prazo +
          '</span></span>' +
          '<span class="shipping-calc-cart__opcoes-item-price">R$ ' +
          price.toFixed(2).replace('.', ',') +
          '</span>' +
          '</label>'
        );
      })
      .join('');

    opcoesEl.setAttribute('role', 'radiogroup');
    opcoesEl.setAttribute('aria-label', 'Opções de frete');

    function updateSelected() {
      var selected = opcoesEl.querySelector('input[name="shipping-calc-cart-option"]:checked');
      if (!selected) return;
      opcoesEl.dataset.selectedPrice = selected.dataset.price || '';
      opcoesEl.dataset.selectedName = selected.dataset.name || '';
      opcoesEl.dataset.selectedPrazo = selected.dataset.prazo || '';
      updateCartFooterTotalWithShipping(selected.dataset.price || '');
    }

    opcoesEl.querySelectorAll('input[name="shipping-calc-cart-option"]').forEach(function (radio) {
      radio.addEventListener('change', updateSelected);
    });
  }

  document.addEventListener(
    'click',
    async function (event) {
      var btn =
        event.target.id === 'shipping-calc-cart-button'
          ? event.target
          : event.target.closest && event.target.closest('#shipping-calc-cart-button');
      if (!btn) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      var input = document.getElementById('shipping-calc-cart-cep');
      var opcoesEl = document.getElementById('shipping-calc-cart-opcoes');
      if (!input || !opcoesEl) return;

      var raw = input.getAttribute('data-cep-raw') || input.value.replace(/\D/g, '');
      if (raw.length < 8) {
        opcoesEl.innerHTML = '<p class="shipping-calc-cart__opcoes-empty">Digite um CEP válido (8 dígitos).</p>';
        opcoesEl.hidden = false;
        return;
      }

      opcoesEl.innerHTML = '<p class="shipping-calc-cart__opcoes-loading">Calculando frete...</p>';
      opcoesEl.hidden = false;
      btn.disabled = true;

      try {
        var cartShippingData = await buildLiveCartShippingData();
        if (!cartShippingData.items || !cartShippingData.items.length || !cartShippingData.shipmentInvoiceValueCents) {
          opcoesEl.innerHTML = '<p class="shipping-calc-cart__opcoes-empty">Adicione produtos ao carrinho para calcular o frete.</p>';
          return;
        }

        var shippingItemArray = cartShippingData.items.map(function (item) {
          return {
            Height: formatDimension(item.height, 21),
            Length: formatDimension(item.length, 7),
            Quantity: item.quantity || 1,
            Weight: formatWeight(item.weightGrams || 300),
            Width: formatDimension(item.width, 14),
            SKU: item.sku || '',
            Category: 'Produto',
          };
        });

        var params = {
          SellerCEP: '86065270',
          RecipientCEP: formatCep(raw),
          ShipmentInvoiceValue: cartShippingData.shipmentInvoiceValueCents / 100,
          ShippingItemArray: JSON.stringify(shippingItemArray),
          RecipientCountry: 'Brasil',
        };

        var response = await fetch(
          'https://calc-wig.vercel.app/shipping/quote?' + toQueryString(params) + '&token=' + SHIPPING_CALC_TOKEN
        );
        var data = await response.json();

        console.log('[FRETE DEBUG carrinho] Resposta completa da API:', JSON.stringify(data, null, 2));
        console.log('[FRETE DEBUG carrinho] ShippingSevicesArray:', data && data.ShippingSevicesArray);

        renderShippingOptions(opcoesEl, data && data.ShippingSevicesArray);
      } catch (error) {
        opcoesEl.innerHTML = '<p class="shipping-calc-cart__opcoes-empty">Não foi possível calcular o frete. Tente novamente.</p>';
      } finally {
        btn.disabled = false;
      }
    },
    true
  );
})();
