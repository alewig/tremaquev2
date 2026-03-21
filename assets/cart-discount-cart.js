/**
 * Cart discount component para a página do carrinho (main-cart-footer).
 * Aplica/remove cupons via POST /cart/update e atualiza main-cart-footer, main-cart-items e cart-icon-bubble.
 */
if (!customElements.get('cart-discount-cart')) {
  customElements.define(
    'cart-discount-cart',
    class CartDiscountCart extends HTMLElement {
      constructor() {
        super();
        this.sectionId = this.dataset.sectionId;
        this.activeFetch = null;
      }

      connectedCallback() {
        this.form = this.querySelector('.cart-discount__form');
        this.input = this.querySelector('#cart-discount');
        this.errorContainer = this.querySelector('.cart-discount__error');
        this.errorDiscountCode = this.querySelector('[ref="cartDiscountErrorDiscountCode"]');
        this.errorShipping = this.querySelector('[ref="cartDiscountErrorShipping"]');
        this.codesList = this.querySelector('.cart-discount__codes');

        if (this.form) {
          this.form.addEventListener('submit', this.handleSubmit.bind(this));
        }

        this.querySelectorAll('.cart-discount__pill-remove').forEach((button) => {
          button.addEventListener('click', this.handleRemoveDiscount.bind(this));
        });
      }

      getSectionsToRender() {
        const footer = document.getElementById('main-cart-footer');
        const items = document.getElementById('main-cart-items');
        const list = [];
        if (footer && footer.dataset.id) {
          list.push({ id: 'main-cart-footer', section: footer.dataset.id, selector: '.js-contents' });
        }
        if (items && items.dataset.id) {
          list.push({ id: 'main-cart-items', section: items.dataset.id, selector: '.js-contents' });
        }
        list.push({ id: 'cart-icon-bubble', section: 'cart-icon-bubble', selector: '.shopify-section' });
        return list;
      }

      getSectionInnerHTML(html, selector) {
        try {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const el = doc.querySelector(selector);
          return el ? el.innerHTML : html;
        } catch (e) {
          return html;
        }
      }

      handleSubmit(event) {
        event.preventDefault();
        event.stopPropagation();

        const discountCode = (this.input && this.input.value) ? this.input.value.trim() : '';
        if (!discountCode) {
          this.showError('Código de desconto inválido', 'discount');
          return;
        }

        if (!this.sectionId) {
          this.showError('Erro interno', 'discount');
          return;
        }

        const existingDiscounts = this.getExistingDiscounts();
        if (existingDiscounts.includes(discountCode)) {
          return;
        }

        this.applyDiscount(discountCode, existingDiscounts);
      }

      applyDiscount(code, existingDiscounts = []) {
        if (this.activeFetch) {
          this.activeFetch.abort();
        }

        const submitButton = this.form ? this.form.querySelector('button[type="submit"]') : null;
        const originalText = submitButton ? submitButton.textContent : '';
        if (submitButton) {
          submitButton.disabled = true;
          submitButton.textContent = 'Aplicando...';
        }
        this.hideError();

        const abortController = new AbortController();
        this.activeFetch = abortController;

        const discountCodes = [...existingDiscounts, code].join(',');
        const sectionsToRender = this.getSectionsToRender();
        const sectionsToUpdate = sectionsToRender.map((s) => s.section).filter(Boolean);

        if (!window.routes || !window.routes.cart_update_url) {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = originalText;
          }
          this.showError('Erro de configuração', 'discount');
          this.activeFetch = null;
          return;
        }

        const updateUrl = (window.routes.cart_update_url || '').replace(/\/update\/?$/, '/update.js');

        const config = typeof fetchConfig === 'function' ? fetchConfig('json') : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
        };
        config.body = JSON.stringify({
          discount: discountCodes,
          sections: sectionsToUpdate,
          sections_url: window.location.pathname
        });
        config.signal = abortController.signal;

        fetch(updateUrl, config)
          .then((response) => {
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
          })
          .then((data) => {
            const discountInfo = (data.discount_codes || []).find(
              (d) => d.code === code && d.applicable === false
            );

            if (discountInfo) {
              if (this.input) this.input.value = '';
              this.showError('Código de desconto inválido', 'discount');
              return;
            }

            if (data.sections && Object.keys(data.sections).length > 0) {
              this.updateCartPage(data);
            } else {
              this.fetchSectionsAndUpdate(data);
            }

            if (this.input) this.input.value = '';
            this.hideError();

            if (window.PUB_SUB_EVENTS && typeof window.publish === 'function') {
              window.publish(window.PUB_SUB_EVENTS.cartUpdate, {
                source: 'cart-discount',
                cartData: data
              });
            }
          })
          .catch((error) => {
            if (error.name === 'AbortError') return;
            this.showError('Código de desconto inválido', 'discount');
          })
          .finally(() => {
            if (submitButton) {
              submitButton.disabled = false;
              submitButton.textContent = originalText;
            }
            this.activeFetch = null;
          });
      }

      handleRemoveDiscount(event) {
        event.preventDefault();
        event.stopPropagation();

        const pill = event.currentTarget.closest('.cart-discount__pill');
        if (!(pill instanceof HTMLElement) || !this.sectionId) return;

        const discountCode = pill.dataset.discountCode;
        if (!discountCode) return;

        const existingDiscounts = this.getExistingDiscounts();
        const index = existingDiscounts.indexOf(discountCode);
        if (index === -1) return;

        existingDiscounts.splice(index, 1);

        if (this.activeFetch) {
          this.activeFetch.abort();
        }

        const abortController = new AbortController();
        this.activeFetch = abortController;

        const sectionsToRender = this.getSectionsToRender();
        const sectionsToUpdate = sectionsToRender.map((s) => s.section).filter(Boolean);

        const config = typeof fetchConfig === 'function' ? fetchConfig('json') : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
        };
        const updateUrl = (window.routes.cart_update_url || '').replace(/\/update\/?$/, '/update.js');
        config.body = JSON.stringify({
          discount: existingDiscounts.join(','),
          sections: sectionsToUpdate,
          sections_url: window.location.pathname
        });
        config.signal = abortController.signal;

        fetch(updateUrl, config)
          .then((response) => response.json())
          .then((data) => {
            if (data.sections && Object.keys(data.sections).length > 0) {
              this.updateCartPage(data);
            } else {
              this.fetchSectionsAndUpdate(data);
            }
            if (window.PUB_SUB_EVENTS && typeof window.publish === 'function') {
              window.publish(window.PUB_SUB_EVENTS.cartUpdate, {
                source: 'cart-discount',
                cartData: data
              });
            }
          })
          .catch(() => {})
          .finally(() => {
            this.activeFetch = null;
          });
      }

      fetchSectionsAndUpdate(cartData) {
        const sectionsToRender = this.getSectionsToRender();
        const sectionIds = sectionsToRender.map((s) => s.section).filter(Boolean);
        if (sectionIds.length === 0) return;
        const url = `${window.location.pathname}?sections=${sectionIds.join(',')}`;
        fetch(url, { headers: { Accept: 'application/json' } })
          .then((res) => res.json())
          .then((data) => {
            const sections = data.sections || data;
            if (sections && Object.keys(sections).length > 0) {
              this.updateCartPage({ sections: sections, item_count: cartData?.item_count, total_price: cartData?.total_price });
            }
          })
          .catch(() => {});
      }

      updateCartPage(data) {
        const sections = data.sections || {};
        this.getSectionsToRender().forEach((s) => {
          const html = sections[s.section];
          if (!html) return;
          const target = document.getElementById(s.id);
          if (!target) return;
          const inner = this.getSectionInnerHTML(html, s.selector);
          const elToReplace = target.querySelector(s.selector) || target;
          if (elToReplace && inner !== undefined) {
            elToReplace.innerHTML = inner;
          }
        });

        setTimeout(() => {
          const newComponent = document.querySelector('cart-discount-cart');
          if (newComponent && newComponent !== this && newComponent.connectedCallback) {
            newComponent.connectedCallback();
          }
        }, 100);
      }

      getExistingDiscounts() {
        const discountCodes = [];
        const discountPills = this.querySelectorAll('.cart-discount__pill');
        for (const pill of discountPills) {
          const code = pill.dataset && pill.dataset.discountCode;
          if (typeof code === 'string') {
            discountCodes.push(code);
          }
        }
        return discountCodes;
      }

      showError(message, type = 'discount') {
        if (!this.errorContainer) return;
        this.errorContainer.classList.remove('hidden');
        if (type === 'discount' && this.errorDiscountCode) {
          this.errorDiscountCode.textContent = message;
          this.errorDiscountCode.classList.remove('hidden');
        } else if (type === 'shipping' && this.errorShipping) {
          this.errorShipping.classList.remove('hidden');
        }
      }

      hideError() {
        if (this.errorContainer) this.errorContainer.classList.add('hidden');
        if (this.errorDiscountCode) this.errorDiscountCode.classList.add('hidden');
        if (this.errorShipping) this.errorShipping.classList.add('hidden');
      }
    }
  );
}
