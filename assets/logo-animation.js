(() => {
  'use strict';

  const ANIMATION_DURATION = 3000;

  function initLogoAnimation() {
    const scene = document.querySelector('#hero-logo-scene');
    const trigger = document.querySelector('#hero-logo-trigger');

    if (!scene || !trigger) return;

    let resetTimer = null;
    let isAnimating = false;

    const resetAnimation = () => {
      scene.classList.remove('is-logo-shooting');
      trigger.disabled = false;
      trigger.setAttribute('aria-label', 'Fai tirare il logo verso la porta');
      isAnimating = false;
    };

    const playAnimation = (event) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      if (isAnimating) return;
      isAnimating = true;

      window.clearTimeout(resetTimer);
      scene.classList.remove('is-logo-shooting');
      // force reflow so the animation can restart every time
      void scene.offsetWidth;
      scene.classList.add('is-logo-shooting');

      trigger.disabled = true;
      trigger.setAttribute('aria-label', 'Il logo sta tirando verso la porta');

      resetTimer = window.setTimeout(resetAnimation, ANIMATION_DURATION);
    };

    trigger.addEventListener('click', playAnimation, { passive: false });
    trigger.addEventListener('pointerup', playAnimation, { passive: false });
    trigger.addEventListener('touchend', playAnimation, { passive: false });
    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        playAnimation(event);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLogoAnimation);
  } else {
    initLogoAnimation();
  }
})();
