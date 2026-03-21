(() => {
  class CollectionInfiniteScroll {
    constructor(container) {
      this.container = container;
      this.sectionId = container.dataset.sectionId || '';
      this.grid = null;
      this.trigger = null;
      this.pagination = null;
      this.isLoading = false;
      this.abortController = null;
      this.paginationHiddenByJs = false;

      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) this.loadNextPage();
          });
        },
        { rootMargin: '300px 0px' }
      );

      this.mutationObserver = new MutationObserver(() => this.syncState());
      this.mutationObserver.observe(this.container, { childList: true });

      this.syncState();
    }

    disconnectTrigger() {
      this.observer.disconnect();
    }

    getSpinner() {
      return this.trigger?.querySelector('.loading__spinner');
    }

    abortPendingRequest() {
      if (!this.abortController) return;

      this.abortController.abort();
      this.abortController = null;
      this.isLoading = false;
      this.getSpinner()?.classList.add('hidden');
    }

    syncState() {
      const nextGrid = this.container.querySelector('#product-grid');
      const nextTrigger = this.container.querySelector('[data-infinite-scroll-area]');
      const nextPagination = this.container.querySelector('[data-pagination-fallback]');
      const gridChanged = this.grid && nextGrid && this.grid !== nextGrid;

      if (gridChanged) this.abortPendingRequest();

      this.grid = nextGrid;
      this.trigger = nextTrigger;
      this.pagination = nextPagination;

      this.disconnectTrigger();

      if (!this.grid || !this.trigger) return;

      this.sectionId = this.grid.dataset.id || this.sectionId;
      this.getSpinner()?.classList.add('hidden');

      const hasNextUrl = Boolean(this.trigger.dataset.nextUrl);
      this.trigger.hidden = !hasNextUrl;

      if (hasNextUrl && this.pagination) {
        this.pagination.hidden = true;
        this.paginationHiddenByJs = true;
      }

      if (hasNextUrl) this.observer.observe(this.trigger);
    }

    buildSectionUrl(url) {
      const nextPageUrl = new URL(url, window.location.origin);
      nextPageUrl.searchParams.set('section_id', this.sectionId);
      return nextPageUrl.toString();
    }

    appendItems(items) {
      const fragment = document.createDocumentFragment();

      items.forEach((item) => {
        if (item.classList.contains('scroll-trigger')) {
          item.classList.add('scroll-trigger--cancel');
        }

        item.querySelectorAll('.scroll-trigger').forEach((element) => {
          element.classList.add('scroll-trigger--cancel');
        });

        fragment.appendChild(item);
      });

      this.grid.appendChild(fragment);
    }

    async loadNextPage() {
      if (this.isLoading || !this.grid || !this.trigger) return;

      const nextUrl = this.trigger.dataset.nextUrl;
      if (!nextUrl) return;

      const currentGrid = this.grid;
      const currentTrigger = this.trigger;
      const requestController = new AbortController();

      this.isLoading = true;
      this.getSpinner()?.classList.remove('hidden');
      this.abortController = requestController;

      try {
        const response = await fetch(this.buildSectionUrl(nextUrl), {
          signal: requestController.signal,
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });

        if (!response.ok) {
          throw new Error(`Failed to load collection page: ${response.status}`);
        }

        const html = await response.text();

        if (this.grid !== currentGrid || this.trigger !== currentTrigger) return;

        const parsedDocument = new DOMParser().parseFromString(html, 'text/html');
        const nextGrid = parsedDocument.querySelector('#product-grid');
        const nextTrigger = parsedDocument.querySelector('[data-infinite-scroll-area]');

        if (!nextGrid) {
          throw new Error('Collection grid not found in next page response.');
        }

        this.appendItems(Array.from(nextGrid.children));
        this.trigger.dataset.nextUrl = nextTrigger?.dataset.nextUrl || '';
        this.syncState();
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Infinite collection scroll failed', error);
          this.disconnectTrigger();
          if (this.paginationHiddenByJs && this.pagination) {
            this.pagination.hidden = false;
            this.paginationHiddenByJs = false;
          }
        }
      } finally {
        if (this.abortController === requestController) {
          this.abortController = null;
          this.isLoading = false;
          this.getSpinner()?.classList.add('hidden');
        }
      }
    }
  }

  const initCollectionInfiniteScroll = () => {
    document.querySelectorAll('#ProductGridContainer[data-infinite-scroll="true"]').forEach((container) => {
      if (!container.collectionInfiniteScroll) {
        container.collectionInfiniteScroll = new CollectionInfiniteScroll(container);
        return;
      }

      container.collectionInfiniteScroll.syncState();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCollectionInfiniteScroll);
  } else {
    initCollectionInfiniteScroll();
  }

  document.addEventListener('shopify:section:load', initCollectionInfiniteScroll);
})();
