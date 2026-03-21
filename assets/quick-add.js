if (!customElements.get('quick-add-modal')) {
  customElements.define(
    'quick-add-modal',
    class QuickAddModal extends ModalDialog {
      constructor() {
        super();
        this.modalContent = this.querySelector('[id^="QuickAddInfo-"]');

        this.addEventListener('product-info:loaded', ({ target }) => {
          target.addPreProcessCallback(this.preprocessHTML.bind(this));
        });
      }

      hide(preventFocus = false) {
        const cartNotification = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
        if (cartNotification) cartNotification.setActiveElement(this.openedBy);
        this.modalContent.innerHTML = '';

        if (preventFocus) this.openedBy = null;
        super.hide();
      }

      show(opener) {
        opener.setAttribute('aria-disabled', true);
        opener.classList.add('loading');
        opener.querySelector('.loading__spinner').classList.remove('hidden');

        fetch(opener.getAttribute('data-product-url'))
          .then((response) => response.text())
          .then((responseText) => {
            const responseHTML = new DOMParser().parseFromString(responseText, 'text/html');
            const productElement = responseHTML.querySelector('product-info');

            this.preprocessHTML(productElement);
            HTMLUpdateUtility.setInnerHTML(this.modalContent, productElement.outerHTML);

            if (window.Shopify && Shopify.PaymentButton) {
              Shopify.PaymentButton.init();
            }
            if (window.ProductModel) window.ProductModel.loadShopifyXR();

            super.show(opener);
          })
          .finally(() => {
            opener.removeAttribute('aria-disabled');
            opener.classList.remove('loading');
            opener.querySelector('.loading__spinner').classList.add('hidden');
          });
      }

      preprocessHTML(productElement) {
        productElement.classList.forEach((classApplied) => {
          if (classApplied.startsWith('color-') || classApplied === 'gradient')
            this.modalContent.classList.add(classApplied);
        });
        this.preventDuplicatedIDs(productElement);
        this.removeDOMElements(productElement);
        this.removeGalleryListSemantic(productElement);
        this.updateImageSizes(productElement);
        this.preventVariantURLSwitching(productElement);
      }

      preventVariantURLSwitching(productElement) {
        productElement.setAttribute('data-update-url', 'false');
      }

      removeDOMElements(productElement) {
        const pickupAvailability = productElement.querySelector('pickup-availability');
        if (pickupAvailability) pickupAvailability.remove();

        const productModal = productElement.querySelector('product-modal');
        if (productModal) productModal.remove();

        const modalDialog = productElement.querySelectorAll('modal-dialog');
        if (modalDialog) modalDialog.forEach((modal) => modal.remove());
      }

      preventDuplicatedIDs(productElement) {
        const sectionId = productElement.dataset.section;

        const oldId = sectionId;
        const newId = `quickadd-${sectionId}`;
        productElement.innerHTML = productElement.innerHTML.replaceAll(oldId, newId);
        Array.from(productElement.attributes).forEach((attribute) => {
          if (attribute.value.includes(oldId)) {
            productElement.setAttribute(attribute.name, attribute.value.replace(oldId, newId));
          }
        });

        productElement.dataset.originalSection = sectionId;
      }

      removeGalleryListSemantic(productElement) {
        const galleryList = productElement.querySelector('[id^="Slider-Gallery"]');
        if (!galleryList) return;

        galleryList.setAttribute('role', 'presentation');
        galleryList.querySelectorAll('[id^="Slide-"]').forEach((li) => li.setAttribute('role', 'presentation'));
      }

      updateImageSizes(productElement) {
        const product = productElement.querySelector('.product');
        const desktopColumns = product?.classList.contains('product--columns');
        if (!desktopColumns) return;

        const mediaImages = product.querySelectorAll('.product__media img');
        if (!mediaImages.length) return;

        let mediaImageSizes =
          '(min-width: 1000px) 715px, (min-width: 750px) calc((100vw - 11.5rem) / 2), calc(100vw - 4rem)';

        if (product.classList.contains('product--medium')) {
          mediaImageSizes = mediaImageSizes.replace('715px', '605px');
        } else if (product.classList.contains('product--small')) {
          mediaImageSizes = mediaImageSizes.replace('715px', '495px');
        }

        mediaImages.forEach((img) => img.setAttribute('sizes', mediaImageSizes));
      }
    }
  );
}


if (!customElements.get('video-modal-player')) {
  customElements.define(
    'video-modal-player',
    class VideoModalPlayer extends HTMLElement {
      constructor() {
        super();
        this.modalLeft = this.querySelector('.video-modal__left');
        this.modalRight = this.querySelector('.video-modal__right');
        this.overlay = this.querySelector('.video-modal__overlay');
        this.closeBtn = this.querySelector('.video-modal__close');

        // Propriedades para guardar o estado original
        this.originalVideoElement = null;
        this.originalVideoParent = null;
        this.originalMutedState = true; // Valor padrão seguro
        this.openedBy = null; // Para gerenciar o foco

        this.bindEvents();
      }

      bindEvents() {
        this.overlay?.addEventListener('click', () => this.hide());
        this.closeBtn?.addEventListener('click', () => this.hide());
        document.addEventListener('keydown', (e) => {
          // Só fecha com ESC se o modal estiver aberto
          if (e.key === 'Escape' && this.isOpen()) {
            this.hide();
          }
        });
      }

      isOpen() {
        return this.classList.contains('video-modal--open');
      }

      async show({ videoEl, productUrl, opener }) {
        // Guarda o elemento que abriu o modal para devolver o foco depois
        this.openedBy = opener;

        // 1. Guarda a referência do vídeo original, seu container e seu estado de áudio
        this.originalVideoElement = videoEl;
        this.originalVideoParent = videoEl.parentElement;
        this.originalMutedState = videoEl.muted; // <-- NOVO: Guarda o estado 'muted'

        // 2. Exibe o modal ANTES de carregar o conteúdo para dar feedback visual imediato
        this.classList.add('video-modal--open');
        document.documentElement.style.overflow = 'hidden';

        // 3. Move o elemento de vídeo original para dentro do modal
        this.modalLeft.appendChild(videoEl);

        // 4. Modifica o vídeo para a exibição no modal
        videoEl.setAttribute('controls', '');
        videoEl.muted = false; // Tira o mudo para tocar com som no modal
        videoEl.play().catch(err => console.error("Erro ao tentar tocar o vídeo:", err));

        // Move o foco para dentro do modal para acessibilidade
        this.closeBtn?.focus();

        // Limpa conteúdo do produto anterior
        this.modalRight.innerHTML = '<div class="loading-overlay__spinner" style="display:block; margin: 40px auto;"></div>'; // Opcional: Adiciona um spinner

        // 5. Busca e exibe as informações do produto
        if (productUrl) {
          try {
            const response = await fetch(productUrl);
            const htmlText = await response.text();

            // <-- NOVO: Prevenção de Race Condition
            // Se o modal foi fechado enquanto o fetch ocorria, não faz mais nada.
            if (!this.isOpen()) return;

            const doc = new DOMParser().parseFromString(htmlText, 'text/html');
            const productInfo = doc.querySelector('product-info');

            if (productInfo) {
              // Remove a galeria de mídia para não duplicar
              const mediaWrapper = productInfo.querySelector('.grid__item.product__media-wrapper');
              if (mediaWrapper) mediaWrapper.remove();
              
              this.modalRight.innerHTML = productInfo.outerHTML;

              // Re-inicializa scripts de Shopify se necessário
              if (window.Shopify && Shopify.PaymentButton) {
                Shopify.PaymentButton.init();
              }
              if (window.ProductModel) window.ProductModel.loadShopifyXR();
            } else {
              this.modalRight.innerHTML = ''; // Limpa o spinner se não achar o produto
            }
          } catch (err) {
            console.error('Erro ao carregar HTML do produto no modal de vídeo:', err);
            this.modalRight.innerHTML = '<p>Erro ao carregar informações do produto.</p>'; // Feedback de erro
          }
        } else {
           this.modalRight.innerHTML = ''; // Limpa o spinner se não houver URL de produto
        }
      }

      hide() {
        // Se não estiver aberto ou não tiver um vídeo, não faz nada.
        if (!this.isOpen() || !this.originalVideoElement || !this.originalVideoParent) {
            return;
        }

        // --- INÍCIO DA LÓGICA DE LIMPEZA ---

        // 1. Esconde o modal da tela
        this.classList.remove('video-modal--open');
        document.documentElement.style.overflow = '';

        const videoEl = this.originalVideoElement;

        // 2. Pausa o vídeo e restaura seu estado 100% original
        videoEl.pause();
        videoEl.removeAttribute('controls');
        videoEl.currentTime = 0; // Rebobina o vídeo
        videoEl.muted = this.originalMutedState; // <-- NOVO: Restaura o estado 'muted'

        // 3. Devolve o elemento de vídeo para seu lugar de origem no DOM
        this.originalVideoParent.appendChild(videoEl);

        // 4. Limpa completamente o conteúdo interno do modal
        this.modalLeft.innerHTML = '';
        this.modalRight.innerHTML = '';

        // 5. Devolve o foco para o elemento que abriu o modal (importante para acessibilidade)
        this.openedBy?.focus();

        // 6. Limpa as referências internas para preparar para a próxima abertura
        this.originalVideoElement = null;
        this.originalVideoParent = null;
        this.openedBy = null;
      }
    }
  );
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.play-button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slide = btn.closest('.swiper-slide');
      const videoEl = slide?.querySelector('video');
      const productUrl = slide.dataset.productUrl || '';
      
      // Checagem de segurança
      if (!videoEl) return;

      const modal = document.querySelector('video-modal-player');
      if (modal) {
        // Passe o botão (btn) como o 'opener'
        modal.show({ videoEl, productUrl, opener: btn }); 
      }
    });
  });
});