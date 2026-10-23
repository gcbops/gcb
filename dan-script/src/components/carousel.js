const CustomCarousel = (() => {
  const instances = new Map();

  function init(element) {
    const carousel =
      typeof element === "string" ? document.querySelector(element) : element;

    if (!carousel) {
      console.warn("[CustomCarousel] Carousel not found.");

      return null;
    }

    if (instances.has(carousel)) {
      return instances.get(carousel);
    }

    const items = Array.from(carousel.querySelectorAll(".carousel-item"));

    if (items.length < 2) {
      console.warn(
        "[CustomCarousel] At least 2 .carousel-item elements are required.",
      );

      return null;
    }

    const effect = carousel.dataset.effect || "fade";

    const defaultInterval = Number(carousel.dataset.interval || 4000);

    const pauseOnHover = carousel.dataset.pauseOnHover !== "false";

    let currentIndex = 0;
    let timerId = null;
    let isPaused = false;

    function getInterval(item) {
      return Number(item.dataset.interval || defaultInterval);
    }

    function show(index) {
      const previousIndex = currentIndex;

      if (index === previousIndex) {
        return;
      }

      const currentItem = items[previousIndex];
      const nextItem = items[index];

      carousel.classList.add("is-animating");
      carousel.dataset.direction = index > previousIndex ? "next" : "prev";

      items.forEach((item, itemIndex) => {
        item.classList.remove("active", "leaving");
      });

      currentItem.classList.add("leaving");
      nextItem.classList.add("active");

      currentIndex = index;

      setTimeout(() => {
        currentItem.classList.remove("leaving");
        carousel.classList.remove("is-animating");
      }, getTransitionDuration(carousel));
    }

    function getTransitionDuration(carousel) {
      const duration = getComputedStyle(carousel)
        .getPropertyValue("--carousel-duration")
        .trim();

      if (duration.endsWith("ms")) {
        return parseFloat(duration);
      }

      if (duration.endsWith("s")) {
        return parseFloat(duration) * 1000;
      }

      return 600;
    }

    function next() {
      const nextIndex = (currentIndex + 1) % items.length;

      show(nextIndex);
    }

    function prev() {
      const prevIndex = (currentIndex - 1 + items.length) % items.length;

      show(prevIndex);
    }

    function scheduleNext() {
      timerId = setTimeout(() => {
        next();
        scheduleNext();
      }, getInterval(items[currentIndex]));
    }

    function start() {
      stop();
      scheduleNext();
    }

    function stop() {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    }

    function pause() {
      if (isPaused) {
        return;
      }

      isPaused = true;
      stop();
    }

    function resume() {
      if (!isPaused) {
        return;
      }

      isPaused = false;
      start();
    }

    if (pauseOnHover) {
      carousel.addEventListener("mouseenter", pause);

      carousel.addEventListener("mouseleave", resume);
    }

    const instance = {
      start,
      stop,
      pause,
      resume,
      next,
      prev,
      show,
      destroy() {
        stop();
        instances.delete(carousel);
      },
    };

    instances.set(carousel, instance);

    carousel.dataset.effect = effect;

    items.forEach((item, index) => {
      item.classList.toggle("active", index === currentIndex);
    });

    start();

    return instance;
  }

  function destroyAll() {
    instances.forEach((instance) => {
      instance.destroy();
    });
  }

  return {
    init,
    destroyAll,
  };
})();

export default CustomCarousel;
