(() => {
  'use strict';

  const ANIMATION_DURATION = 3000;

  document.addEventListener('DOMContentLoaded', () => {
    const scene = document.querySelector('#hero-logo-scene');
    const trigger = document.querySelector('#hero-logo-trigger');

    if (!scene || !trigger) return;

    let resetTimer = null;

    const playAnimation = () => {
      if (scene.classList.contains('is-logo-shooting')) return;

      scene.classList.add('is-logo-shooting');
      trigger.disabled = true;
      trigger.setAttribute('aria-label', 'Il logo sta tirando verso la porta');

      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        scene.classList.remove('is-logo-shooting');
        trigger.disabled = false;
        trigger.setAttribute('aria-label', 'Fai tirare il logo verso la porta');
      }, ANIMATION_DURATION);
    };

    trigger.addEventListener('click', playAnimation);
  });
})();
