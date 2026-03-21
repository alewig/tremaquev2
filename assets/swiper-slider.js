// assets/swiper-slider.js

class SwiperSliderComponent extends HTMLElement {
  constructor() {
    super();
    // Verifica se o elemento deve ser um slider.
    // A lógica no Liquid adiciona a classe .slider condicionalmente.
    if (!this.classList.contains('slider')) {
      return; // Se não for um slider, não faz nada. Ele se comportará como um grid normal.
    }

    this.swiperContainer = this.querySelector('.swiper');
    if (!this.swiperContainer) return;

    this.initSwiper();
  }

  initSwiper() {
    // Encontra os elementos de navegação dentro deste componente específico.
    const prevButton = this.querySelector('.slider-button--prev');
    const nextButton = this.querySelector('.slider-button--next');
    // O elemento de paginação não é mais necessário aqui, mas a busca não causa erro.
    const paginationEl = this.querySelector('.slider-counter');

    const swiperOptions = {
      // Usa as classes padrão do Swiper que adicionaremos no Liquid
      wrapperClass: 'swiper-wrapper',
      slideClass: 'swiper-slide',

      // Define que a quantidade de slides visíveis será determinada pelo CSS.
      // Isso permite que o grid (`grid--4-col-desktop`) defina a largura dos slides.
      slidesPerView: 1.5,
      
      // Espaçamento entre os slides. Ajuste conforme necessário.
      spaceBetween: 15,

      // Navegação (Setas) - JÁ ESTAVA CORRETA E FOI MANTIDA
      navigation: {
        nextEl: nextButton,
        prevEl: prevButton,
      },
      // Torna o slider acessível
      a11y: {
        enabled: true,
        prevSlideMessage: 'Slide anterior',
        nextSlideMessage: 'Próximo slide',
      },

      // Breakpoints para diferentes comportamentos em tela
      breakpoints: {
        // Para telas maiores que 750px (mobile-first)
        750: {
          spaceBetween: 30, // Maior espaçamento no desktop
        }
      }
    };

    // Inicializa o Swiper
    this.swiper = new Swiper(this.swiperContainer, swiperOptions);
  }

  // Limpa a instância do Swiper quando o elemento é removido do DOM
  disconnectedCallback() {
    if (this.swiper) {
      this.swiper.destroy(true, true);
    }
  }
}

// Define o custom element
customElements.define('swiper-slider-component', SwiperSliderComponent);