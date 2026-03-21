if (!customElements.get('product-form')) {
  customElements.define(
    'product-form',
    class ProductForm extends HTMLElement {
      constructor() {
        super();

        this.form = this.querySelector('form');
        this.variantIdInput.disabled = false;
        this.form.addEventListener('submit', this.onSubmitHandler.bind(this));
        this.cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
        this.submitButton = this.querySelector('[type="submit"]');
        this.submitButtonText = this.submitButton.querySelector('span');

        if (document.querySelector('cart-drawer')) this.submitButton.setAttribute('aria-haspopup', 'dialog');

        this.hideErrors = this.dataset.hideErrors === 'true';
      }

      onSubmitHandler(evt) {
        evt.preventDefault();
        const clickedButton = evt.submitter || this.submitButton;
        if (clickedButton.getAttribute('aria-disabled') === 'true') return;

        this.handleErrorMessage();
        this.lastSubmitter = clickedButton;

        const isDirectCheckout = this.dataset.directCheckout === 'true' && !clickedButton.dataset.addToCartOnly;

        clickedButton.setAttribute('aria-disabled', true);
        clickedButton.classList.add('loading');
        const spinner = clickedButton.querySelector('.loading__spinner');
        if (spinner) spinner.classList.remove('hidden');

        // Direct checkout: add to cart via fetch, then redirect to /checkout
        if (isDirectCheckout) {
          const checkoutConfig = fetchConfig('javascript');
          checkoutConfig.headers['X-Requested-With'] = 'XMLHttpRequest';
          delete checkoutConfig.headers['Content-Type'];
          checkoutConfig.body = new FormData(this.form);

          fetch(`${routes.cart_add_url}`, checkoutConfig)
            .then((res) => res.json())
            .then((res) => {
              if (res.status) {
                this.handleErrorMessage(res.description);
                clickedButton.classList.remove('loading');
                clickedButton.removeAttribute('aria-disabled');
                const sp = clickedButton.querySelector('.loading__spinner');
                if (sp) sp.classList.add('hidden');
                return;
              }
              window.location.href = '/checkout';
            })
            .catch(() => {
              window.location.href = '/checkout';
            });
          return;
        }

        const config = fetchConfig('javascript');
        config.headers['X-Requested-With'] = 'XMLHttpRequest';
        delete config.headers['Content-Type'];

        const formData = new FormData(this.form);
        if (this.cart) {
          formData.append(
            'sections',
            this.cart.getSectionsToRender().map((section) => section.id)
          );
          formData.append('sections_url', window.location.pathname);
          this.cart.setActiveElement(document.activeElement);
        }
        config.body = formData;

        fetch(`${routes.cart_add_url}`, config)
          .then((response) => response.json())
          .then((response) => {
            if (response.status) {
              publish(PUB_SUB_EVENTS.cartError, {
                source: 'product-form',
                productVariantId: formData.get('id'),
                errors: response.errors || response.description,
                message: response.message,
              });
              this.handleErrorMessage(response.description);

              const activeBtn = this.lastSubmitter || this.submitButton;
              const soldOutMessage = activeBtn?.querySelector('.sold-out-message');
              if (!soldOutMessage) return;
              activeBtn.setAttribute('aria-disabled', true);
              activeBtn.querySelector('span')?.classList.add('hidden');
              soldOutMessage.classList.remove('hidden');
              this.error = true;
              return;
            }

            if (!this.cart) {
              window.location = window.routes.cart_url;
              return;
            }

            const startMarker = CartPerformance.createStartingMarker('add:wait-for-subscribers');
            if (!this.error)
              publish(PUB_SUB_EVENTS.cartUpdate, {
                source: 'product-form',
                productVariantId: formData.get('id'),
                cartData: response,
              }).then(() => {
                CartPerformance.measureFromMarker('add:wait-for-subscribers', startMarker);
              });
            this.error = false;
            const quickAddModal = this.closest('quick-add-modal');
            if (quickAddModal) {
              document.body.addEventListener(
                'modalClosed',
                () => {
                  setTimeout(() => {
                    CartPerformance.measure("add:paint-updated-sections", () => {
                      this.cart.renderContents(response);
                    });
                  });
                },
                { once: true }
              );
              quickAddModal.hide(true);
            } else {
              CartPerformance.measure("add:paint-updated-sections", () => {
                this.cart.renderContents(response);
              });
            }
          })
          .catch((e) => {
            console.error(e);
          })
          .finally(() => {
            const btn = this.lastSubmitter || this.submitButton;
            if (btn) {
              btn.classList.remove('loading');
              if (!this.error) btn.removeAttribute('aria-disabled');
              const sp = btn.querySelector('.loading__spinner');
              if (sp) sp.classList.add('hidden');
            }
            if (this.cart && this.cart.classList.contains('is-empty')) this.cart.classList.remove('is-empty');

            CartPerformance.measureFromEvent("add:user-action", evt);
          });
      }

      handleErrorMessage(errorMessage = false) {
        if (this.hideErrors) return;

        this.errorMessageWrapper =
          this.errorMessageWrapper || this.querySelector('.product-form__error-message-wrapper');
        if (!this.errorMessageWrapper) return;
        this.errorMessage = this.errorMessage || this.errorMessageWrapper.querySelector('.product-form__error-message');

        this.errorMessageWrapper.toggleAttribute('hidden', !errorMessage);

        if (errorMessage) {
          this.errorMessage.textContent = errorMessage;
        }
      }

      toggleSubmitButton(disable = true, text) {
        if (disable) {
          this.submitButton.setAttribute('disabled', 'disabled');
          if (text) this.submitButtonText.textContent = text;
        } else {
          this.submitButton.removeAttribute('disabled');
          // Preserve the correct button text based on button mode
          if (this.submitButton.classList.contains('product-form__submit--checkout')) {
            this.submitButtonText.textContent = window.variantStrings.checkout || 'COMPRAR AGORA';
          } else {
            this.submitButtonText.textContent = window.variantStrings.addToCart;
          }
        }
      }

      get variantIdInput() {
        return this.form.querySelector('[name=id]');
      }
    }
  );
}
