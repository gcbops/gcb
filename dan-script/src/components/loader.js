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
      "Initializing app",
      "Loading modules",
      "Preparing components",
      "Checking services",
      "Fetching records",
      "Processing data",
      "Refreshing cache",
      "Preparing clients",
      "Loading metrics",
      "Updating activity",
      "Preparing hours",
      "Gathering summaries",
      "Syncing dashboard",
      "Checking settings",
      "Preparing pages",
      "Organizing data",
      "Loading activity",
      "Refreshing metrics",
      "Preparing analytics",
      "Updating metrics",
      "Finalizing setup",
      "Making things ready",
      "Loading preferences",
      "Preparing activity",
    ],

    login: [
      "Signing you in",
      "Verifying account",
      "Checking access",
      "Validating session",
      "Loading permissions",
      "Preparing workspace",
      "Retrieving settings",
      "Loading dashboard",
      "Almost ready",
      "Checking Google account",
      "Confirming identity",
      "Verifying sign-in",
      "Securing session",
      "Checking account status",
      "Validating access",
      "Loading capabilities",
      "Preparing profile",
      "Retrieving settings",
      "Applying permissions",
      "Checking pages",
      "Preparing navigation",
      "Initializing session",
      "Securing connection",
      "Loading preferences",
      "Preparing modules",
      "Confirming access",
      "Finalizing verification",
      "Completing sign-in",
      "Preparing workspace",
      "Finishing login",
      "Loading pages",
      "Preparing dashboard",
    ],

    logout: [
      "Preparing to sign out",
      "Saving session",
      "Checking connections",
      "Securing workspace",
      "Preparing logout",
      "Clearing temp data",
      "Removing session data",
      "Releasing resources",
      "Closing tasks",
      "Stopping processes",
      "Cleaning up data",
      "Updating security",
      "Clearing login data",
      "Ending session",
      "Disconnecting",
      "Confirming sign-out",
      "Finalizing logout",
      "Almost finished",
      "Signing out securely",
      "Almost signed out",
      "Completing sign-out",
      "Returning to login",
      "Closing session",
      "Preparing login",
      "Almost signed out",
      "Finishing up",
      "Goodbye",
      "Ending session",
      "Clearing session state",
      "Removing cache",
      "Cleaning resources",
      "Securing account",
      "Closing workspace",
      "Finalizing cleanup",
      "Wrapping up session",
      "Completing sign-out",
      "Ending connection",
      "Finishing cleanup",
      "Closing session",
      "Returning to login",
      "Securing workspace",
      "Completing logout",
      "Closing connection",
      "Finalizing sign-out",
      "All done, signing out",
      "Saving preferences",
      "Preparing login page",
    ],
  };

  let animationFrameId = null;
  let animationRunId = 0;
  let activeType = null;

  function shuffleArray(array) {
    const shuffled = [...array];

    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
  }

  function createSVG(tag, properties, children = []) {
    const element = document.createElementNS(
      "http://www.w3.org/2000/svg",
      tag,
    );

    Object.entries(properties).forEach(([property, value]) => {
      element.setAttribute(property, value);
    });

    children.forEach((child) => element.appendChild(child));

    return element;
  }

  function createPhraseSvg(phrase, yOffset) {
    const text = createSVG("text", {
      fill: "#343a40",
      x: 50,
      y: yOffset,
      "font-size": 18,
      "font-family": "Arial",
    });

    text.textContent = `${phrase}...`;

    return text;
  }

  function createCheckSvg(yOffset, index) {
    const check = createSVG("polygon", {
      points:
        "21.661,7.643 13.396,19.328 9.429,15.361 7.075,17.714 13.745,24.384 24.345,9.708",
      fill: "#343a40",
      id: checkmarkIdPrefix + index,
    });

    const circleOutline = createSVG("path", {
      d: "M16,0C7.163,0,0,7.163,0,16s7.163,16,16,16s16-7.163,16-16S24.837,0,16,0z M16,30C8.28,30,2,23.72,2,16C2,8.28,8.28,2,16,2 c7.72,0,14,6.28,14,14C30,23.72,23.72,30,16,30z",
      fill: "#343a40",
    });

    const circle = createSVG("circle", {
      id: checkmarkCircleIdPrefix + index,
      fill: "#008B8B",
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

  function addPhrasesToDocument(phrases, container) {
    if (!container) {
      console.warn("[Loader] #phrases was not found.");
      return null;
    }

    container.replaceChildren();

    phrases.forEach((phrase, index) => {
      const yOffset = 30 + verticalSpacing * index;

      container.appendChild(createPhraseSvg(phrase, yOffset));
      container.appendChild(createCheckSvg(yOffset, index));
    });

    return container;
  }

  function easeInOut(timestamp) {
    const period = 200;
    return (Math.sin(timestamp / period + 100) + 1) / 2;
  }

  function stopAnimation() {
    // Invalidate callbacks from previous runs.
    animationRunId++;

    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  function start(type = "loading") {
    /*
     * Prevent duplicate starts for the same loader type.
     */
    if (activeType === type && animationFrameId !== null) {
      return;
    }

    const container = document.getElementById("phrases");

    if (!container) {
      console.warn("[Loader] #phrases was not found.");
      return;
    }

    const phrases = shuffleArray([...(phraseSets[type] || phraseSets.loading)]);

    stopAnimation();

    activeType = type;

    const runId = animationRunId;

    if (!addPhrasesToDocument(phrases, container)) {
      return;
    }

    let currentY = 0;
    let previousTimestamp = null;

    const checks = phrases.map((_, index) => ({
      check: document.getElementById(checkmarkIdPrefix + index),
      circle: document.getElementById(checkmarkCircleIdPrefix + index),
    }));

    const scrollDistance = phrases.length * verticalSpacing + 10;

    function animateLoading(timestamp) {
      if (runId !== animationRunId) {
        return;
      }

      if (previousTimestamp === null) {
        previousTimestamp = timestamp;
      }

      const delta = Math.min(timestamp - previousTimestamp, 50);

      previousTimestamp = timestamp;

      container.setAttribute("transform", `translate(0 ${currentY})`);

      currentY -= 1.35 * easeInOut(timestamp) * (delta / 16.67);

      checks.forEach(({ check, circle }, index) => {
        if (!check || !circle) {
          return;
        }

        const boundary = -index * verticalSpacing + verticalSpacing + 15;

        if (currentY < boundary) {
          const alpha = Math.max(
            0,
            Math.min(1, 1 - (currentY - boundary + 15) / 30),
          );

          circle.setAttribute("fill", "rgba(255, 255, 255, 1)");

          const green = Math.round(255 * (1 - alpha) + 120 * alpha);

          const blue = Math.round(255 * (1 - alpha) + 154 * alpha);

          check.setAttribute("fill", `rgba(255, ${green}, ${blue}, 1)`);
        }
      });

      if (currentY > -scrollDistance) {
        animationFrameId = requestAnimationFrame(animateLoading);

        return;
      }

      // Reset and loop through the phrases again.
      currentY = 0;
      previousTimestamp = timestamp;

      checks.forEach(({ check, circle }) => {
        if (!check || !circle) {
          return;
        }

        circle.setAttribute("fill", "#008B8B");
        check.setAttribute("fill", "#343a40");
      });

      animationFrameId = requestAnimationFrame(animateLoading);
    }

    animationFrameId = requestAnimationFrame(animateLoading);
  }

  function show(type = "loading") {
    document.body.classList.remove("loaded");
    start(type);
  }

  function hide() {
    document.body.classList.add("loaded");

    stopAnimation();

    activeType = null;
  }

  function restart(type = "loading") {
    stopAnimation();

    activeType = null;

    start(type);
  }

  return {
    start,
    show,
    hide,
    restart,
  };
})();

export { LoaderModule };