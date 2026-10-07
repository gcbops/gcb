const checkmarkIdPrefix = "loadingCheckSVG-";
const checkmarkCircleIdPrefix = "loadingCheckCircleSVG-";
const verticalSpacing = 50;

const LoaderModule = (() => {
  const phraseSets = {
    loading: [
      "Getting things ready",
      "Connecting securely",
      "Loading workspace",
      "Retrieving data",
      "Preparing dashboard",
      "Syncing records",
      "Checking settings",
      "Organizing data",
      "Preparing reports",
      "Building summaries",
      "Updating interface",
      "Applying preferences",
      "Almost ready",
      "Finishing up",
    ],

    logout: [
      "Preparing to sign out",
      "Saving your session",
      "Securing your workspace",
      "Clearing temporary data",
      "Ending your session",
      "Disconnecting securely",
      "Cleaning up workspace",
      "Signing you out",
      "Almost done",
      "Goodbye",
    ],
  };

  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));

      [array[i], array[j]] = [array[j], array[i]];
    }

    return array;
  }

  function createSVG(tag, properties, children = []) {
    const newElement = document.createElementNS(
      "http://www.w3.org/2000/svg",
      tag,
    );

    Object.entries(properties).forEach(([prop, value]) => {
      newElement.setAttribute(prop, value);
    });

    children.forEach((child) => {
      newElement.appendChild(child);
    });

    return newElement;
  }

  function createPhraseSvg(phrase, yOffset) {
    const text = createSVG("text", {
      fill: "white",
      x: 50,
      y: yOffset,
      "font-size": 18,
      "font-family": "Arial",
    });

    text.appendChild(document.createTextNode(`${phrase}...`));

    return text;
  }

  function createCheckSvg(yOffset, index) {
    const check = createSVG("polygon", {
      points:
        "21.661,7.643 13.396,19.328 9.429,15.361 7.075,17.714 13.745,24.384 24.345,9.708",
      fill: "rgba(255,255,255,1)",
      id: checkmarkIdPrefix + index,
    });

    const circleOutline = createSVG("path", {
      d: "M16,0C7.163,0,0,7.163,0,16s7.163,16,16,16s16-7.163,16-16S24.837,0,16,0z M16,30C8.28,30,2,23.72,2,16C2,8.28,8.28,2,16,2 c7.72,0,14,6.28,14,14C30,23.72,23.72,30,16,30z",
      fill: "white",
    });

    const circle = createSVG("circle", {
      id: checkmarkCircleIdPrefix + index,
      fill: "rgba(255,255,255,0)",
      cx: 16,
      cy: 16,
      r: 15,
    });

    return createSVG(
      "g",
      {
        transform: `translate(10 ${yOffset - 20}) scale(.9)`,
      },
      [circle, check, circleOutline],
    );
  }

  function addPhrasesToDocument(phrases, phrasesContainer) {
    if (!phrasesContainer) {
      console.warn("[Loader] #phrases was not found.");
      return null;
    }

    phrasesContainer.innerHTML = "";

    phrases.forEach((phrase, index) => {
      const yOffset = 30 + verticalSpacing * index;

      phrasesContainer.appendChild(createPhraseSvg(phrase, yOffset));

      phrasesContainer.appendChild(createCheckSvg(yOffset, index));
    });

    return phrasesContainer;
  }

  function easeInOut(t) {
    const period = 200;

    return (Math.sin(t / period + 100) + 1) / 2;
  }

  function waitForElement(selector, callback) {
    const element = document.querySelector(selector);

    if (element) {
      callback(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const foundElement = document.querySelector(selector);

      if (foundElement) {
        observer.disconnect();
        callback(foundElement);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function start(type = "loading") {
    const phrases = shuffleArray([...(phraseSets[type] || phraseSets.loading)]);

    waitForElement("#phrases", (phrasesContainer) => {
      const container = addPhrasesToDocument(phrases, phrasesContainer);

      if (!container) {
        return;
      }

      const startTime = Date.now();

      container.currentY = 0;

      const checks = phrases.map((_, index) => ({
        check: document.getElementById(checkmarkIdPrefix + index),
        circle: document.getElementById(checkmarkCircleIdPrefix + index),
      }));

      function animateLoading() {
        const now = Date.now();

        container.setAttribute(
          "transform",
          `translate(0 ${container.currentY})`,
        );

        container.currentY -= 1.35 * easeInOut(now);

        checks.forEach((check, index) => {
          if (!check?.check || !check?.circle) {
            return;
          }

          const colorChangeBoundary =
            -index * verticalSpacing + verticalSpacing + 15;

          if (container.currentY < colorChangeBoundary) {
            const alpha = Math.max(
              Math.min(
                1 - (container.currentY - colorChangeBoundary + 15) / 30,
                1,
              ),
              0,
            );

            check.circle.setAttribute("fill", `rgba(255, 255, 255, ${alpha})`);

            const checkColor = [
              Math.round(255 * (1 - alpha) + 120 * alpha),
              Math.round(255 * (1 - alpha) + 154 * alpha),
            ];

            check.check.setAttribute(
              "fill",
              `rgba(255, ${checkColor[0]}, ${checkColor[1]}, 1)`,
            );
          }
        });

        if (now - startTime < 30000 && container.currentY > -710) {
          requestAnimationFrame(animateLoading);
        }
      }

      animateLoading();
    });
  }

  function show(type = "loading") {
    document.body.classList.remove("loaded");

    start(type);
  }

  function hide() {
    document.body.classList.add("loaded");
  }

  return {
    start,
    show,
    hide,
  };
})();

export { LoaderModule };
