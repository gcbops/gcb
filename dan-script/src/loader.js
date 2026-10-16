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
      "Initializing application",
      "Loading workspace modules",
      "Preparing dashboard components",
      "Checking available services",
      "Fetching the latest records",
      "Processing workspace data",
      "Refreshing cached information",
      "Preparing client directory",
      "Loading performance metrics",
      "Updating activity status",
      "Preparing billing and hours",
      "Gathering summary information",
      "Synchronizing dashboard data",
      "Checking application settings",
      "Preparing page components",
      "Organizing workspace information",
      "Loading client activity",
      "Refreshing performance summaries",
      "Preparing analytics data",
      "Updating dashboard metrics",
      "Finalizing workspace setup",
      "Making everything ready",
    ],

    login: [
      "Signing you in",
      "Verifying your account",
      "Checking your access",
      "Validating your session",
      "Loading your permissions",
      "Preparing your workspace",
      "Retrieving your settings",
      "Loading your dashboard",
      "Almost ready",
      "Checking your Google account",
      "Confirming your identity",
      "Verifying your sign-in",
      "Establishing a secure session",
      "Checking your account status",
      "Validating your access rights",
      "Loading your role and capabilities",
      "Preparing your account profile",
      "Retrieving your workspace settings",
      "Applying your access permissions",
      "Checking available pages",
      "Preparing your navigation",
      "Initializing your session",
      "Securing your connection",
      "Loading your personalized settings",
      "Preparing your dashboard modules",
      "Confirming your workspace access",
      "Finalizing account verification",
      "Completing secure sign-in",
      "Getting your workspace ready",
      "Finishing your login",
    ],

    logout: [
      "Preparing to sign out",
      "Saving your session",
      "Checking active connections",
      "Securing your workspace",
      "Preparing your account for logout",
      "Clearing temporary application data",
      "Removing cached session details",
      "Releasing temporary resources",
      "Closing active application tasks",
      "Stopping background processes",
      "Cleaning up workspace data",
      "Updating session security",
      "Clearing login information",
      "Ending your active session",
      "Disconnecting from the server",
      "Confirming secure sign-out",
      "Finalizing account logout",
      "Almost finished",
      "Signing you out securely",
      "Logout is nearly complete",
      "Completing the sign-out process",
      "Returning to the login screen",
      "Your session is being closed",
      "Preparing a fresh login session",
      "You're almost signed out",
      "Finishing up",
      "Goodbye",
      "Ending your authenticated session",
      "Clearing temporary session state",
      "Removing session-related cache",
      "Cleaning up application resources",
      "Securing your account information",
      "Closing your workspace session",
      "Finalizing session cleanup",
      "Wrapping up your current session",
      "Completing account sign-out",
      "Preparing to end your connection",
      "Finishing account cleanup",
      "Making sure your session is closed",
      "Returning control to the login screen",
      "Your workspace is being secured",
      "Completing the logout process",
      "Closing your secure connection",
      "Your sign-out is being finalized",
      "All done, signing out",
    ],
  };

  let animationFrameId = null;
  let animationRunId = 0;

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
    const container = document.getElementById("phrases");

    if (!container) {
      console.warn("[Loader] #phrases was not found.");
      return;
    }

    const phrases = shuffleArray([...(phraseSets[type] || phraseSets.loading)]);

    stopAnimation();

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

    // Scroll through the entire phrase list before restarting.
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
        if (!check || !circle) {return;}

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

      // Finish this cycle and begin a new one.
      if (runId === animationRunId) {
        animationFrameId = null;
        start(type);
      }
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
  }

  return {
    start,
    show,
    hide,
  };
})();

export { LoaderModule };